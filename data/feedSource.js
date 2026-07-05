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

// One feed: owns its FeedItem list and unread count, merges parsed results and signals views.
export const FeedSource = GObject.registerClass(
{
	Signals: {
		'items-changed': {},
		'unread-changed': {},
		'meta-changed': {},
		'items-added': { param_types: [GObject.TYPE_JSOBJECT] },
		'items-removed': { param_types: [GObject.TYPE_JSOBJECT] },
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
		this.disableUpdates = !!config.disableUpdates;
		this.publisherTitle = '';

		this.items = [];
		this.unreadCount = 0;

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
		this.disableUpdates = !!config.disableUpdates;

		if (this.title !== title || this.customAvatar !== avatar)
			this.emit('meta-changed');
	}

	merge(parsed, opts)
	{
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
			disableUpdates: this.disableUpdates,
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
			if (!item.read)
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
			item.read = true;

		this.unreadCount = 0;
		this.emit('unread-changed');
	}
});
