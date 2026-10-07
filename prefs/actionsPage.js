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
import Gtk from 'gi://Gtk';

import * as GSKeys from '../gskeys.js';
import {
	ACTIONS, CLICK_ACTIONS, DEFAULT_CONFIG, HOVER_ACTIONS, HOVER_KEYS, LEFT_CLICK_ACTIONS,
	chooseSlotAction, isDefaultConfig, resolveConfig,
} from '../data/articleActions.js';

export function buildActionsPage(window, settings)
{
	const actionsPage = new Adw.PreferencesPage({ title : "Actions", icon_name : 'input-mouse-symbolic' });

	const readConfig = () =>
	{
		const raw = {};
		for (const key of Object.keys(DEFAULT_CONFIG))
			raw[key] = settings.get_string(key);
		return resolveConfig(raw);
	};

	let syncing = false;
	const comboRows = [];

	const addComboRow = (group, key, title, allowed) =>
	{
		const row = new Adw.ComboRow({
			title,
			model : Gtk.StringList.new(allowed.map(id => ACTIONS[id].label)),
		});

		row.connect('notify::selected', () =>
		{
			if (syncing)
				return;

			const config = readConfig();
			const next = HOVER_KEYS.includes(key) ? chooseSlotAction(config, key, allowed[row.selected]) : { ...config, [key]: allowed[row.selected] };
			for (const k of Object.keys(next))
			{
				if (next[k] !== config[k])
					settings.set_string(k, next[k]);
			}
		});

		group.add(row);
		comboRows.push({ row, key, allowed });
	};

	const hoverGroup = new Adw.PreferencesGroup({ title : "Hover buttons", description : "Buttons shown when you hover over an article." });
	actionsPage.add(hoverGroup);
	addComboRow(hoverGroup, GSKeys.HOVER_ACTION_1, "First button", HOVER_ACTIONS);
	addComboRow(hoverGroup, GSKeys.HOVER_ACTION_2, "Second button", HOVER_ACTIONS);
	addComboRow(hoverGroup, GSKeys.HOVER_ACTION_3, "Third button", HOVER_ACTIONS);

	const clickGroup = new Adw.PreferencesGroup({ title : "Mouse buttons", description : "What happens when you click an article." });
	actionsPage.add(clickGroup);
	addComboRow(clickGroup, GSKeys.CLICK_ACTION_LEFT, "Left click", LEFT_CLICK_ACTIONS);
	addComboRow(clickGroup, GSKeys.CLICK_ACTION_MIDDLE, "Middle click", CLICK_ACTIONS);
	addComboRow(clickGroup, GSKeys.CLICK_ACTION_RIGHT, "Right click", CLICK_ACTIONS);

	const resetGroup = new Adw.PreferencesGroup();
	actionsPage.add(resetGroup);

	// Adw.ButtonRow needs libadwaita 1.6, GNOME 46 ships 1.5
	const resetRow = Adw.ButtonRow ? new Adw.ButtonRow({ title : "Reset to defaults" }) : new Adw.ActionRow({ title : "Reset to defaults", activatable : true });
	resetRow.connect('activated', () =>
	{
		for (const key of Object.keys(DEFAULT_CONFIG))
			settings.reset(key);
	});
	resetGroup.add(resetRow);

	const syncRows = () =>
	{
		const config = readConfig();
		syncing = true;
		for (const { row, key, allowed } of comboRows)
			row.selected = allowed.indexOf(config[key]);
		syncing = false;

		resetRow.sensitive = !isDefaultConfig(config);
	};

	syncRows();
	const changedId = settings.connect('changed', (_settings, key) =>
	{
		if (key in DEFAULT_CONFIG)
			syncRows();
	});
	window.connect('close-request', () => { settings.disconnect(changedId); });

	return actionsPage;
}
