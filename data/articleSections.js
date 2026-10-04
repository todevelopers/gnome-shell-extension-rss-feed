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

// a starred article is listed only among the starred ones, a dismissed one nowhere
export function sectionOf(item)
{
	if (item.dismissed)
		return null;
	if (item.starred)
		return 'starred';

	return item.read ? 'read' : 'unread';
}

// every stored article is visited, but only the newest ones up to the limit are kept and sorted
export function newestEntries(sources, matches, limit)
{
	let entries = [];
	let total = 0;
	let floor = -Infinity;
	let seq = 0;
	// scan order breaks ties, so a longer list always starts with the shorter one
	let newestFirst = (a, b) => b.ts - a.ts || a.seq - b.seq;

	for (let source of sources)
	{
		for (let item of source.items)
		{
			if (!matches(item, source))
				continue;

			total++;

			let ts = item.timestamp;
			if (ts <= floor)
				continue;

			entries.push({ item, source, ts, seq: seq++ });

			if (limit > 0 && entries.length >= limit * 2)
			{
				entries.sort(newestFirst);
				entries.length = limit;
				floor = entries[limit - 1].ts;
			}
		}
	}

	entries.sort(newestFirst);
	if (limit > 0 && entries.length > limit)
		entries.length = limit;

	return { entries, total };
}
