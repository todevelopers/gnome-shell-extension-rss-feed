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

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as GSKeys from './gskeys.js';
import { FeedStore } from './data/feedStore.js';
import { FeedRepository } from './data/feedRepository.js';
import { FeedPoller } from './data/feedPoller.js';
import { RssIndicator } from './ui/indicator.js';
import { NotificationManager } from './ui/notificationManager.js';

export default class RssFeedExtension extends Extension
{
	enable()
	{
		let settings = this.getSettings();
		this._settings = settings;

		this._store = new FeedStore();
		this._repository = new FeedRepository(settings);
		this._repository.load(this._store);

		this._poller = new FeedPoller(this._store, this._repository, settings);
		this._notificationManager = new NotificationManager(this._store, settings);

		this._indicator = new RssIndicator(settings, this, this._store);
		this._indicator.onReload = () => this._poller.refresh();
		this._poller.onComplete = () => this._indicator?.markUpdated();
		Main.panel.addToStatusArea('rssFeedMenu', this._indicator, 0, 'right');

		this._listChangedId = settings.connect('changed::' + GSKeys.RSS_FEEDS_LIST, () =>
		{
			this._repository.sync(this._store);
			this._poller.refresh();
		});

		this._settingsChangedId = settings.connect('changed::' + GSKeys.RSS_FEEDS_SETTINGS, () =>
		{
			this._repository.sync(this._store);
		});

		this._poller.start();

		console.debug("[rss-feed] Extension enabled.");
	}

	disable()
	{
		// unlock-dialog: stays active on the lock screen only to dispatch RSS notifications when notifications-on-lockscreen is enabled; no keyboard input is captured while locked (the panel menu cannot open in unlock-dialog)
		if (this._listChangedId)
			this._settings.disconnect(this._listChangedId);

		if (this._settingsChangedId)
			this._settings.disconnect(this._settingsChangedId);

		this._indicator?.destroy();
		this._poller?.destroy();
		this._notificationManager?.destroy();
		this._repository?.destroy();

		this._indicator = null;
		this._poller = null;
		this._notificationManager = null;
		this._repository = null;
		this._store = null;
		this._settings = null;
		this._listChangedId = null;
		this._settingsChangedId = null;

		console.debug("[rss-feed] Extension disabled.");
	}
}
