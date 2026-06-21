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
import * as Misc from '../../misc.js';

export const ClassicArticleItem = GObject.registerClass(
class ClassicArticleItem extends PopupMenu.PopupMenuItem
{
	_init(item, source, store)
	{
		let title = item.title;
		if (title.length > 100)
			title = title.substr(0, 100) + "...";

		super._init(title);

		this.label.add_style_class_name('rss-article-read');
		this.label.x_expand = true;

		this._timeLabel = new St.Label(
		{
			text: Misc.relativeTime(item.publishDate),
			style_class: 'rss-article-time',
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.END,
		});
		this.add_child(this._timeLabel);

		this._item = item;
		this._source = source;
		this._store = store;

		this.setOrnament(item.read ? PopupMenu.Ornament.NONE : PopupMenu.Ornament.DOT);

		this.connect('activate', (self, event) =>
		{
			if (event.type() == Clutter.EventType.BUTTON_RELEASE
				&& event.get_button() == Clutter.BUTTON_SECONDARY)
			{
				St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, this._item.link);
			}
			else if (Misc.processLinkOpen(this._item.link))
			{
				this._store.markRead(this._source, this._item);
			}
		});
	}

	setOrnament(ornament)
	{
		if (!this.label)
			return;
		if (ornament === PopupMenu.Ornament.DOT)
		{
			this.label.remove_style_class_name('rss-article-read');
			this.label.add_style_class_name('rss-article-unread');
		}
		else
		{
			this.label.remove_style_class_name('rss-article-unread');
			this.label.add_style_class_name('rss-article-read');
		}
	}
});
