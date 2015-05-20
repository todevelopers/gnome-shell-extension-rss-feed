# RSS Feed GNOME Shell extension

Simple RSS Feed reader extension for GNOME Shell.

This extension adds button (RSS icon) to the GNOME Shell panel. After click on it, you can see your RSS Feeds in popup menu and navigate through them. When you click on some article, extension opens your default browser with it. Bottom bar contains buttons for navigating, refreshing and Settings tab.

You can add URL links of your RSS sources in Settings tab. Also you can adjust refreshing interval in minutes or set how many RSS Feeds will be displayed per page.

#### Supported formats:

* RSS 1.0 (RDF) format
* RSS 2.0 format
* Atom format

## Future plans

* Support for GZIP content
* KML format support
* Verification of RSS source availability in Settings widget
* Rework of Settings widget
* Notifications for new articles
* Mark articles read / unread
* Categories for RSS Feeds

## Installation

### Through extensions.gnome.org

Go to https://extensions.gnome.org/extension/948/rss-feed/ and install it from there.

### Manual installation

Download latest release (https://github.com/todevelopers/gnome-shell-extension-rss-feed/releases/download/v1.1/rss-feed-v1.1.zip) and unpack it to this directory `~/.local/share/gnome-shell/extensions/rss-feed@gnome-shell-extension.todevelopers.github.com`. Restart the gnome shell by `ALT+F2`, type `r` and hit `Enter`.

Commands to install:
```
mkdir -p ~/.local/share/gnome-shell/extensions/rss-feed@gnome-shell-extension.todevelopers.github.com
cd ~/.local/share/gnome-shell/extensions/rss-feed@gnome-shell-extension.todevelopers.github.com
curl -O https://github.com/todevelopers/gnome-shell-extension-rss-feed/releases/download/v1.1/rss-feed-v1.1.zip
unzip rss-feed-v1.1.zip
rm rss-feed-v1.1.zip
```

## Screenshots

![](http://i.imgur.com/EzCf7ih.png)
![](http://i.imgur.com/YohFb6F.png)
