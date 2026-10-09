#!/usr/bin/env bash
set -euo pipefail

UUID="rss-feed@gnome-shell-extension.todevelopers.github.com"
INDICATOR="Main.panel.statusArea.rssFeedMenu"
THEME="dark"
RUN_TIMEOUT=180
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
    local id=$1 desc=$2 result=PASS msg
    shift 2
    msg=$("$@" 2>&1) || result=FAIL
    msg=$(echo "$msg" | tr '\t\n' '  ')
    say "[$id] $desc ... $result"
    if [ "$result" = FAIL ] && [ -n "$msg" ]; then
        say "        $msg"
    fi
    printf '%s\t%s\t%s\t%s\n' "$id" "$result" "$desc" "$msg" >> "$OUT/results.tsv"
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

    export HOME="$TMP/home"
    export XDG_CONFIG_HOME="$HOME/.config"
    export XDG_DATA_HOME="$HOME/.local/share"
    export XDG_CACHE_HOME="$HOME/.cache"
    export XDG_STATE_HOME="$HOME/.local/state"
    export XDG_RUNTIME_DIR="$TMP/runtime"
    # gvfsd would mount FUSE inside the runtime dir and block its removal
    export GVFS_DISABLE_FUSE=1
    unset DISPLAY WAYLAND_DISPLAY XAUTHORITY

    ext="$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
    mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$ext"
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

gvariant_string() {
    local s=${1//\\/\\\\}
    printf '"%s"' "${s//\"/\\\"}"
}

shell_eval() {
    timeout 15 gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval "$(gvariant_string "$1")"
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

open_popup() {
    shell_eval "$INDICATOR.menu.open()" > /dev/null && wait_for "$INDICATOR.menu.isOpen" 5
}

close_popup() {
    shell_eval "$INDICATOR.menu.close()" > /dev/null && wait_for "!$INDICATOR.menu.isOpen" 5
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

stop_shell() {
    local deadline=$((SECONDS + 10))
    [ -n "$SHELL_PID" ] || return 0
    kill "$SHELL_PID" 2> /dev/null || return 0
    while kill -0 "$SHELL_PID" 2> /dev/null && [ "$SECONDS" -lt "$deadline" ]; do
        sleep 0.2
    done
    kill -9 "$SHELL_PID" 2> /dev/null || true
}

session() {
    SHELL_PID=""
    trap stop_shell EXIT

    check 00-01 "isolated GSettings profile accepts the test settings" seed_settings

    # shellcheck disable=SC2086
    gnome-shell $SHELL_ARGS >> "$OUT/full.log" 2>&1 &
    SHELL_PID=$!

    check 00-02 "headless gnome-shell answers Eval" wait_for "1 + 1 === 2" 60
    check 00-03 "shell startup finished" wait_for "Main.layoutManager._startingUp === false" 60
    check 00-04 "extension is enabled without error" extension_enabled
    check 00-05 "panel indicator is on the panel" wait_for "$INDICATOR?.mapped === true" 10
    check 00-06 "overview closes" hide_overview
    check 00-07 "screenshot: top panel shows the RSS icon" screenshot 00-07_panel
    check 00-08 "popup opens" open_popup
    check 00-09 "screenshot: popup shows the header with status Idle" screenshot 00-09_popup-open
    check 00-10 "popup closes" close_popup

    touch "$TMP/session-done"
}

log_is_clean() {
    local errors
    errors=$(grep -v '^\[e2e\]' "$OUT/full.log" | grep 'rss-feed' |
        grep -E 'ERROR|CRITICAL|WARNING|already disposed|\.js:[0-9]' | head -n 20) || true
    if [ -n "$errors" ]; then
        echo "$errors"
        return 1
    fi
}

write_report() {
    local id result desc msg
    {
        echo "# RSS Feed e2e run $STAMP"
        echo
        echo "## Environment"
        echo
        echo "- Distro: $DISTRO"
        echo "- Shell: $SHELL_VERSION, session mode ${GNOME_SHELL_SESSION_MODE:-user}"
        echo "- Shell flags: $SHELL_ARGS"
        echo "- Extension: $EXT_VERSION from $EXT_DIR"
        echo "- Theme: $THEME, animations off"
        echo
        echo "## Results"
        echo
        echo "| Step | Result | Check | Message |"
        echo "| --- | --- | --- | --- |"
        while IFS=$'\t' read -r id result desc msg; do
            echo "| $id | $result | $desc | ${msg//|/\\|} |"
        done < "$OUT/results.tsv"
        echo
        echo "## Shell log (filtered)"
        echo
        echo '```'
        grep -v '^\[e2e\]' "$OUT/full.log" | grep -E 'rss-feed|JS ERROR|already disposed' || true
        echo '```'
    } > "$OUT/report.md"
}

cleanup() {
    if [ -n "$SESSION_PID" ] && kill -TERM -- "-$SESSION_PID" 2> /dev/null; then
        sleep 2
        kill -KILL -- "-$SESSION_PID" 2> /dev/null || true
    fi
    rm -rf "$TMP"
}

main() {
    local cmd status=0

    for cmd in gnome-shell gdbus gsettings dbus-run-session glib-compile-schemas setsid timeout tar; do
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

    prepare_profile
    export UUID INDICATOR THEME OUT TMP SHELL_ARGS SHELL_MAJOR

    # piped through curl there is no script file to run again inside the session, so the functions go in as text
    setsid timeout -k 5 "$RUN_TIMEOUT" dbus-run-session -- bash -c "$(declare -f); set -euo pipefail; session" &
    SESSION_PID=$!
    wait "$SESSION_PID" || say "session ended with status $?"

    check 00-11 "shell log has no rss-feed errors" log_is_clean
    if [ ! -f "$TMP/session-done" ]; then
        say "session did not finish (crash or ${RUN_TIMEOUT}s timeout)"
        status=1
    fi
    if grep -q "$(printf '\tFAIL\t')" "$OUT/results.tsv"; then
        status=1
    fi

    write_report
    tar -czf "$OUT.tar.gz" -C "$(dirname "$OUT")" "$STAMP"
    echo "$OUT.tar.gz"
    return "$status"
}

main "$@"
