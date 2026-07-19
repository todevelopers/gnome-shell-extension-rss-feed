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
import Gio from 'gi://Gio';
import { GSAA } from '../gsaa.js';
import * as GSKeys from '../gskeys.js';
import { FeedSource } from './feedSource.js';

const ITEMS_FLUSH_DELAY = 2000;

Gio._promisify(Gio.File.prototype, 'load_contents_async');
Gio._promisify(Gio.File.prototype, 'replace_contents_bytes_async', 'replace_contents_finish');
Gio._promisify(Gio.File.prototype, 'delete_async');

// Maps the on-disk shape (GSettings for config, per-feed JSON item files for state) to the model and persists items (debounced) — the only storage-aware layer.
export class FeedRepository
{
	constructor(settings, uuid)
	{
		this._settings = settings;
		this._aSettings = new GSAA(settings, GSKeys.RSS_FEEDS_SETTINGS);

		this._dir = GLib.build_filenamev([GLib.get_user_data_dir(), uuid, 'items']);
		GLib.mkdir_with_parents(this._dir, 0o700);

		this._store = null;
		this._dirty = new Set();
		this._flushId = 0;
	}

	async load(store)
	{
		this._store = store;

		let urls = this._settings.get_strv(GSKeys.RSS_FEEDS_LIST);
		this._aSettings.load();

		store.connectObject(
			'source-added', (_store, source) => this._watchSource(source),
			'source-removed', (_store, source) => this._unwatchSource(source),
			this
		);

		for (let url of urls)
			store.addSource(new FeedSource(url, this._configFor(url)));

		await Promise.all(store.getSources().map(source => this._restoreSource(source)));
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
			config.persistedUnread = Array.isArray(gsData['i']) ? gsData['i'] : [];
		}

		return config;
	}

	_watchSource(source)
	{
		source.connectObject(
			'items-changed', () => this._markDirty(source),
			'unread-changed', () => this._markDirty(source),
			this
		);
	}

	_unwatchSource(source)
	{
		source.disconnectObject(this);
		this._dirty.delete(source.url);
		Gio.File.new_for_path(this._itemsPath(source.url)).delete_async(GLib.PRIORITY_DEFAULT, null).catch(() => {});
	}

	_markDirty(source)
	{
		this._dirty.add(source.url);
		this.scheduleItemsFlush();
	}

	async _restoreSource(source)
	{
		let file = Gio.File.new_for_path(this._itemsPath(source.url));

		let data;
		try
		{
			let [contents] = await file.load_contents_async(null);
			data = JSON.parse(new TextDecoder().decode(contents));
		}
		catch
		{
			return;
		}

		if (!this._store || !Array.isArray(data.items))
			return;

		source.restore(data);
		this._dirty.delete(source.url);
	}

	flushItems()
	{
		this._cancelScheduledFlush();

		let flushed = [];
		for (let source of this._store.getSources())
		{
			if (this._dirty.has(source.url))
			{
				this._writeItems(source);
				flushed.push(source.url);
			}
		}

		this._dirty.clear();
		this._clearLegacyUnread(flushed);
	}

	scheduleItemsFlush()
	{
		if (this._flushId)
			return;

		this._flushId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ITEMS_FLUSH_DELAY, () =>
		{
			this._flushId = 0;
			this.flushItems();
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

	_writeItems(source)
	{
		let path = this._itemsPath(source.url);
		let bytes = new GLib.Bytes(new TextEncoder().encode(this._serialize(source)));

		Gio.File.new_for_path(path)
			.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null)
			.catch(e => console.warn("[rss-feed] Writing '" + path + "' failed: " + e));
	}

	_serialize(source)
	{
		return JSON.stringify({
			version: 1,
			url: source.url,
			publisherTitle: source.publisherTitle,
			items: source.items.map(i => ({
				id: i.id,
				read: i.read,
				link: i.link,
				title: i.title,
				desc: i.desc,
				publishDate: i.publishDate,
				updateTime: i.updateTime,
			})),
		});
	}

	_itemsPath(url)
	{
		let name = GLib.compute_checksum_for_string(GLib.ChecksumType.SHA256, url, -1);
		return GLib.build_filenamev([this._dir, name + '.json']);
	}

	// once a source's items live in a file, its legacy unread ids in the GSettings blob are obsolete
	_clearLegacyUnread(urls)
	{
		if (!urls.length)
			return;

		this._aSettings.load();

		let changed = false;
		for (let url of urls)
		{
			let data = this._aSettings._gsData[url];
			if (data && data['i'] !== undefined)
			{
				delete data['i'];
				changed = true;
			}
		}

		if (changed)
			this._aSettings.dump();
	}

	destroy()
	{
		if (this._flushId)
		{
			GLib.source_remove(this._flushId);
			this._flushId = 0;
		}

		if (this._store)
		{
			// the final flush must be synchronous — an async write would not complete after disable
			for (let source of this._store.getSources())
			{
				source.disconnectObject(this);
				if (this._dirty.has(source.url))
					GLib.file_set_contents(this._itemsPath(source.url), this._serialize(source));
			}

			this._store.disconnectObject(this);
		}

		this._dirty.clear();
		this._store = null;
		this._aSettings.destroy();
	}
}
