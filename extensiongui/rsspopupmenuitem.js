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

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Misc from '../misc.js';

export const RssPopupMenuItem = GObject.registerClass(
class RssPopupMenuItem extends PopupMenu.PopupMenuItem
{
	_init(item)
	{
		let title = "  " + item.Title;
		if (title.length > 100)
			title = title.substr(0, 100) + "...";

		super._init(title);

		this._link = item.HttpLink;

		this.connect('activate', (self, event) =>
		{
			if (event.type() == Clutter.EventType.BUTTON_RELEASE
				&& event.get_button() == Clutter.BUTTON_SECONDARY)
			{
				console.debug("rss-feed: Copied link to clipboard: " + this._link);
				St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this._link);
			}
			else
			{
				console.debug("rss-feed: Opening browser with link: " + this._link);

				if (Misc.processLinkOpen(this._link, this._cacheObj))
				{
					if (this._cacheObj.Notification)
					{
						this._cacheObj.Notification.destroy();
						this._cacheObj.Notification = undefined;
					}
				}
			}
		});
	}
});
