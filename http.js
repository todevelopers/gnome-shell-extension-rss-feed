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

// everything a query may carry unescaped, '%' included so escapes already in the url are not escaped a second time
const QUERY_RESERVED = "!#$&'()*+,;=:@/?%";

export function buildRequestUrl(url)
{
	let l2o = url.indexOf('?');

	if (l2o == -1)
		return url;

	return url.substr(0, l2o + 1) + GLib.Uri.escape_string(url.substr(l2o + 1), QUERY_RESERVED, false);
}

// blocks loopback, link-local and the private ranges used by internal services and cloud metadata endpoints
const UNSAFE_HOST_PATTERNS = [
	/^localhost$/i,
	/^127\./,
	/^0\./,
	/^10\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
	/^169\.254\./,
	/^\[?::1?\]?$/i,
	/^\[?fe80:/i,
	/^\[?f[cd][0-9a-f]{2}:/i,
];

// a feed source URL is attacker-controllable (imported OPML, shared config), so it must not be able to reach internal hosts
export function isSafeRequestUrl(url)
{
	let uri;
	try
	{
		uri = GLib.Uri.parse(url, GLib.UriFlags.NONE);
	}
	catch (e)
	{
		return false;
	}

	let scheme = uri.get_scheme();
	if (scheme !== 'http' && scheme !== 'https')
		return false;

	let host = uri.get_host();
	if (!host)
		return false;

	return !UNSAFE_HOST_PATTERNS.some(pattern => pattern.test(host));
}
