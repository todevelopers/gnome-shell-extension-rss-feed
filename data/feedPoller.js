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

// Drives the polling: fetches each source over Soup, parses it and merges into the model. Never builds widgets.
export class FeedPoller
{
	constructor(store, repository, settings)
	{
		this._store = store;
		this._repository = repository;
		this._settings = settings;

		this._httpSession = new Soup.Session({ timeout : 60 });
		this._cancellable = new Gio.Cancellable();

		this._timeout = 0;
		this._interval = 0;
		this._pending = 0;
		this.onComplete = null;
	}

	start()
	{
		this._poll();
	}

	refresh()
	{
		this._poll();
	}

	destroy()
	{
		if (this._timeout)
		{
			GLib.source_remove(this._timeout);
			this._timeout = 0;
		}

		this._httpSession.abort();
		this._cancellable.cancel();
	}

	_poll()
	{
		this._interval = this._settings.get_int(GSKeys.UPDATE_INTERVAL);
		let itemsRetained = this._settings.get_int(GSKeys.ITEMS_RETAINED);
		let markInitialAsNew = this._settings.get_boolean(GSKeys.MARK_INITIAL_AS_NEW);

		let sources = this._store.getSources();
		this._pending = sources.length;

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

	_fetch(source, itemsRetained, markInitialAsNew)
	{
		let message = Soup.Message.new('GET', this._requestUrl(source.url));

		if (!message)
		{
			console.warn("[rss-feed] Soup.Message.new returned null for URL '" + source.url + "'");
			this._complete();
			return;
		}

		message.get_request_headers().replace("User-Agent", USER_AGENT);

		this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, this._cancellable,
			(session, result) =>
			{
				let data = this._readResponse(session, result, message, source.url);
				if (data)
				{
					let parser = createRssParser(data);
					if (parser)
					{
						parser.parse();
						source.merge(parser, { itemsRetained, markInitialAsNew });
					}
				}

				this._complete();
			});
	}

	_complete()
	{
		if (this._pending <= 0)
			return;

		if (--this._pending > 0)
			return;

		if (this._cancellable.is_cancelled())
			return;

		this._repository.flushUnread();

		if (this.onComplete)
			this.onComplete();
	}

	_requestUrl(sourceURL)
	{
		let params = HTTP.getParametersAsJson(sourceURL);

		let q = sourceURL.indexOf('?');
		let base = q !== -1 ? sourceURL.substr(0, q) : sourceURL;

		return HTTP.buildUrl(base, params);
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
				return null;
			console.error("[rss-feed] HTTP GET " + sourceURL + ": " + e);
			return null;
		}

		let status = message.get_status();
		if (!(status >= 200 && status < 300))
		{
			console.warn("[rss-feed] HTTP GET " + sourceURL + ": " + status + " " + Soup.Status.get_phrase(status));
			return null;
		}

		if (!bytes)
			return null;

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

		return new TextDecoder(encoding).decode(rawBytes);
	}
}
