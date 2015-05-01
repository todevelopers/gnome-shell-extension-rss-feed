/*
 *  RSS Feed extension for GNOME Shell
 *  - Logging services for extension
 *
 * Copyright (C) 2015
 *     Tomas Gazovic <gazovic.tomasgmail.com>,
 *     Janka Gazovicova <jana.gazovicova@gmail.com>
 *
 * This file is part of gnome-shell-extension-rss-feed.
 *
 * gnome-shell-extension-rss-feed is free software: you can
 * redistribute it and/or modify it under the terms of the GNU
 * General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * gnome-shell-extension-rss-feed is distributed in the hope that it
 * will be useful, but WITHOUT ANY WARRANTY; without even the
 * implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
 * PURPOSE.  See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell-extension-rss-feed.  If not, see
 * <http://www.gnu.org/licenses/>.
 */

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Settings = Me.imports.convenience.getSettings();

const DEBUG_ENABLED_KEY = 'enable-debug';

/*
 *  Logs error messages.
 */
function Error(message) {
    logError(message);
}

/*
 *  If debug extension is enabled logs debug messages.
 */
function Debug(message) {

    let enabled = Settings.get_boolean(DEBUG_ENABLED_KEY);

    if (enabled == true) {
          log("rss-feed@gnome-shell-extension: " + message);
    }
}
