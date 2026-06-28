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
import { makeSpinRow } from './prefsWidgets.js';

const MAX_UPDATE_INTERVAL = 1440;
const MAX_SOURCES_LIMIT = 1024;
const MAX_HEIGHT = 8192;

export function buildGeneralPage(settings)
{
	const generalPage = new Adw.PreferencesPage({ title : "General", icon_name : 'preferences-system-symbolic' });

	const layoutGroup = new Adw.PreferencesGroup({ title : "Layout" });
	generalPage.add(layoutGroup);

	const layouts = [
		{ id: 'classic', title: 'Classic', subtitle: 'Group articles by feed with expandable sections' },
		{ id: 'minimal', title: 'Minimal', subtitle: 'Flat chronological list, unread first' },
	];

	let radioGroup = null;
	const layoutRows = [];
	for (const layout of layouts)
	{
		const row = new Adw.ActionRow({
			title : layout.title,
			subtitle : layout.subtitle,
			activatable : true,
		});

		const radio = new Gtk.CheckButton({
			valign : Gtk.Align.CENTER,
			group : radioGroup,
		});
		if (radioGroup === null)
			radioGroup = radio;

		radio.active = settings.get_string(GSKeys.LAYOUT_MODE) === layout.id;
		radio.connect('toggled', () =>
		{
			if (radio.active)
				settings.set_string(GSKeys.LAYOUT_MODE, layout.id);
		});

		row.add_prefix(radio);
		row.set_activatable_widget(radio);
		layoutGroup.add(row);
		layoutRows.push({ row, radio, id: layout.id });
	}

	const syncLayoutRows = () =>
	{
		let current = settings.get_string(GSKeys.LAYOUT_MODE);
		for (const { row, radio, id } of layoutRows)
		{
			let active = id === current;
			if (radio.active !== active)
				radio.active = active;
			if (active)
				row.add_css_class('selected');
			else
				row.remove_css_class('selected');
		}
	};
	syncLayoutRows();
	settings.connect('changed::' + GSKeys.LAYOUT_MODE, syncLayoutRows);

	const displayGroup = new Adw.PreferencesGroup({ title : "Display" });
	generalPage.add(displayGroup);

	const maxHeightRow = makeSpinRow(settings, GSKeys.MAX_HEIGHT, "Menu height (px)", 1, MAX_HEIGHT);
	maxHeightRow.subtitle = "Menu scrolls when content exceeds this height.";
	displayGroup.add(maxHeightRow);

	const itemsPerSourceRow = makeSpinRow(settings, GSKeys.ITEMS_VISIBLE, "Visible articles before 'Show more'", 1, MAX_SOURCES_LIMIT);
	itemsPerSourceRow.subtitle = "How many articles each feed (Classic) or section (Minimal) shows.";
	displayGroup.add(itemsPerSourceRow);

	const pollingGroup = new Adw.PreferencesGroup({ title : "Polling" });
	generalPage.add(pollingGroup);

	const updateIntervalRow = makeSpinRow(settings, GSKeys.UPDATE_INTERVAL, "Update interval (min)", 1, MAX_UPDATE_INTERVAL);
	updateIntervalRow.subtitle = "How often all feeds are downloaded in the background.";
	pollingGroup.add(updateIntervalRow);

	return generalPage;
}
