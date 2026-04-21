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

const
Gio = imports.gi.Gio;
const
PopupMenu = imports.ui.popupMenu;
const
Util = imports.misc.util;
const
Clutter = imports.gi.Clutter;
const
St = imports.gi.St;

const
Me = imports.misc.extensionUtils.getCurrentExtension();
const
Log = Me.imports.logger;
const
Encoder = Me.imports.encoder.getInstance();
const
Misc = Me.imports.misc;

const
Main = imports.ui.main;
/*
 *  RssPopupMenuItem class that extends PopupMenuItem to provide RSS feed specific functionality
 *  After click on this popum menu item, default browser is opened with RSS article
 */
var
RssPopupMenuItem = class _RssPopupMenuItem extends PopupMenu.PopupMenuItem
{

	/*
	 *  Initialize instance of RssPopupMenuItem class
	 *  item - RSS feed item
	 */
	constructor(item)
	{
		let
		title = "  " + item.Title;
		super(title);

		if (title.length > 100)
			title = title.substr(0, 100) + "...";


		this._link = item.HttpLink;

		this.connect('activate', (self, event) =>
		{
			/* right mouse click copies link to clipboard */
			if (event.type() == Clutter.EventType.BUTTON_RELEASE
				&& event.get_button() == Clutter.BUTTON_SECONDARY)
			{
				Log.Debug("Copied link to clipboard: " + this._link);
				St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this._link);
			}
			else
			{
				Log.Debug("Opening browser with link: " + this._link);

				if (Misc.processLinkOpen(this._link, this._cacheObj))
				{
					/* trash the notification, if it exists */
					if (this._cacheObj.Notification)
					{
						this._cacheObj.Notification.destroy();
						this._cacheObj.Notification = undefined;
					}
				}
			}
		});
	}

};
