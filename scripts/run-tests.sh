#!/usr/bin/env bash
set -euo pipefail

UUID="rss-feed@gnome-shell-extension.todevelopers.github.com"
INDICATOR="Main.panel.statusArea.rssFeedMenu"
THEMES="dark light"
RUN_TIMEOUT=240
SESSION_PID=""

fail() {
    echo "error: $*" >&2
    exit 1
}

say() {
    echo "$*"
    echo "[e2e] $*" >> "$OUT/full.log"
}

check() {
    local id=$1 desc=$2 msg
    shift 2
    LAST=PASS
    msg=$("$@" 2>&1) || LAST=FAIL
    msg=$(echo "$msg" | tr '\t\n' '  ')
    say "[$THEME $id] $desc ... $LAST"
    if [ "$LAST" = FAIL ] && [ -n "$msg" ]; then
        say "        $msg"
    fi
    printf '%s\t%s\t%s\t%s\t%s\n' "$THEME" "$id" "$LAST" "$desc" "$msg" >> "$OUT/results.tsv"
}

find_extension() {
    local dir
    for dir in "${XDG_DATA_HOME:-$HOME/.local/share}" /usr/local/share /usr/share; do
        if [ -f "$dir/gnome-shell/extensions/$UUID/metadata.json" ]; then
            echo "$dir/gnome-shell/extensions/$UUID"
            return 0
        fi
    done
    return 1
}

prepare_profile() {
    local ext

    export PROFILE="$TMP/$THEME"
    export HOME="$PROFILE/home"
    export XDG_CONFIG_HOME="$HOME/.config"
    export XDG_DATA_HOME="$HOME/.local/share"
    export XDG_CACHE_HOME="$HOME/.cache"
    export XDG_STATE_HOME="$HOME/.local/state"
    export XDG_RUNTIME_DIR="$PROFILE/runtime"
    # gvfsd would mount FUSE inside the runtime dir and block its removal
    export GVFS_DISABLE_FUSE=1
    unset DISPLAY WAYLAND_DISPLAY XAUTHORITY

    ext="$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
    # Ubuntu's desktop icons log a JS error when ~/Desktop is missing
    mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$HOME/Desktop" "$ext"
    mkdir -m 700 "$XDG_RUNTIME_DIR"
    cp -r "$EXT_DIR/." "$ext/"
    glib-compile-schemas "$ext/schemas"
    # without GDM a fresh profile gets a "Screen Lock disabled" banner over the panel
    touch "$XDG_DATA_HOME/gnome-shell/lock-warning-shown"
}

seed_settings() {
    gsettings set org.gnome.shell enabled-extensions "['$UUID']" &&
        gsettings set org.gnome.shell welcome-dialog-last-shown-version "'4294967295'" &&
        gsettings set org.gnome.desktop.interface color-scheme "'prefer-$THEME'" &&
        gsettings set org.gnome.desktop.interface enable-animations false &&
        gsettings set org.gnome.desktop.screensaver lock-enabled false &&
        gsettings set org.gnome.desktop.session idle-delay 0 &&
        [ "$(gsettings get org.gnome.shell enabled-extensions)" = "['$UUID']" ]
}

# on the real system bus the shell registers with GDM, polkit and logind on behalf of the desktop session
start_system_bus() {
    local socket="$XDG_RUNTIME_DIR/system-bus"
    local deadline=$((SECONDS + 5))
    dbus-daemon --session --nofork --address="unix:path=$socket" >> "$OUT/full.log" 2>&1 &
    BUS_PID=$!
    while [ ! -S "$socket" ] && [ "$SECONDS" -lt "$deadline" ]; do
        sleep 0.1
    done
    export DBUS_SYSTEM_BUS_ADDRESS="unix:path=$socket"
}

start_shell() {
    # shellcheck disable=SC2086
    gnome-shell $SHELL_ARGS >> "$OUT/full.log" 2>&1 &
    SHELL_PID=$!
}

stop_shell() {
    local deadline=$((SECONDS + 10))
    [ -n "$SHELL_PID" ] || return 0
    if kill "$SHELL_PID" 2> /dev/null; then
        while kill -0 "$SHELL_PID" 2> /dev/null && [ "$SECONDS" -lt "$deadline" ]; do
            sleep 0.2
        done
        kill -9 "$SHELL_PID" 2> /dev/null || true
    fi
    SHELL_PID=""
}

gvariant_string() {
    local s=${1//\\/\\\\}
    printf '"%s"' "${s//\"/\\\"}"
}

shell_eval() {
    timeout 15 gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval "$(gvariant_string "$1")"
}

eval_true() {
    local answer
    answer=$(shell_eval "$1" 2>&1) || true
    if [ "$answer" != "(true, 'true')" ]; then
        echo "$answer"
        return 1
    fi
}

wait_for() {
    local js=$1 limit=${2:-10} answer=""
    local deadline=$((SECONDS + limit))
    while [ "$SECONDS" -lt "$deadline" ]; do
        if ! kill -0 "$SHELL_PID" 2> /dev/null; then
            echo "gnome-shell is not running"
            return 1
        fi
        answer=$(shell_eval "$js" 2>&1) || true
        if [ "$answer" = "(true, 'true')" ]; then
            return 0
        fi
        sleep 0.3
    done
    echo "timed out after ${limit}s, last answer: $answer"
    return 1
}

shell_ready() {
    wait_for "1 + 1 === 2" 30 && wait_for "Main.layoutManager._startingUp === false" 30
}

extension_enabled() {
    if wait_for "Main.extensionManager.lookup('$UUID')?.state === 1" 20; then
        return 0
    fi
    shell_eval "(e => e ? {state: e.state, error: String(e.error ?? '')} : 'not found')(Main.extensionManager.lookup('$UUID'))"
    return 1
}

hide_overview() {
    shell_eval "Main.overview.hide()" > /dev/null &&
        wait_for "!Main.overview.visible && !Main.overview.animationInProgress" 10
}

create_input_devices() {
    local js='(() => {
        const {Clutter} = imports.gi;
        const backend = Clutter.get_default_backend ? Clutter.get_default_backend() : global.stage.context.get_backend();
        const seat = backend.get_default_seat();
        const pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
        const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        globalThis.e2e = {
            click(actor, button = Clutter.BUTTON_PRIMARY) {
                const [x, y] = actor.get_transformed_position();
                const [w, h] = actor.get_transformed_size();
                pointer.notify_absolute_motion(GLib.get_monotonic_time(), x + w / 2, y + h / 2);
                pointer.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.PRESSED);
                pointer.notify_button(GLib.get_monotonic_time(), button, Clutter.ButtonState.RELEASED);
            },
            key(keyval) {
                keyboard.notify_keyval(GLib.get_monotonic_time(), keyval, Clutter.KeyState.PRESSED);
                keyboard.notify_keyval(GLib.get_monotonic_time(), keyval, Clutter.KeyState.RELEASED);
            },
        };
        return true;
    })()'
    eval_true "${js//$'\n'/ }"
}

click_indicator() {
    eval_true "(e2e.click($INDICATOR), true)" && wait_for "$INDICATOR.menu.isOpen" 5
}

press_escape() {
    eval_true "(e2e.key(imports.gi.Clutter.KEY_Escape), true)" && wait_for "!$INDICATOR.menu.isOpen" 5
}

screenshot() {
    local file="$OUT/g${SHELL_MAJOR}_${THEME}_$1.png" answer
    # a menu opened by the previous step is laid out on the next frame
    sleep 0.5
    answer=$(timeout 15 gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell/Screenshot \
        --method org.gnome.Shell.Screenshot.Screenshot false false "$(gvariant_string "$file")" 2>&1) || true
    case "$answer" in
        "(true,"*) ;;
        *)
            echo "screenshot failed: $answer"
            return 1
            ;;
    esac
    if [ ! -s "$file" ]; then
        echo "screenshot file is empty: $file"
        return 1
    fi
}

log_is_clean() {
    local errors
    errors=$(tail -n "+$LOG_START" "$OUT/full.log" | grep -v '^\[e2e\]' | grep 'rss-feed' |
        grep -E 'ERROR|CRITICAL|WARNING|already disposed|\.js:[0-9]' | head -n 20) || true
    if [ -n "$errors" ]; then
        echo "$errors"
        return 1
    fi
}

session() {
    SHELL_PID=""
    BUS_PID=""
    LOG_START=$(($(wc -l < "$OUT/full.log") + 1))
    trap 'stop_shell; kill "$BUS_PID" 2> /dev/null || true' EXIT

    check 00-01 "isolated GSettings profile accepts the test settings" seed_settings

    start_system_bus
    start_shell
    check 00-02 "headless gnome-shell starts on a private system bus" shell_ready
    if [ "$LAST" = FAIL ]; then
        stop_shell
        unset DBUS_SYSTEM_BUS_ADDRESS
        start_shell
        check 00-03 "headless gnome-shell starts on the real system bus" shell_ready
    fi
    if [ "$LAST" = FAIL ]; then
        return 0
    fi

    check 00-04 "extension is enabled without error" extension_enabled
    check 00-05 "panel indicator is on the panel" wait_for "$INDICATOR?.mapped === true" 10
    check 00-06 "overview closes" hide_overview
    check 00-07 "screenshot: top panel shows the RSS icon" screenshot 00-07_panel
    check 00-08 "virtual pointer and keyboard are created" create_input_devices
    check 00-09 "real click on the panel icon opens the popup" click_indicator
    check 00-10 "screenshot: open popup with an empty feed list" screenshot 00-10_popup-open
    check 00-11 "Escape key closes the popup" press_escape

    stop_shell
    check 00-12 "shell log has no rss-feed errors" log_is_clean
    touch "$PROFILE/session-done"
}

write_report() {
    local theme id result desc msg
    {
        echo "# RSS Feed e2e run $STAMP"
        echo
        echo "## Environment"
        echo
        echo "- Distro: $DISTRO"
        echo "- Shell: $SHELL_VERSION, session mode ${GNOME_SHELL_SESSION_MODE:-user}"
        echo "- Shell flags: $SHELL_ARGS"
        echo "- System bus: private (step 00-03 is listed only when the shell needed the real one)"
        echo "- Extension: $EXT_VERSION from $EXT_DIR"
        echo "- Themes: $THEMES, animations off"
        echo
        echo "## Results"
        echo
        echo "| Theme | Step | Result | Check | Message |"
        echo "| --- | --- | --- | --- | --- |"
        while IFS=$'\t' read -r theme id result desc msg; do
            echo "| $theme | $id | $result | $desc | ${msg//|/\\|} |"
        done < "$OUT/results.tsv"
        echo
        echo "## Shell log (filtered)"
        echo
        echo '```'
        grep -v '^\[e2e\]' "$OUT/full.log" | grep -E 'rss-feed|JS ERROR|already disposed' || true
        echo '```'
    } > "$OUT/report.md"
}

kill_session() {
    if [ -n "$SESSION_PID" ] && kill -TERM -- "-$SESSION_PID" 2> /dev/null; then
        sleep 2
        kill -KILL -- "-$SESSION_PID" 2> /dev/null || true
    fi
    SESSION_PID=""
}

cleanup() {
    kill_session
    rm -rf "$TMP"
}

main() {
    local cmd status=0

    for cmd in gnome-shell gdbus gsettings dbus-run-session dbus-daemon glib-compile-schemas setsid timeout tar; do
        command -v "$cmd" > /dev/null || fail "$cmd not found"
    done

    EXT_DIR=$(find_extension) || fail "$UUID is not installed, run scripts/clone.sh first"
    EXT_VERSION=$(sed -n 's/.*"version-name"[^"]*"\([^"]*\)".*/\1/p' "$EXT_DIR/metadata.json")
    DISTRO=$(. /etc/os-release 2> /dev/null && echo "$PRETTY_NAME") || DISTRO="unknown"
    SHELL_VERSION=$(gnome-shell --version)
    SHELL_MAJOR=$(echo "$SHELL_VERSION" | sed 's/[^0-9]*\([0-9]*\).*/\1/')

    # --unsafe-mode is hidden from --help, so only the visible flags can be detected
    SHELL_ARGS="--headless --unsafe-mode --virtual-monitor 1920x1080"
    case "$(gnome-shell --help-all 2>&1 || true)" in
        *--no-x11*) SHELL_ARGS="$SHELL_ARGS --no-x11" ;;
    esac

    STAMP=$(date +%Y%m%d-%H%M%S)
    OUT="$HOME/rss-feed-e2e/$STAMP"
    mkdir -p "$OUT"
    : > "$OUT/results.tsv"
    TMP=$(mktemp -d)
    trap 'exit 130' INT TERM
    trap cleanup EXIT

    say "Extension $EXT_VERSION at $EXT_DIR"
    say "$SHELL_VERSION on $DISTRO"

    export UUID INDICATOR OUT SHELL_ARGS SHELL_MAJOR
    for THEME in $THEMES; do
        export THEME
        prepare_profile

        # piped through curl there is no script file to run again inside the session, so the functions go in as text
        setsid timeout -k 5 "$RUN_TIMEOUT" dbus-run-session -- bash -c "$(declare -f); set -euo pipefail; session" &
        SESSION_PID=$!
        wait "$SESSION_PID" || say "$THEME session ended with status $?"
        kill_session

        if [ ! -f "$PROFILE/session-done" ]; then
            say "$THEME session did not run to the end"
            status=1
        fi
    done

    if grep -q "$(printf '\tFAIL\t')" "$OUT/results.tsv"; then
        status=1
    fi

    write_report
    tar -czf "$OUT.tar.gz" -C "$(dirname "$OUT")" "$STAMP"
    echo "$OUT.tar.gz"
    return "$status"
}

main "$@"
