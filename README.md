<p align="center">
  <img width="64" height="64" src="https://github.com/user-attachments/assets/66743a26-2dfa-447a-920c-3efe6647b2a1" alt="rss-icon-card">
</p>

# RSS Feed - GNOME Shell Extension

[![ESLint](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/tommy-gun/87195eb23e76eae80cd14a6d80e56072/raw/eslint.json&cacheSeconds=0)](https://github.com/todevelopers/gnome-shell-extension-rss-feed/actions/workflows/ci.yml?query=branch%3Amaster)
[![shexli](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/tommy-gun/87195eb23e76eae80cd14a6d80e56072/raw/shexli.json&cacheSeconds=0)](https://github.com/todevelopers/gnome-shell-extension-rss-feed/actions/workflows/ci.yml?query=branch%3Amaster)
[![vitest](https://img.shields.io/endpoint?url=https://gist.githubusercontent.com/tommy-gun/87195eb23e76eae80cd14a6d80e56072/raw/vitest.json&cacheSeconds=0)](https://github.com/todevelopers/gnome-shell-extension-rss-feed/actions/workflows/ci.yml?query=branch%3Amaster)

A modern GNOME Shell extension for following your favorite feeds right from the notification bar. Featuring two layout modes, notifications, and a fully editable list of RSS, Atom, and RDF sources.

---

## What it does

Keeps your RSS feeds one click away - right in the GNOME status panel.

- **Fully redesigned UI** - built from scratch for modern GNOME desktop
- **Panel badge** shows a notification when you have unread articles
- **Two layout modes** - Classic, per-feed submenus, or Minimal, a single chronological list mixing all sources
- **Relative timestamps** on every article (2m, 4h, 3d) so you always know how fresh it is
- **Mark as read** with a two-step confirmation button - no accidental clicks
- **Native desktop notifications** for new articles, with optional lock screen delivery
- **Full feed sources management** in preferences - add, remove, edit, and **Drag-and-drop** reordering of feed sources
- Supports **RSS, Atom, RDF, and FeedBurner** - format is auto-detected
- Configurable **refresh intervals** and article limits

*See [CHANGELOG.md](CHANGELOG.md) for the detailed version description and full history.*

---

## Gallery

<img width="1485" height="1256" alt="RSS Feed Banner - 1" src="https://github.com/user-attachments/assets/219f55b3-aeae-418c-8d44-ee56500929c7" />
<img width="1486" height="1254" alt="RSS Feed Banner - 2" src="https://github.com/user-attachments/assets/d9f39805-0f44-4c34-99d4-6cf9e613c324" />
<img width="1491" height="1311" alt="RSS Feed Banner - 3" src="https://github.com/user-attachments/assets/5e71db3c-0181-4ca2-955d-79314c627cbd" />
<img width="1491" height="1308" alt="RSS Feed Banner - 4" src="https://github.com/user-attachments/assets/13bbc53f-0963-4d36-aa33-ebcb1c6aad7b" />

https://github.com/user-attachments/assets/e5ef8e0b-430c-4573-9138-17b900cd8596

---

## Installation

1. Download `rss-feed@gnome-shell-extension.todevelopers.github.com.zip` from the [latest release](https://github.com/todevelopers/gnome-shell-extension-rss-feed/releases/latest)
2. Install it with:
   ```
   gnome-extensions install rss-feed@gnome-shell-extension.todevelopers.github.com.zip
   ```
3. Restart GNOME Shell (`Alt+F2` → `r` → `Enter`, or log out and back in)
4. Enable the extension in GNOME Extensions app or with:
   ```
   gnome-extensions enable rss-feed@gnome-shell-extension.todevelopers.github.com
   ```

---

## Thank You

This project has been kept alive by the contributions of many people over the years. A big thank you to everyone who submitted patches, reported bugs, and helped maintain the extension:

- **[nixnodes](https://github.com/nixnodes)** — special thanks for implementing new features that significantly extended the extension's capabilities
- [maweki](https://github.com/maweki) (Mario Wenzel)
- [jonnius](https://github.com/jonnius) (Jonatan Hatakeyama Zeidler)
- [k-e-l-p](https://github.com/k-e-l-p) (koronis)
- [Hippyjake](https://github.com/Hippyjake) (jake)
- Dhriti Shikhar
- wxf

Your work is what kept this project going.
