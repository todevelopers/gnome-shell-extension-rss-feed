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

// Turns a batch of newly added items into notifications to raise and stale ones to drop (dedup + limit).
export function planNotifications(payload, ctx)
{
	let toShow = [];
	let toDismiss = [];

	if (payload.initial || !ctx.enabled || ctx.mute || (ctx.locked && !ctx.notifOnLockScreen))
		return { toShow, toDismiss };

	let known = new Set(ctx.liveIds);
	let live = ctx.liveIds.slice();

	for (let { item, update } of payload.items)
	{
		// a feed editing an item it already notified about replaces the old banner, not stacks on it
		if (known.has(item.id))
		{
			live.splice(live.indexOf(item.id), 1);
			toDismiss.push(item.id);
		}

		live.push(item.id);
		toShow.push({
			id : item.id,
			title : update ? 'UPDATE: ' + item.title : item.title,
			body : item.desc || item.title,
			url : item.link,
		});
	}

	while (live.length > ctx.limit)
	{
		let id = live.shift();
		if (known.has(id) && !toDismiss.includes(id))
			toDismiss.push(id);
	}

	return { toShow: toShow.filter(s => live.includes(s.id)), toDismiss };
}
