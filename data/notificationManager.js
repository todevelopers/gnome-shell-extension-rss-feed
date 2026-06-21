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

import Gio from 'gi://Gio';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import * as GSKeys from '../gskeys.js';
import * as Misc from '../misc.js';
import { getInstance } from '../encoder.js';
import { planNotifications } from './notificationPolicy.js';

const Encoder = getInstance();

// Mirrors the model into MessageTray notifications under one source; the dispatch decisions live in notificationPolicy.
export class NotificationManager
{
	constructor(store, settings)
	{
		this._store = store;
		this._settings = settings;

		this._notifications = new Map();
		this._sourceHandlers = new Map();
		this._source = null;

		this._addedId = store.connect('source-added', (_store, source) => this._watch(source));
		this._removedId = store.connect('source-removed', (_store, source) => this._unwatch(source));

		for (let source of store.getSources())
			this._watch(source);
	}

	_watch(source)
	{
		let ids = [
			source.connect('items-added', (_source, payload) => this._onItemsAdded(source, payload)),
			source.connect('unread-changed', () => this._onUnreadChanged(source)),
		];
		this._sourceHandlers.set(source, ids);
	}

	_unwatch(source)
	{
		let ids = this._sourceHandlers.get(source);
		if (!ids)
			return;

		for (let id of ids)
			source.disconnect(id);
		this._sourceHandlers.delete(source);
	}

	_onItemsAdded(source, payload)
	{
		let plan = planNotifications(payload, {
			enabled : this._settings.get_boolean(GSKeys.ENABLE_NOTIFICATIONS),
			mute : source.mute,
			locked : Misc.isScreenLocked(),
			notifOnLockScreen : this._settings.get_boolean(GSKeys.NOTIFICATIONS_ON_LOCKSCREEN),
			limit : this._settings.get_int(GSKeys.MAX_NOTIFICATIONS),
			liveIds : [...this._notifications.keys()],
		});

		for (let id of plan.toDismiss)
			this._dismiss(id);

		if (!plan.toShow.length)
			return;

		let items = new Map(payload.items.map(e => [e.item.id, e.item]));
		let feedTitle = Encoder.htmlDecode(source.title);

		for (let spec of plan.toShow)
			this._show(spec, items.get(spec.id), source, feedTitle);
	}

	_onUnreadChanged(source)
	{
		let stale = [];
		for (let [id, notification] of this._notifications)
		{
			if (notification._rssSource === source && notification._rssItem.read)
				stale.push(id);
		}

		for (let id of stale)
			this._dismiss(id);
	}

	_show(spec, item, source, feedTitle)
	{
		this._ensureSource();

		let notification = new MessageTray.Notification({
			source : this._source,
			title : spec.title,
			body : spec.body,
			gicon : Misc.makeAvatarIcon(feedTitle),
			resident : true,
			isTransient : false,
			urgency : MessageTray.Urgency.HIGH,
		});

		notification._rssItem = item;
		notification._rssSource = source;

		notification.addAction('Open', () =>
		{
			if (Misc.processLinkOpen(spec.url))
				this._store.markRead(source, item);
		});

		notification.addAction('Copy URL', () =>
		{
			St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, spec.url);

			if (Main.messageTray._banner)
				Main.messageTray._banner.emit('done-displaying');
		});

		notification.addAction('Mark as read', () =>
		{
			this._store.markRead(source, item);
		});

		notification.connect('activated', () =>
		{
			if (Misc.processLinkOpen(spec.url))
				this._store.markRead(source, item);
		});

		notification.connect('destroy', () =>
		{
			if (this._notifications.get(spec.id) === notification)
				this._notifications.delete(spec.id);
		});

		this._notifications.set(spec.id, notification);
		this._source.addNotification(notification);
	}

	_dismiss(id)
	{
		let notification = this._notifications.get(id);
		if (notification)
			notification.destroy();
	}

	_ensureSource()
	{
		if (this._source)
			return;

		this._source = new MessageTray.Source({
			title : 'RSS Feed',
			icon : new Gio.ThemedIcon({ name : 'application-rss+xml' }),
		});

		this._source.connect('destroy', () =>
		{
			this._source = null;
			this._notifications.clear();
		});

		Main.messageTray.add(this._source);
	}

	destroy()
	{
		this._store.disconnect(this._addedId);
		this._store.disconnect(this._removedId);

		for (let source of this._sourceHandlers.keys())
		{
			for (let id of this._sourceHandlers.get(source))
				source.disconnect(id);
		}
		this._sourceHandlers.clear();

		if (this._settings.get_boolean(GSKeys.CLEANUP_NOTIFICATIONS))
		{
			for (let notification of [...this._notifications.values()])
				notification.destroy();

			if (this._source)
				this._source.destroy();
		}

		this._notifications.clear();
	}
}
