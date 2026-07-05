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
import { planNotifications } from '../data/notificationPolicy.js';

const Encoder = getInstance();
const GLOBAL_SOURCE_KEY = Symbol('global');

// Mirrors the model into MessageTray notifications under one shared source or one per feed; the dispatch decisions live in notificationPolicy.
export class NotificationManager
{
	constructor(store, settings)
	{
		this._store = store;
		this._settings = settings;

		this._notifications = new Map();
		this._watchedSources = new Set();
		this._traySources = new Map();

		store.connectObject(
			'source-added', (_store, source) => this._watch(source),
			'source-removed', (_store, source) => this._unwatch(source),
			this
		);

		for (let source of store.getSources())
			this._watch(source);
	}

	_watch(source)
	{
		source.connectObject(
			'items-added', (_source, payload) => this._onItemsAdded(source, payload),
			'items-removed', (_source, payload) => this._onItemsRemoved(source, payload),
			'unread-changed', () => this._onUnreadChanged(source),
			this
		);
		this._watchedSources.add(source);
	}

	_unwatch(source)
	{
		source.disconnectObject(this);
		this._watchedSources.delete(source);

		let traySource = this._traySources.get(source.url);
		if (traySource)
			traySource.destroy();
	}

	_onItemsAdded(source, payload)
	{
		let plan = planNotifications(payload, {
			enabled : this._settings.get_string(GSKeys.DISPLAY_MODE) !== 'widget-only',
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

	_onItemsRemoved(source, payload)
	{
		for (let item of payload.items)
		{
			let notification = this._notifications.get(item.id);
			if (notification && notification._rssSource === source)
				notification.destroy();
		}
	}

	_show(spec, item, source, feedTitle)
	{
		let key = this._settings.get_boolean(GSKeys.GROUP_NOTIFICATIONS_BY_SOURCE) ? source.url : GLOBAL_SOURCE_KEY;
		let traySource = this._traySourceFor(key, feedTitle);

		let notification = new MessageTray.Notification({
			source : traySource,
			title : spec.title,
			body : spec.body,
			gicon : Misc.makeAvatarIcon(feedTitle),
			resident : true,
			isTransient : false,
			urgency : MessageTray.Urgency.HIGH,
		});

		notification._rssItem = item;
		notification._rssSource = source;
		notification._traySourceKey = key;

		notification.addAction('Open', () => this._open(source, item, spec.url));

		notification.addAction('Copy URL', () =>
		{
			St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, spec.url);

			if (Main.messageTray._banner)
				Main.messageTray._banner.emit('done-displaying');
		});

		notification.addAction('Mark as read', () =>
		{
			this._store?.markRead(source, item);
		});

		notification.connect('activated', () => this._open(source, item, spec.url));

		notification.connect('destroy', () =>
		{
			if (this._notifications.get(spec.id) === notification)
				this._notifications.delete(spec.id);
		});

		this._notifications.set(spec.id, notification);
		traySource.addNotification(notification);
	}

	_open(source, item, url)
	{
		if (Misc.processLinkOpen(url))
		{
			Main.panel.statusArea.dateMenu?.menu?.close();
			this._store?.markRead(source, item);
		}
	}

	_dismiss(id)
	{
		let notification = this._notifications.get(id);
		if (notification)
			notification.destroy();
	}

	_traySourceFor(key, feedTitle)
	{
		let traySource = this._traySources.get(key);
		if (traySource)
			return traySource;

		let grouped = key !== GLOBAL_SOURCE_KEY;
		traySource = new MessageTray.Source({
			title : grouped ? feedTitle : 'RSS Feed',
			icon : new Gio.ThemedIcon({ name : 'application-rss+xml' }),
		});

		traySource.connect('destroy', () =>
		{
			this._traySources.delete(key);
			for (let [id, notification] of this._notifications)
			{
				if (notification._traySourceKey === key)
					this._notifications.delete(id);
			}
		});

		Main.messageTray.add(traySource);
		this._traySources.set(key, traySource);

		return traySource;
	}

	destroy()
	{
		this._store.disconnectObject(this);

		for (let source of this._watchedSources)
			source.disconnectObject(this);
		this._watchedSources.clear();

		if (this._settings.get_boolean(GSKeys.CLEANUP_NOTIFICATIONS))
		{
			for (let notification of [...this._notifications.values()])
				notification.destroy();

			for (let traySource of [...this._traySources.values()])
				traySource.destroy();
		}

		this._notifications.clear();
		this._traySources.clear();

		this._store = null;
	}
}
