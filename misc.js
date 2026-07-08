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
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export function processLinkOpen(url)
{
	if (isScreenLocked())
		return false;

	Gio.app_info_launch_default_for_uri(url, null);
	return true;
}

export function feedInitials(title)
{
	if (!title)
		return '··';

	let stopWords = /^(the|a|an|der|die|das|le|la)$/i;
	let words = title.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.split(/\s+/)
		.filter(w => w && !stopWords.test(w));

	if (words.length === 0)
		return '··';
	if (words.length === 1)
		return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[1][0]).toUpperCase();
}

export function makeAvatarIcon(title)
{
	let initials = feedInitials(title)
		.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

	let svg = '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">'
		+ '<circle cx="48" cy="48" r="48" fill="#5f6368"/>'
		+ '<text x="48" y="60" text-anchor="middle" fill="rgba(255,255,255,0.95)"'
		+ ' font-family="sans-serif" font-size="39" font-weight="700">'
		+ initials + '</text></svg>';

	return Gio.BytesIcon.new(GLib.Bytes.new(new TextEncoder().encode(svg)));
}

export function isScreenLocked()
{
	return Main.sessionMode.isLocked;
}

export function relativeTime(dateStr)
{
	if (!dateStr) return '';

	let diff = (Date.now() - new Date(dateStr).getTime()) / 60000;
	if (diff < 60) return Math.round(Math.max(1, diff)) + 'm';
	if (diff < 1440) return Math.round(diff / 60) + 'h';
	if (diff < 20160) return Math.round(diff / 1440) + 'd';
	return Math.round(diff / 10080) + 'w';
}
