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

import GLib from 'gi://GLib';
import { GSAA } from '../gsaa.js';
import * as GSKeys from '../gskeys.js';
import { FeedSource } from './feedSource.js';

const UNREAD_FLUSH_DELAY = 2000;

// Maps the on-disk GSettings/GSAA shape to the model and persists unread ids (debounced) — the only storage-aware layer.
export class FeedRepository
{
	constructor(settings)
	{
		this._settings = settings;
		this._aSettings = new GSAA(settings, GSKeys.RSS_FEEDS_SETTINGS);

		this._store = null;
		this._flushId = 0;
	}

	load(store)
	{
		this._store = store;

		let urls = this._settings.get_strv(GSKeys.RSS_FEEDS_LIST);
		this._aSettings.load();

		for (let url of urls)
			store.addSource(new FeedSource(url, this._configFor(url)));

		store.connectObject('changed', () => this.scheduleUnreadFlush(), this);
	}

	sync(store)
	{
		let urls = this._settings.get_strv(GSKeys.RSS_FEEDS_LIST);
		this._aSettings.load();

		let wanted = new Set(urls);
		for (let source of store.getSources())
			if (!wanted.has(source.url))
				store.removeSource(source.url);

		for (let url of urls)
		{
			let source = store.getSource(url);
			if (source)
				source.applyConfig(this._configFor(url));
			else
				store.addSource(new FeedSource(url, this._configFor(url)));
		}

		store.reorder(urls);
	}

	_configFor(url)
	{
		let gsData = this._aSettings._gsData[url];
		let config = {};

		if (gsData)
		{
			config.customTitle = gsData['t'];
			config.customAvatar = gsData['v'];
			config.mute = gsData['n'];
			config.disableUpdates = gsData['u'];
			config.persistedUnread = Array.isArray(gsData['i']) ? gsData['i'] : [];
		}

		return config;
	}

	flushUnread()
	{
		this._cancelScheduledFlush();
		this._aSettings.load();

		for (let source of this._store.getSources())
		{
			let ids = source.items.filter(i => !i.read).map(i => i.id);
			let data = this._aSettings._gsData[source.url];

			if (ids.length)
			{
				if (!data)
					data = this._aSettings._gsData[source.url] = {};
				data['i'] = ids;
			}
			else if (data)
				delete data['i'];
		}

		this._aSettings.dump();
	}

	scheduleUnreadFlush()
	{
		if (this._flushId)
			return;

		this._flushId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, UNREAD_FLUSH_DELAY, () =>
		{
			this._flushId = 0;
			this.flushUnread();
			return GLib.SOURCE_REMOVE;
		});
	}

	_cancelScheduledFlush()
	{
		if (this._flushId)
		{
			GLib.source_remove(this._flushId);
			this._flushId = 0;
		}
	}

	destroy()
	{
		if (this._flushId)
			this.flushUnread();

		this._cancelScheduledFlush();

		this._store?.disconnectObject(this);

		this._store = null;
		this._aSettings.destroy();
	}
}
