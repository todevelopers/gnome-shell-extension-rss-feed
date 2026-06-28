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

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

export function urlToInitials(url)
{
	let domain = url.replace(/^https?:\/\//, '').split('/')[0];
	let parts = domain.split('.').filter(p => p.length > 0);
	let filtered = parts.filter(p => !['www', 'feeds', 'feed', 'rss', 'com', 'org', 'net', 'co', 'uk', 'io', 'news'].includes(p));
	if (!filtered.length) filtered = parts;
	if (filtered.length >= 2)
		return (filtered[0][0] + filtered[1][0]).toUpperCase();
	return filtered[0] ? filtered[0].slice(0, 2).toUpperCase() : '--';
}

export function getInitials(title)
{
	let stopWords = /^(the|a|an|der|die|das|le|la)$/i;
	let words = title.replace(/[^\p{L}\p{N}\s]/gu, ' ')
		.split(/\s+/)
		.filter(w => w && !stopWords.test(w));
	if (words.length === 0)
		return '--';
	if (words.length === 1)
		return words[0].slice(0, 2).toUpperCase();
	return (words[0][0] + words[1][0]).toUpperCase();
}

export function makeSwitchRow(settings, key, title)
{
	const row = new Adw.SwitchRow({ title });
	settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
	return row;
}

export function makeSpinRow(settings, key, title, min, max)
{
	const row = new Adw.SpinRow(
	{
		title,
		adjustment : new Gtk.Adjustment(
		{
			lower : min,
			upper : max,
			step_increment : 1,
		}),
	});
	settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
	return row;
}
