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
import { collectStarred } from './articleState.js';

// Collection of FeedSources: owns the total unread count and routes read operations; views observe it.
export const FeedStore = GObject.registerClass(
{
	Signals: {
		'source-added': { param_types: [GObject.TYPE_JSOBJECT] },
		'source-removed': { param_types: [GObject.TYPE_JSOBJECT] },
		'reordered': {},
		'changed': {},
		'starred-changed': {},
	},
},
class FeedStore extends GObject.Object
{
	_init()
	{
		super._init();

		this._sources = new Map();
		this._archived = new Map();
		this.totalUnread = 0;
		this.failedCount = 0;
	}

	addSource(source)
	{
		this._sources.set(source.url, source);
		source.connectObject(
			'unread-changed', () => this._recomputeUnread(),
			'status-changed', () => this._recomputeFailed(),
			'starred-changed', () => this.emit('starred-changed'),
			this
		);

		this.emit('source-added', source);
		this._recomputeUnread();
		if (source.hasStarred())
			this.emit('starred-changed');
	}

	removeSource(url)
	{
		let source = this._sources.get(url);
		if (!source)
			return;

		source.disconnectObject(this);
		this._sources.delete(url);

		this._recomputeUnread();
		this._recomputeFailed();
		this.emit('source-removed', source);
		if (source.hasStarred())
			this.emit('starred-changed');
	}

	// feeds that were removed while they had starred articles, never polled and not part of getSources()
	addArchived(source)
	{
		this._archived.set(source.url, source);
		source.connectObject(
			'unread-changed', () => this._recomputeUnread(),
			'starred-changed', () => this.emit('starred-changed'),
			this
		);

		this._recomputeUnread();
		this.emit('starred-changed');
	}

	removeArchived(url)
	{
		let source = this._archived.get(url);
		if (!source)
			return;

		source.disconnectObject(this);
		this._archived.delete(url);

		this._recomputeUnread();
		this.emit('starred-changed');
	}

	getArchived()
	{
		return [...this._archived.values()];
	}

	getSource(url)
	{
		return this._sources.get(url);
	}

	getSources()
	{
		return [...this._sources.values()];
	}

	reorder(urls)
	{
		let current = [...this._sources.keys()];
		let next = urls.filter(url => this._sources.has(url));

		for (let url of current)
			if (!next.includes(url))
				next.push(url);

		if (next.length === current.length && next.every((url, i) => url === current[i]))
			return;

		let reordered = new Map();
		for (let url of next)
			reordered.set(url, this._sources.get(url));

		this._sources = reordered;
		this.emit('reordered');
	}

	markRead(source, item)
	{
		source.markRead(item);
	}

	markUnread(source, item)
	{
		source.markUnread(item);
	}

	toggleRead(source, item)
	{
		if (item.read)
			source.markUnread(item);
		else
			source.markRead(item);
	}

	toggleStar(source, item)
	{
		source.setStarred(item, !item.starred);
	}

	dismiss(source, item)
	{
		source.dismiss(item);
	}

	markOlderRead(source, item)
	{
		source.markOlderRead(item);
	}

	markAllSeen()
	{
		for (let source of this._sources.values())
			source.markAllSeen();
		for (let source of this._archived.values())
			source.markAllSeen();
	}

	markStarredRead()
	{
		for (let source of this._sources.values())
			source.markStarredRead();
		for (let source of this._archived.values())
			source.markStarredRead();
	}

	starredEntries()
	{
		return collectStarred([...this._sources.values(), ...this._archived.values()]);
	}

	_recomputeUnread()
	{
		let total = 0;
		for (let source of this._sources.values())
			total += source.unreadCount;
		for (let source of this._archived.values())
			total += source.unreadCount;

		if (total !== this.totalUnread)
		{
			this.totalUnread = total;
			this.emit('changed');
		}
	}

	_recomputeFailed()
	{
		let failed = 0;
		for (let source of this._sources.values())
			if (source.lastError)
				failed++;

		if (failed !== this.failedCount)
		{
			this.failedCount = failed;
			this.emit('changed');
		}
	}
});
