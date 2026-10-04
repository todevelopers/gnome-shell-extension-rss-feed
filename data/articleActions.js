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

import * as GSKeys from '../gskeys.js';

// not a themed icon: it names the file in the extension's icons directory
export const EXTERNAL_LINK_ICON = 'external-link-symbolic';

export const ACTIONS = {
	none: { label: 'None' },
	openread: { label: 'Open and mark as read' },
	read: {
		label: 'Mark as read / unread',
		icon: item => item.read ? 'mail-unread-symbolic' : 'mail-read-symbolic',
		title: item => item.read ? 'Mark as unread' : 'Mark as read',
	},
	star: {
		label: 'Star / unstar',
		icon: item => item.starred ? 'starred-symbolic' : 'non-starred-symbolic',
		title: item => item.starred ? 'Unstar' : 'Star',
	},
	dismiss: { label: 'Dismiss', icon: () => 'window-close-symbolic', title: () => 'Dismiss' },
	older: { label: 'Mark older as read', icon: () => 'go-bottom-symbolic', title: () => 'Mark this and older as read' },
	copy: { label: 'Copy link', icon: () => 'edit-copy-symbolic', title: () => 'Copy link' },
	open: { label: 'Open without marking as read', icon: () => EXTERNAL_LINK_ICON, title: () => 'Open without marking as read' },
};

export const HOVER_ACTIONS = ['none', 'read', 'star', 'dismiss', 'older', 'copy', 'open'];
export const LEFT_CLICK_ACTIONS = ['openread', 'open'];
export const CLICK_ACTIONS = ['none', 'openread', 'open', 'read', 'star', 'dismiss', 'older', 'copy'];

export const DEFAULT_CONFIG = {
	[GSKeys.HOVER_ACTION_1]: 'read',
	[GSKeys.HOVER_ACTION_2]: 'star',
	[GSKeys.CLICK_ACTION_LEFT]: 'openread',
	[GSKeys.CLICK_ACTION_MIDDLE]: 'open',
	[GSKeys.CLICK_ACTION_RIGHT]: 'copy',
};

const ALLOWED_ACTIONS = {
	[GSKeys.HOVER_ACTION_1]: HOVER_ACTIONS,
	[GSKeys.HOVER_ACTION_2]: HOVER_ACTIONS,
	[GSKeys.CLICK_ACTION_LEFT]: LEFT_CLICK_ACTIONS,
	[GSKeys.CLICK_ACTION_MIDDLE]: CLICK_ACTIONS,
	[GSKeys.CLICK_ACTION_RIGHT]: CLICK_ACTIONS,
};

export function resolveAction(value, allowedList, fallback)
{
	return allowedList.includes(value) ? value : fallback;
}

// a config is an object keyed by the settings key names
export function resolveConfig(config)
{
	let resolved = {};

	for (let key of Object.keys(DEFAULT_CONFIG))
		resolved[key] = resolveAction(config[key], ALLOWED_ACTIONS[key], DEFAULT_CONFIG[key]);

	return resolved;
}

export function hoverSlots(config)
{
	let slots = [config[GSKeys.HOVER_ACTION_1], config[GSKeys.HOVER_ACTION_2]].filter(id => id !== 'none');

	return [...new Set(slots)];
}

// picking the action that the other slot already has swaps the two slots
export function chooseSlotAction(config, slot, value)
{
	let other = slot === GSKeys.HOVER_ACTION_1 ? GSKeys.HOVER_ACTION_2 : GSKeys.HOVER_ACTION_1;
	let next = { ...config, [slot]: value };

	if (value !== 'none' && config[other] === value)
		next[other] = config[slot];

	return next;
}

export function isDefaultConfig(config)
{
	let resolved = resolveConfig(config);

	return Object.keys(DEFAULT_CONFIG).every(key => resolved[key] === DEFAULT_CONFIG[key]);
}

export function buttonIcon(id, item)
{
	return ACTIONS[id].icon(item);
}

export function buttonTitle(id, item)
{
	return ACTIONS[id].title(item);
}
