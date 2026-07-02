#!/usr/bin/env bash
set -euo pipefail

REPO="todevelopers/gnome-shell-extension-rss-feed"
BRANCH="master"
UUID="rss-feed@gnome-shell-extension.todevelopers.github.com"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

[ "${XDG_SESSION_TYPE:-}" = "wayland" ] || [ "${XDG_SESSION_TYPE:-}" = "x11" ] || { echo "error: GNOME session required" >&2; exit 1; }

echo "Cloning latest commit from $BRANCH..."
git clone --depth 1 --branch "$BRANCH" "https://github.com/$REPO.git" "$TMP/src"

echo "Packaging..."
git -C "$TMP/src" archive HEAD --format=zip -o "$TMP/$UUID.zip"

echo "Installing..."
gnome-extensions install --force "$TMP/$UUID.zip"
gnome-extensions enable "$UUID" 2>/dev/null || true

echo "Logging out to restart GNOME Shell..."
gnome-session-quit --logout --no-prompt
