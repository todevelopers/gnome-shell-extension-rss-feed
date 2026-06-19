#!/usr/bin/env bash
set -euo pipefail

REPO="todevelopers/gnome-shell-extension-rss-feed"
UUID="rss-feed@gnome-shell-extension.todevelopers.github.com"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

[ "${XDG_SESSION_TYPE:-}" = "wayland" ] || [ "${XDG_SESSION_TYPE:-}" = "x11" ] || { echo "error: GNOME session required" >&2; exit 1; }

echo "Fetching latest release..."
DOWNLOAD_URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -oE '"browser_download_url":[[:space:]]*"[^"]+\.zip"' \
    | grep -oE 'https://[^"]+')

[ -n "$DOWNLOAD_URL" ] || { echo "error: release artifact not found" >&2; exit 1; }

echo "Downloading $DOWNLOAD_URL..."
curl -fsSL -o "$TMP/$UUID.zip" "$DOWNLOAD_URL"

echo "Installing..."
gnome-extensions install --force "$TMP/$UUID.zip"
gnome-extensions enable "$UUID" 2>/dev/null || true

echo "Logging out to restart GNOME Shell..."
gnome-session-quit --logout --no-prompt
