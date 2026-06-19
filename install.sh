#!/usr/bin/env bash
set -euo pipefail

REPO="todevelopers/gnome-shell-extension-rss-feed"
UUID="rss-feed@gnome-shell-extension.todevelopers.github.com"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

[ -n "${WAYLAND_DISPLAY:-}" ] || { echo "error: Wayland session required" >&2; exit 1; }

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

echo "Restarting GNOME Shell..."
busctl --user call org.gnome.Shell /org/gnome/Shell org.gnome.Shell Eval s \
    'Meta.restart("Restarting...", global.context)' >/dev/null 2>&1 || true
