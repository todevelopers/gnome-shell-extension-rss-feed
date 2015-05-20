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

const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Log = Me.imports.logger;
const Encoder = Me.imports.encoder.getInstance();

/*
 *  RssPopupSubMenuMenuItem class that extends PopupSubMenuMenuItem. Holds RSS feed articles
 */
const RssPopupSubMenuMenuItem = new Lang.Class({

    Name: 'RssPopupSubMenuMenuItem',
    Extends: PopupMenu.PopupSubMenuMenuItem,

    /*
     *  Initialize instance of RssPopupSubMenuMenuItem class
     *  publisher - RSS feed publisher
     *  nitems - number of articles
     */
    _init: function(publisher, nitems) {

        let title = publisher.Title;
        if (title.length > 128)
            title = title.substr(0, 128) + "...";

        this.parent(Encoder.htmlDecode(title) + ' (' + nitems + ')');
    }
});
