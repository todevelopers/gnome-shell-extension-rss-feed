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

import GObject from 'gi://GObject';

// Collection of FeedSources: owns the total unread count and routes read operations; views observe it.
export const FeedStore = GObject.registerClass(
{
	Signals: {
		'source-added': { param_types: [GObject.TYPE_JSOBJECT] },
		'source-removed': { param_types: [GObject.TYPE_JSOBJECT] },
		'changed': {},
		'item-read': { param_types: [GObject.TYPE_JSOBJECT] },
	},
},
class FeedStore extends GObject.Object
{
	_init()
	{
		super._init();

		this._sources = new Map();
		this._handlers = new Map();
		this.totalUnread = 0;
	}

	addSource(source)
	{
		this._sources.set(source.url, source);
		let id = source.connect('unread-changed', () => this._recomputeUnread());
		this._handlers.set(source, id);

		this.emit('source-added', source);
		this._recomputeUnread();
	}

	removeSource(url)
	{
		let source = this._sources.get(url);
		if (!source)
			return;

		source.disconnect(this._handlers.get(source));
		this._handlers.delete(source);
		this._sources.delete(url);

		this._recomputeUnread();
		this.emit('source-removed', source);
	}

	getSource(url)
	{
		return this._sources.get(url);
	}

	getSources()
	{
		return [...this._sources.values()];
	}

	markRead(source, item)
	{
		if (item.read)
			return;

		source.markRead(item);
		this.emit('item-read', item);
	}

	markAllSeen()
	{
		for (let source of this._sources.values())
			source.markAllSeen();
	}

	_recomputeUnread()
	{
		let total = 0;
		for (let source of this._sources.values())
			total += source.unreadCount;

		if (total !== this.totalUnread)
		{
			this.totalUnread = total;
			this.emit('changed');
		}
	}
});
