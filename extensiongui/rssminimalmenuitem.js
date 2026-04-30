/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2015 - 2026
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

export const RssMinimalMenuItem = GObject.registerClass(
class RssMinimalMenuItem extends PopupMenu.PopupBaseMenuItem
{
	_init(cacheObj, feedTitle, onRead)
	{
		super._init();
		this._cacheObj = cacheObj;
		let item = cacheObj.Item;

		let contentBox = new St.BoxLayout({ vertical: true, x_expand: true });
		this._titleLabel = new St.Label({ text: item.Title });
		this._titleLabel.add_style_class_name(cacheObj.Unread ? 'rss-article-unread' : 'rss-article-read');
		contentBox.add_child(this._titleLabel);

		let metaBox = new St.BoxLayout({ style: 'spacing: 6px;' });
		metaBox.add_child(new St.Label({ text: feedTitle, style_class: 'rss-source-tag' }));
		metaBox.add_child(new St.Label({ text: Misc.relativeTime(item.PublishDate), style_class: 'rss-article-time' }));
		contentBox.add_child(metaBox);
		this.add_child(contentBox);

		this.connect('activate', (self, event) =>
		{
			if (event.type() == Clutter.EventType.BUTTON_RELEASE
				&& event.get_button() == Clutter.BUTTON_SECONDARY)
			{
				St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.HttpLink);
			}
			else
			{
				Misc.processLinkOpen(item.HttpLink, cacheObj);
				onRead();
			}
		});

		this.connect('destroy', () =>
		{
			this._destroyed = true;
		});
	}
});
