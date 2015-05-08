/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2015
 *     Tomas Gazovic <gazovic.tomasgmail.com>,
 *     Janka Gazovicova <jana.gazovicova@gmail.com>
 *
 * This file is part of gnome-shell-extension-rss-feed.
 *
 * gnome-shell-extension-rss-feed is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * gnome-shell-extension-rss-feed is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell-extension-rss-feed.  If not, see <http://www.gnu.org/licenses/>.
 */

const Gio = imports.gi.Gio;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Log = Me.imports.logger;
const Encoder = Me.imports.encoder.getInstance();

/*
 *  RssPopupMenuItem class that extends PopupMenuItem to provide RSS feed specific functionality
 *  After click on this popum menu item, default browser is opened with RSS article
 */
const RssPopupMenuItem = new Lang.Class({

    Name: 'RssPopupMenuItem',
    Extends: PopupMenu.PopupMenuItem,

    /*
     *  Initialize instance of RssPopupMenuItem class
     *  item - RSS feed item
     */
    _init: function(item) {
        this.parent(Encoder.htmlDecode(item.Title));

        this._link = item.HttpLink;

        try {
            // try to get default browser
            this._browser = Gio.app_info_get_default_for_uri_scheme("http").get_executable();
        }
        catch (err) {
            Log.Error(err + ' (get default browser error)');
            return;
        }

        this.connect('activate', Lang.bind(this, function() {

            Log.Debug("Opening browser with link " + this._link);
            Util.trySpawnCommandLine(this._browser + ' ' + this._link);
        }));
    }
});
