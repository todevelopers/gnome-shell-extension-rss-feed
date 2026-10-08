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
import { FeedItem } from './feedItem.js';
import { computeFeedDiff } from './feedMerge.js';
import { countUnread, countDismissed, olderItems } from './articleState.js';

// One feed: owns its FeedItem list and unread count, merges parsed results and signals views.
export const FeedSource = GObject.registerClass(
{
	Signals: {
		'items-changed': {},
		'unread-changed': {},
		'meta-changed': {},
		'items-added': { param_types: [GObject.TYPE_JSOBJECT] },
		'items-removed': { param_types: [GObject.TYPE_JSOBJECT] },
		'status-changed': {},
		'starred-changed': {},
	},
},
class FeedSource extends GObject.Object
{
	_init(url, config = {})
	{
		super._init();

		this.url = url;
		this.customTitle = config.customTitle || '';
		this.customAvatar = config.customAvatar || '';
		this.mute = !!config.mute;
		this.publisherTitle = '';

		this.items = [];
		this.unreadCount = 0;
		this.lastError = null;
		this.archived = false;

		this._initialDone = false;
		this._persistedUnread = new Set(config.persistedUnread || []);
	}

	get title()
	{
		return this.customTitle || this.publisherTitle || this.url;
	}

	applyConfig(config)
	{
		let title = this.title;
		let avatar = this.customAvatar;

		this.customTitle = config.customTitle || '';
		this.customAvatar = config.customAvatar || '';
		this.mute = !!config.mute;

		if (this.title !== title || this.customAvatar !== avatar)
			this.emit('meta-changed');
	}

	restore(data)
	{
		if (this._initialDone)
			return;

		this.publisherTitle = data.publisherTitle || '';
		if (this.publisherTitle && !this.customTitle)
			this.emit('meta-changed');

		this.items = data.items.map(d => FeedItem.restore(d));
		this.unreadCount = countUnread(this.items);
		// an archive holds only the starred articles, the first merge on top of it still has to count as the initial one
		this._initialDone = !data.archived;

		this.emit('items-changed');
		if (this.unreadCount)
			this.emit('unread-changed');
		if (this.hasStarred())
			this.emit('starred-changed');
	}

	// the feed is gone from the settings, only its starred articles stay
	archive()
	{
		let removed = this.items.filter(i => !i.starred);

		this.archived = true;
		this.items = this.items.filter(i => i.starred);
		this.unreadCount = countUnread(this.items);

		if (removed.length)
			this.emit('items-removed', { items: removed });
	}

	// _initialDone stays unset, the first merge of a feed that was added again must not report its whole content as new
	adopt(archived)
	{
		this.publisherTitle = archived.publisherTitle;
		this.items = archived.items;
		this.unreadCount = archived.unreadCount;
	}

	merge(parsed, opts)
	{
		// a fetch can still be in flight when its feed gets removed
		if (this.archived)
			return;

		if (parsed.Publisher && parsed.Publisher.Title
			&& parsed.Publisher.Title !== this.publisherTitle)
		{
			this.publisherTitle = parsed.Publisher.Title;
			if (!this.customTitle)
				this.emit('meta-changed');
		}

		let incoming = parsed.Items.map(p => ({
			id: p.ID,
			title: p.Title,
			link: p.HttpLink,
			desc: p.Description,
			publishDate: p.PublishDate,
			updateTime: p.UpdateTime,
		}));

		let diff = computeFeedDiff(this.items, incoming, {
			itemsRetained: opts.itemsRetained,
		});

		if (!diff.added.length && !diff.removed.length && !diff.updated.length)
			return;

		let isFirstMerge = !this._initialDone;
		let prevUnread = this.unreadCount;
		let notify = [];

		for (let item of diff.removed)
		{
			let idx = this.items.indexOf(item);
			if (idx !== -1)
				this.items.splice(idx, 1);
			if (!item.read && !item.dismissed)
				this.unreadCount--;
		}

		for (let data of diff.updated)
		{
			let item = this.items.find(i => i.id === data.id);
			if (!item)
				continue;
			item.update(data);
		}

		let added = [];
		for (let data of diff.added)
		{
			let item = new FeedItem(data);
			if (!isFirstMerge || opts.markInitialAsNew || this._persistedUnread.has(item.id))
			{
				item.read = false;
				this.unreadCount++;
				notify.push({ item, update: false });
			}
			added.push(item);
		}
		this.items = added.concat(this.items);

		this._initialDone = true;

		this.emit('items-changed');
		if (diff.removed.length)
			this.emit('items-removed', { items: diff.removed });
		if (this.unreadCount !== prevUnread)
			this.emit('unread-changed');
		if (notify.length)
			this.emit('items-added', { items: notify, initial: isFirstMerge });
	}

	setError(error)
	{
		if (this.lastError === error)
			return;

		this.lastError = error;
		this.emit('status-changed');
	}

	markRead(item)
	{
		if (item.read)
			return;

		item.read = true;
		this.unreadCount--;
		this.emit('unread-changed');
	}

	markAllSeen()
	{
		if (!this.unreadCount)
			return;

		for (let item of this.items)
		{
			if (!item.dismissed)
				item.read = true;
		}

		this.unreadCount = 0;
		this.emit('unread-changed');
	}

	markUnread(item)
	{
		if (!item.read)
			return;

		item.read = false;
		this.unreadCount++;
		this.emit('unread-changed');
	}

	markOlderRead(item)
	{
		for (let older of olderItems(this.items, item))
			older.read = true;

		this._recountUnread();
	}

	markStarredRead()
	{
		for (let item of this.items)
		{
			if (item.starred)
				item.read = true;
		}

		this._recountUnread();
	}

	hasStarred()
	{
		return this.items.some(i => i.starred);
	}

	setStarred(item, value)
	{
		if (item.starred === value)
			return;

		item.starred = value;

		// an archived source has no feed the article could go back to
		if (this.archived && !value)
		{
			this.items.splice(this.items.indexOf(item), 1);
			this._recountUnread();
		}

		this.emit('starred-changed');
	}

	unstarAll()
	{
		let starred = this.items.filter(i => i.starred);
		for (let item of starred)
			this.setStarred(item, false);

		return starred.length;
	}

	dismiss(item)
	{
		if (item.dismissed)
			return;

		this.setStarred(item, false);

		// unstarring already dropped it from an archived source
		if (this.archived)
			return;

		item.dismissed = true;
		if (!item.read)
			this.unreadCount--;

		this.emit('items-changed');
		if (!item.read)
			this.emit('unread-changed');
	}

	restoreDismissed()
	{
		let count = countDismissed(this.items);
		if (!count)
			return 0;

		for (let item of this.items)
			item.dismissed = false;

		this.emit('items-changed');
		this._recountUnread();

		return count;
	}

	_recountUnread()
	{
		let count = countUnread(this.items);
		if (count === this.unreadCount)
			return;

		this.unreadCount = count;
		this.emit('unread-changed');
	}
});
