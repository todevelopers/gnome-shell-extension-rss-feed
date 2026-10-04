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

// a dismissed article is hidden, so it must not show up in any unread count
export function countUnread(items)
{
	return items.filter(i => !i.read && !i.dismissed).length;
}

// bulk read operations leave dismissed articles alone, so a restore brings them back as they were
export function olderItems(items, item)
{
	return items.filter(i => !i.dismissed && i.timestamp <= item.timestamp);
}

export function countDismissed(items)
{
	return items.filter(i => i.dismissed).length;
}

export function collectStarred(sources)
{
	let entries = [];

	for (let source of sources)
	{
		for (let item of source.items)
		{
			if (item.starred)
				entries.push({ item, source });
		}
	}

	return entries.sort((a, b) => b.item.timestamp - a.item.timestamp);
}

// a file without a configured feed is worth keeping only for its starred articles
export function classifyOrphan(data)
{
	if (data && typeof data.url === 'string' && Array.isArray(data.items) && data.items.some(i => i && i.starred))
		return 'archive';

	return 'delete';
}
