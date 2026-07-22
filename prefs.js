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

import Soup from 'gi://Soup';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as GSKeys from './gskeys.js';
import { GSAA } from './gsaa.js';
import { buildGeneralPage } from './prefs/generalPage.js';
import { buildNotificationsPage } from './prefs/notificationsPage.js';
import { buildSourcesPage } from './prefs/sourcesPage.js';

export default class RssFeedPreferences extends ExtensionPreferences
{
	fillPreferencesWindow(window)
	{
		const settings = this.getSettings();
		const aSettings = new GSAA(settings, GSKeys.RSS_FEEDS_SETTINGS);

		const httpSession = new Soup.Session({ timeout : 30 });

		window.connect('close-request', () =>
		{
			httpSession.abort();
			aSettings.destroy();
		});

		window.set_default_size(720, 720);

		window.add(buildGeneralPage(window, settings));
		window.add(buildNotificationsPage(window, settings));
		window.add(buildSourcesPage(window, settings, aSettings, httpSession));
	}
}
