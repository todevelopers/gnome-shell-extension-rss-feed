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

import * as GSKeys from '../gskeys.js';
import { makeSpinRow, makeSwitchRow } from './prefsWidgets.js';

const MAX_NOTIFICATIONS = 100;

export function buildNotificationsPage(window, settings)
{
	const notifPage = new Adw.PreferencesPage({ title : "Notifications", icon_name : 'preferences-system-notifications-symbolic' });

	const notifGroup = new Adw.PreferencesGroup({ title : "Notifications" });
	notifPage.add(notifGroup);

	const notifMaxRow = makeSpinRow(settings, GSKeys.MAX_NOTIFICATIONS, "Notifications limit", 1, MAX_NOTIFICATIONS);
	notifMaxRow.subtitle = "Limits how many notifications are shown in a single batch.";
	notifGroup.add(notifMaxRow);

	const notifGroupRow = makeSwitchRow(settings, GSKeys.GROUP_NOTIFICATIONS_BY_SOURCE, "Group by RSS Source");
	notifGroupRow.subtitle = "Show each feed's notifications as its own group instead of one shared 'RSS Feed' source.";
	notifGroup.add(notifGroupRow);

	const notifLockRow = makeSwitchRow(settings, GSKeys.NOTIFICATIONS_ON_LOCKSCREEN, "Show on lock screen");
	notifLockRow.subtitle = "Allow notifications to appear when the screen is locked.";
	notifGroup.add(notifLockRow);

	const notifCleanRow = makeSwitchRow(settings, GSKeys.CLEANUP_NOTIFICATIONS, "Clear on disable");
	notifCleanRow.subtitle = "Removes all RSS notifications from the tray when the extension is disabled.";
	notifGroup.add(notifCleanRow);

	const updateNotifSensitive = () =>
	{
		let enabled = settings.get_string(GSKeys.DISPLAY_MODE) !== 'widget-only';
		notifMaxRow.sensitive = enabled;
		notifGroupRow.sensitive = enabled;
		notifLockRow.sensitive = enabled;
		notifCleanRow.sensitive = enabled;
	};

	updateNotifSensitive();
	const displayModeId = settings.connect('changed::' + GSKeys.DISPLAY_MODE, updateNotifSensitive);
	window.connect('close-request', () => { settings.disconnect(displayModeId); });

	return notifPage;
}
