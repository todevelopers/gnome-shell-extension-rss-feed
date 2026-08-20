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
import Soup from 'gi://Soup';

import * as GSKeys from '../gskeys.js';
import * as HTTP from '../http.js';
import { createRssParser } from '../parsers/factory.js';

const USER_AGENT = 'gnome-shell-extension-rss-feed/1.0 (+https://github.com/todevelopers/gnome-shell-extension-rss-feed)';

// seconds before each retry, only for failures that can still turn into a success
const RETRY_DELAYS = [5, 20];

// Drives the polling: fetches each source over Soup, parses it and merges into the model. Never builds widgets.
export class FeedPoller
{
	constructor(store, repository, settings, uuid)
	{
		this._store = store;
		this._repository = repository;
		this._settings = settings;

		// with the default of 10 connections a long source list finishes in batches, and 60s keeps a dead host in the cycle for a minute
		this._httpSession = new Soup.Session({ timeout : 30, max_conns : 20 });
		this._cancellable = new Gio.Cancellable();

		// feeds change far less often than they are polled, so let libsoup revalidate them instead of downloading them again
		this._cache = Soup.Cache.new(GLib.build_filenamev([GLib.get_user_cache_dir(), uuid, 'http']), Soup.CacheType.SINGLE_USER);
		this._cache.load();
		this._httpSession.add_feature(this._cache);

		this._timeout = 0;
		this._interval = 0;
		this._pending = 0;
		this._total = 0;
		this._forceRevalidate = false;
		this._retries = new Set();
		this.onStart = null;
		this.onProgress = null;
		this.onComplete = null;

		this._networkMonitor = Gio.NetworkMonitor.get_default();
		this._online = this._networkMonitor.network_available;

		this._networkMonitor.connectObject('network-changed', (_monitor, available) =>
		{
			// network-changed also fires on route changes, only the offline to online edge is interesting
			if (available === this._online)
				return;

			this._online = available;

			if (available)
				this._poll();
		}, this);

		this._settings.connectObject(
			'changed::' + GSKeys.UPDATE_INTERVAL, () =>
			{
				this._interval = this._settings.get_int(GSKeys.UPDATE_INTERVAL);
				this._scheduleNext();
			},
			this
		);
	}

	start()
	{
		this._poll();
	}

	refresh()
	{
		this._poll(true);
	}

	destroy()
	{
		this._settings.disconnectObject(this);
		this._networkMonitor.disconnectObject(this);

		if (this._timeout)
		{
			GLib.source_remove(this._timeout);
			this._timeout = 0;
		}

		for (let id of this._retries)
			GLib.source_remove(id);
		this._retries.clear();

		this._httpSession.abort();
		this._cancellable.cancel();

		// without the index on disk the cached bodies are orphans and the next load() throws them away
		this._cache.dump();
	}

	_poll(force = false)
	{
		this._interval = this._settings.get_int(GSKeys.UPDATE_INTERVAL);
		this._forceRevalidate = force;

		// a new cycle supersedes the previous one, whatever it still has in flight must not report into the new counters
		this._cancellable.cancel();
		this._cancellable = new Gio.Cancellable();

		for (let id of this._retries)
			GLib.source_remove(id);
		this._retries.clear();

		// fetching while offline would only produce a burst of connection errors, the reconnect polls again
		this._online = this._networkMonitor.network_available;
		if (!this._online)
		{
			this._scheduleNext();
			return;
		}

		let itemsRetained = this._settings.get_int(GSKeys.ITEMS_RETAINED);
		let markInitialAsNew = this._settings.get_boolean(GSKeys.MARK_INITIAL_AS_NEW);

		let sources = this._store.getSources();
		this._total = sources.length;
		this._pending = this._total;

		// without sources nothing will ever complete the cycle, so nothing may announce its start either
		if (this._pending && this.onStart)
			this.onStart(this._total);

		for (let source of sources)
			this._fetch(source, itemsRetained, markInitialAsNew);

		this._scheduleNext();
	}

	_scheduleNext()
	{
		if (this._timeout)
			GLib.source_remove(this._timeout);
		this._timeout = 0;

		if (this._interval > 0)
		{
			this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, this._interval * 60, () =>
			{
				this._timeout = 0;
				this._poll();
				return GLib.SOURCE_REMOVE;
			});
		}
	}

	_fetch(source, itemsRetained, markInitialAsNew, attempt = 0)
	{
		let message = Soup.Message.new('GET', HTTP.buildRequestUrl(source.url));

		if (!message)
		{
			console.warn("[rss-feed] Soup.Message.new returned null for URL '" + source.url + "'");
			this._fail(source, "Invalid URL", attempt);
			return;
		}

		message.get_request_headers().replace("User-Agent", USER_AGENT);

		// a manual refresh must reach the server even when the cached copy is still fresh
		if (this._forceRevalidate)
			message.get_request_headers().replace("Cache-Control", "no-cache");

		let cancellable = this._cancellable;

		this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable,
			(session, result) =>
			{
				// an answer that arrives right after a refresh dropped its cycle would count towards the cycle that replaced it
				if (cancellable.is_cancelled())
					return;

				let response = this._readResponse(session, result, message, source.url);

				if (response.cancelled)
					return;

				if (response.error)
				{
					// the machine dropped offline mid-cycle: a retry cannot succeed and the feed is not at fault
					if (!this._networkMonitor.network_available)
					{
						this._settle(attempt);
						return;
					}

					if (response.retryable && attempt < RETRY_DELAYS.length)
					{
						this._scheduleRetry(source, itemsRetained, markInitialAsNew, attempt);
						// keeping the cycle open until a retry answers is what left the header updating for minutes
						this._settle(attempt);
					}
					else
						this._fail(source, response.error, attempt);

					return;
				}

				let parser = createRssParser(response.data);
				if (!parser)
				{
					console.warn("[rss-feed] " + source.url + ": unable to parse feed");
					this._fail(source, "Unable to parse feed", attempt);
					return;
				}

				parser.parse();
				source.merge(parser, { itemsRetained, markInitialAsNew });
				source.setError(null);

				this._settle(attempt);
			});
	}

	_scheduleRetry(source, itemsRetained, markInitialAsNew, attempt)
	{
		let id = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, RETRY_DELAYS[attempt], () =>
		{
			this._retries.delete(id);
			this._fetch(source, itemsRetained, markInitialAsNew, attempt + 1);
			return GLib.SOURCE_REMOVE;
		});

		this._retries.add(id);
	}

	_fail(source, error, attempt)
	{
		source.setError(error);
		this._settle(attempt);
	}

	_settle(attempt)
	{
		// a retry runs outside the cycle, its source was counted when the first attempt finished
		if (attempt > 0)
			return;

		if (this._pending <= 0)
			return;

		this._pending--;

		if (this.onProgress)
			this.onProgress(this._total - this._pending, this._total);

		if (this._pending > 0)
			return;

		this._repository.flushItems();

		// the Shell does not disable extensions when the session ends, so an index written only in destroy() would be lost on logout
		this._cache.dump();

		if (this.onComplete)
			this.onComplete();
	}

	_readResponse(session, result, message, sourceURL)
	{
		let bytes;
		try
		{
			bytes = session.send_and_read_finish(result);
		}
		catch (e)
		{
			if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
				return { cancelled : true };
			console.error("[rss-feed] HTTP GET " + sourceURL + ": " + e);
			return { error : e.message || "Connection failed", retryable : true };
		}

		let status = message.get_status();
		if (!(status >= 200 && status < 300))
		{
			console.warn("[rss-feed] HTTP GET " + sourceURL + ": " + status + " " + message.get_reason_phrase());
			// a 4xx other than "too many requests" and "request timeout" answers the same way on every retry
			let retryable = status >= 500 || status === 408 || status === 429;
			return { error : status + " " + message.get_reason_phrase(), retryable };
		}

		if (!bytes)
			return { error : "Empty response", retryable : true };

		let rawBytes = bytes.toArray();
		let encoding = 'utf-8';

		let ctHeader = message.get_response_headers().get_one('content-type');
		if (ctHeader)
		{
			let m = ctHeader.match(/charset=([^\s;]+)/i);
			if (m) encoding = m[1];
		}

		if (encoding === 'utf-8')
		{
			let prolog = new TextDecoder('latin1').decode(rawBytes.subarray(0, 200));
			let m = prolog.match(/encoding=["']([^"']+)["']/i);
			if (m) encoding = m[1];
		}

		return { data : new TextDecoder(encoding).decode(rawBytes) };
	}
}
