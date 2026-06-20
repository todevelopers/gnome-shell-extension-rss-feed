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

// Diffs a freshly parsed feed against the cached items: what was added, removed or updated.
export function computeFeedDiff(existing, parsed, opts)
{
	let visible = parsed.slice(0, opts.itemsVisible);

	let added = [];
	let removed = [];
	let updated = [];

	if (!visible.length)
		return { added, removed, updated };

	let incoming = new Map();
	for (let item of visible)
	{
		if (!incoming.has(item.id))
			incoming.set(item.id, item);
	}

	let existingIds = new Set();
	let updatedIds = new Set();

	for (let item of existing)
	{
		existingIds.add(item.id);

		let match = incoming.get(item.id);
		if (!match)
			removed.push(item);
		else if (isUpdate(item, match, opts.disableUpdates))
			updatedIds.add(item.id);
	}

	for (let item of incoming.values())
	{
		if (!existingIds.has(item.id))
			added.push(item);
		else if (updatedIds.has(item.id))
			updated.push(item);
	}

	return { added, removed, updated };
}

function isUpdate(existing, parsed, disableUpdates)
{
	if (disableUpdates)
		return false;

	if (parsed.publishDate && normDate(existing.publishDate) !== normDate(parsed.publishDate))
		return true;

	return normDate(existing.updateTime) !== normDate(parsed.updateTime);
}

function normDate(s)
{
	if (!s)
		return '';

	let t = new Date(s).getTime();
	return isNaN(t) ? s : String(t);
}
