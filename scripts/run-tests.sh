#!/usr/bin/env bash
set -euo pipefail

REPO="todevelopers/gnome-shell-extension-rss-feed"
BRANCH="master"
UUID="rss-feed@gnome-shell-extension.todevelopers.github.com"
INDICATOR="Main.panel.statusArea.rssFeedMenu"
HARNESS_SCRIPTS="driver.js prefs.js scenarios.js scenarios-prefs.js"
HARNESS_FILES="$HARNESS_SCRIPTS feeds.py"
THEMES="dark light"
SCENARIOS="smoke lifecycle panel header classic minimal feeds starred dismiss notifications appearance prefs sources actions opml"
SCENARIO_TIMEOUT=360
RUN_TIMEOUT=500
SESSION_PID=""
FEEDS_PID=""

fail() {
    echo "error: $*" >&2
    exit 1
}

# fd 3 is the terminal: inside a session stdout and stderr go to the log
say() {
    { echo "$*" >&3; } 2> /dev/null || echo "$*"
    echo "[e2e] $*" >> "$OUT/full.log"
}

check() {
    local id=$1 desc=$2 msg
    shift 2
    LAST=PASS
    msg=$("$@" 2>&1) || LAST=FAIL
    msg=$(echo "$msg" | tr '\t\n' '  ')
    say "[$THEME $SCENARIO $id] $desc ... $LAST"
    if [ "$LAST" = FAIL ] && [ -n "$msg" ]; then
        say "        $msg"
    fi
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$THEME" "$SCENARIO" "$id" "$LAST" "$desc" "$msg" >> "$OUT/results.tsv"
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

# GitHub leaves export-ignore paths out of its tarballs, so the harness files are fetched one by one
fetch_harness() {
    local dir file
    dir=$(dirname "${BASH_SOURCE[0]:-.}")/../tests/e2e
    HARNESS="$TMP/harness"
    mkdir "$HARNESS"
    for file in $HARNESS_FILES; do
        if [ -f "$dir/$file" ]; then
            cp "$dir/$file" "$HARNESS/$file"
        else
            curl -fsSL "https://raw.githubusercontent.com/$REPO/$BRANCH/tests/e2e/$file" -o "$HARNESS/$file" ||
                fail "cannot download tests/e2e/$file"
        fi
    done
}

start_feeds() {
    local deadline=$((SECONDS + 10))
    python3 "$HARNESS/feeds.py" --port-file "$TMP/feed-port" --state-file "$TMP/feed-state.json" >> "$OUT/full.log" 2>&1 &
    FEEDS_PID=$!
    while [ ! -s "$TMP/feed-port" ] && [ "$SECONDS" -lt "$deadline" ]; do
        sleep 0.2
    done
    [ -s "$TMP/feed-port" ] || fail "the mock feed server did not start, see $OUT/full.log"
    FEED_BASE="http://127.0.0.1:$(cat "$TMP/feed-port")"
}

prepare_profile() {
    local ext

    export PROFILE="$TMP/$THEME-$SCENARIO"
    export HOME="$PROFILE/home"
    export XDG_CONFIG_HOME="$HOME/.config"
    export XDG_DATA_HOME="$HOME/.local/share"
    export XDG_CACHE_HOME="$HOME/.cache"
    export XDG_STATE_HOME="$HOME/.local/state"
    export XDG_RUNTIME_DIR="$PROFILE/runtime"
    # gvfsd would mount FUSE inside the runtime dir and block its removal
    export GVFS_DISABLE_FUSE=1
    # without the settings portal libadwaita reads the colour scheme from GSettings only when told so
    export ADW_DISABLE_PORTAL=1
    unset DISPLAY WAYLAND_DISPLAY XAUTHORITY

    ext="$XDG_DATA_HOME/gnome-shell/extensions/$UUID"
    # Ubuntu's desktop icons log a JS error when ~/Desktop is missing
    mkdir -p "$XDG_CONFIG_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME" "$XDG_DATA_HOME/applications" "$XDG_DATA_HOME/dbus-1/services" \
        "$HOME/Desktop" "$ext"
    mkdir -m 700 "$XDG_RUNTIME_DIR"
    # the desktop portal brings a file chooser that differs between distros and a FUSE mount in the runtime dir;
    # with the service masked GTK uses its built-in file chooser and reads its settings from GSettings
    printf '%s\n' '[D-BUS Service]' 'Name=org.freedesktop.portal.Desktop' 'Exec=/bin/false' \
        > "$XDG_DATA_HOME/dbus-1/services/org.freedesktop.portal.Desktop.service"
    cp -r "$EXT_DIR/." "$ext/"
    glib-compile-schemas "$ext/schemas"
    # without GDM a fresh profile gets a "Screen Lock disabled" banner over the panel
    touch "$XDG_DATA_HOME/gnome-shell/lock-warning-shown"

    # opening an article must not start a real browser: this handler only writes the URL down for the tests
    printf '%s\n' '#!/bin/sh' "printf '%s\\n' \"\$1\" >> '$PROFILE/opened-urls'" > "$PROFILE/open-url"
    printf '%s\n' '[Desktop Entry]' 'Type=Application' 'Name=E2E Browser' "Exec=/bin/sh $PROFILE/open-url %u" \
        'NoDisplay=true' 'MimeType=x-scheme-handler/http;x-scheme-handler/https;' > "$XDG_DATA_HOME/applications/e2e-browser.desktop"
    printf '%s\n' '[Default Applications]' 'x-scheme-handler/http=e2e-browser.desktop' \
        'x-scheme-handler/https=e2e-browser.desktop' > "$XDG_CONFIG_HOME/mimeapps.list"
}

seed_settings() {
    gsettings set org.gnome.shell enabled-extensions "['$UUID']" &&
        gsettings set org.gnome.shell welcome-dialog-last-shown-version "'4294967295'" &&
        gsettings set org.gnome.desktop.interface color-scheme "'prefer-$THEME'" &&
        gsettings set org.gnome.desktop.interface enable-animations false &&
        gsettings set org.gnome.desktop.screensaver lock-enabled false &&
        gsettings set org.gnome.desktop.session idle-delay 0 &&
        gsettings set org.gnome.desktop.background picture-options "'none'" &&
        gsettings set org.gnome.desktop.background primary-color "'#5b6770'" &&
        gsettings set org.gnome.desktop.input-sources sources "[('xkb', 'us')]" &&
        [ "$(gsettings get org.gnome.shell enabled-extensions)" = "['$UUID']" ]
}

# on the real system bus the shell registers with GDM, polkit and logind on behalf of the desktop session
start_system_bus() {
    local socket="$XDG_RUNTIME_DIR/system-bus"
    local deadline=$((SECONDS + 5))
    printf '%s\n' '<busconfig>' "<listen>unix:path=$socket</listen>" '<policy context="default">' \
        '<allow send_destination="*" eavesdrop="true"/>' '<allow eavesdrop="true"/>' '<allow own="*"/>' \
        '</policy>' '</busconfig>' > "$PROFILE/system-bus.conf"
    # the stock session configuration would start session services such as the snap store on this bus
    dbus-daemon --config-file="$PROFILE/system-bus.conf" --nofork >> "$OUT/full.log" 2>&1 &
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
    local limit=${2:-15}
    timeout "$((limit + 5))" gdbus call --session --timeout "$limit" --dest org.gnome.Shell --object-path /org/gnome/Shell \
        --method org.gnome.Shell.Eval "$(gvariant_string "$1")"
}

eval_true() {
    local answer
    answer=$(shell_eval "$1" "${2:-15}" 2>&1) || true
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

# the files are plain scripts read and evaluated inside the shell, so Main and the gi imports of the Eval call are in scope
load_driver() {
    local file config="{out: '$OUT', theme: '$THEME', scenario: '$SCENARIO', major: $SHELL_MAJOR, uuid: '$UUID', base: '$FEED_BASE'"
    config="$config, profile: '$PROFILE', feedState: '$TMP/feed-state.json'}"
    for file in $HARNESS_SCRIPTS; do
        if ! eval_true "(eval(new TextDecoder().decode(GLib.file_get_contents('$HARNESS/$file')[1])), true)"; then
            echo "while loading $file"
            return 1
        fi
        # the other files build on a driver that has its configuration
        if [ "$file" = driver.js ]; then
            eval_true "e2e.init($config)" || return 1
        fi
    done
}

run_scenario() {
    local mark theme scenario id result desc msg
    mark=$(wc -l < "$OUT/results.tsv")
    RUN_STATUS=0
    RUN_MESSAGE=$(eval_true "e2e.run('$SCENARIO')" "$SCENARIO_TIMEOUT") || RUN_STATUS=$?
    tail -n "+$((mark + 1))" "$OUT/results.tsv" | while IFS=$'\t' read -r theme scenario id result desc msg; do
        say "[$theme $scenario $id] $desc ... $result"
        if [ "$result" = FAIL ]; then
            say "        $msg"
        fi
    done
}

scenario_finished() {
    echo "$RUN_MESSAGE"
    return "$RUN_STATUS"
}

log_is_clean() {
    local errors
    # the feeds that the scenarios break on purpose are the expected HTTP failures
    errors=$(tail -n "+$LOG_START" "$OUT/full.log" | grep -v -E "^\[(e2e|feeds)\]|/(404|garbage|gone[0-9]+)\.xml|for URL 'not a url'" |
        grep -E 'already disposed|rss-feed.*(ERROR|CRITICAL|WARNING|\.js:[0-9])|(ERROR|CRITICAL|WARNING).*rss-feed' | head -n 20) || true
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
    : > "$TMP/feed-state.json"

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

    # services that D-Bus starts later, like the preferences window, need the display of this shell
    gdbus call --session --dest org.freedesktop.DBus --object-path /org/freedesktop/DBus \
        --method org.freedesktop.DBus.UpdateActivationEnvironment "{'WAYLAND_DISPLAY': 'wayland-0'}" > /dev/null 2>&1 || true

    check 00-07 "test driver loads into the shell" load_driver
    if [ "$LAST" = PASS ]; then
        run_scenario
        check 00-08 "scenario runs to its end" scenario_finished
    fi

    stop_shell
    check 00-09 "shell log has no rss-feed errors" log_is_clean
    touch "$PROFILE/session-done"
}

write_report() {
    local theme scenario id result desc msg
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
        echo "- Themes: $THEMES, animations off, plain background"
        echo "- Scenarios: $SCENARIOS"
        echo "- Steps: $(grep -c "$(printf '\tPASS\t')" "$OUT/results.tsv" || true) passed, $(grep -c "$(printf '\tFAIL\t')" "$OUT/results.tsv" || true) failed"
        echo
        echo "## Failed steps"
        echo
        echo "| Theme | Scenario | Step | Check | Message |"
        echo "| --- | --- | --- | --- | --- |"
        while IFS=$'\t' read -r theme scenario id result desc msg; do
            if [ "$result" = FAIL ]; then
                echo "| $theme | $scenario | $id | $desc | ${msg//|/\\|} |"
            fi
        done < "$OUT/results.tsv"
        echo
        echo "## All steps"
        echo
        echo "| Theme | Scenario | Step | Result | Check | Message |"
        echo "| --- | --- | --- | --- | --- | --- |"
        while IFS=$'\t' read -r theme scenario id result desc msg; do
            echo "| $theme | $scenario | $id | $result | $desc | ${msg//|/\\|} |"
        done < "$OUT/results.tsv"
        echo
        echo "## Not automated"
        echo
        echo "- Lock screen (11), log out and in, Shell restart (parts of 1)"
        echo "- Preferences: the file chooser is the one built into GTK (the desktop portal is masked), the colour scheme comes from GSettings"
        echo
        echo "## Shell log (filtered)"
        echo
        echo '```'
        grep -v -E '^\[(e2e|feeds)\]' "$OUT/full.log" | grep -E 'rss-feed|JS ERROR|already disposed' || true
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

run_session() {
    local start=$PWD

    prepare_profile

    # the file chooser of the preferences window opens in the working directory, which must not be a real one
    cd "$HOME"

    # piped through curl there is no script file to run again inside the session, so the functions go in as text;
    # the session bus and the services it starts are noisy, their output belongs in the log and not between the steps
    setsid timeout -k 5 "$RUN_TIMEOUT" dbus-run-session -- bash -c "$(declare -f); set -euo pipefail; session" >> "$OUT/full.log" 2>&1 &
    SESSION_PID=$!
    wait "$SESSION_PID" || say "$THEME $SCENARIO session ended with status $?"
    kill_session
    cd "$start"

    [ -f "$PROFILE/session-done" ]
}

cleanup() {
    kill_session
    if [ -n "$FEEDS_PID" ]; then
        kill "$FEEDS_PID" 2> /dev/null || true
    fi
    rm -rf "$TMP" 2> /dev/null || true
}

main() {
    local cmd status=0

    exec 3>&1

    while [ $# -gt 0 ]; do
        case "$1" in
            --only)
                SCENARIOS=${2//,/ }
                shift 2
                ;;
            --theme)
                [ "$2" = both ] || THEMES=$2
                shift 2
                ;;
            *) fail "unknown option $1 (use --only smoke,header and --theme dark|light|both)" ;;
        esac
    done

    for cmd in gnome-shell gjs gdbus gsettings dbus-run-session dbus-daemon glib-compile-schemas python3 curl setsid timeout tar; do
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

    fetch_harness
    start_feeds

    export UUID INDICATOR OUT TMP SHELL_ARGS SHELL_MAJOR HARNESS HARNESS_SCRIPTS FEED_BASE SCENARIO_TIMEOUT
    for THEME in $THEMES; do
        for SCENARIO in $SCENARIOS; do
            export THEME SCENARIO
            # one broken session must not cost the report of all the others
            if ! run_session; then
                say "$THEME $SCENARIO session did not run to the end"
                status=1
            fi
            # services of the session can still be writing while they shut down
            rm -rf "$PROFILE" 2> /dev/null || true
        done
    done

    if grep -q "$(printf '\tFAIL\t')" "$OUT/results.tsv"; then
        status=1
    fi

    if [ -s "$OUT/manifest.jsonl" ]; then
        {
            echo '['
            paste -sd, "$OUT/manifest.jsonl"
            echo ']'
        } > "$OUT/manifest.json"
        rm "$OUT/manifest.jsonl"
    fi

    write_report
    tar -czf "$OUT.tar.gz" -C "$(dirname "$OUT")" "$STAMP"
    echo "$OUT.tar.gz"
    return "$status"
}

main "$@"
