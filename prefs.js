/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2015
 *     Tomas Gazovic <gazovic.tomasgmail.com>,
 *     Janka Gazovicova <jana.gazovicova@gmail.com>
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
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Soup from 'gi://Soup';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as GSKeys from './gskeys.js';
import { GSAA } from './gsaa.js';
import * as HTTP from './http.js';
import { createRssParser } from './parsers/factory.js';

const MAX_UPDATE_INTERVAL = 1440;
const MAX_SOURCES_LIMIT = 1024;
const MAX_POLL_DELAY = 9999;
const MAX_HEIGHT = 8192;
const MAX_NOTIFICATIONS = 100;

export default class RssFeedPreferences extends ExtensionPreferences
{
	fillPreferencesWindow(window)
	{
		const settings = this.getSettings();
		const aSettings = new GSAA(settings, GSKeys.RSS_FEEDS_SETTINGS);

		const httpSession = new Soup.Session({ timeout : 30 });
		const cancellable = new Gio.Cancellable();

		window.connect('close-request', () =>
		{
			cancellable.cancel();
			aSettings.destroy();
		});

		// General page
		const generalPage = new Adw.PreferencesPage({ title : "General", icon_name : 'preferences-system-symbolic' });
		window.add(generalPage);

		// Polling group
		const pollingGroup = new Adw.PreferencesGroup({ title : "Polling" });
		generalPage.add(pollingGroup);

		pollingGroup.add(this._makeSpinRow(settings, GSKeys.UPDATE_INTERVAL, "Update interval (min)", 1, MAX_UPDATE_INTERVAL));
		pollingGroup.add(this._makeSpinRow(settings, GSKeys.POLL_DELAY, "Poll delay (ms)", 1, MAX_POLL_DELAY));
		pollingGroup.add(this._makeSwitchRow(settings, GSKeys.DETECT_UPDATES, "Detect updates"));

		// Menu group
		const menuGroup = new Adw.PreferencesGroup({ title : "Menu" });
		generalPage.add(menuGroup);

		const layoutBox = new Gtk.Box({ spacing: 12, margin_top: 4, margin_bottom: 4 });
		for (const { id, label } of [{ id: 'classic', label: 'Classic' }, { id: 'minimal', label: 'Minimal' }])
		{
			let btn = new Gtk.Button({ label, css_classes: ['card'] });
			btn.connect('clicked', () => settings.set_string(GSKeys.LAYOUT_MODE, id));
			settings.connect('changed::' + GSKeys.LAYOUT_MODE, () =>
			{
				let active = settings.get_string(GSKeys.LAYOUT_MODE) === id;
				btn.add_css_class(active ? 'suggested-action' : 'flat');
				btn.remove_css_class(active ? 'flat' : 'suggested-action');
			});
			layoutBox.append(btn);
		}
		const layoutRow = new Adw.ActionRow({ title: 'Layout' });
		layoutRow.add_suffix(layoutBox);
		menuGroup.add(layoutRow);

		menuGroup.add(this._makeSpinRow(settings, GSKeys.MAX_HEIGHT, "Max menu height (px)", 1, MAX_HEIGHT));
		menuGroup.add(this._makeSpinRow(settings, GSKeys.ITEMS_VISIBLE, "Max items per source", 1, MAX_SOURCES_LIMIT));
		menuGroup.add(this._makeSwitchRow(settings, GSKeys.ENABLE_ANIMATIONS, "Enable animations"));
		menuGroup.add(this._makeSwitchRow(settings, GSKeys.MB_ALIGN_TOP, "Top-align buttons"));
		menuGroup.add(this._makeSwitchRow(settings, GSKeys.ENABLE_DESC, "Show descriptions"));

		// Notifications page
		const notifPage = new Adw.PreferencesPage({ title : "Notifications", icon_name : 'notifications-symbolic' });
		window.add(notifPage);

		const notifGroup = new Adw.PreferencesGroup({ title : "Notifications" });
		notifPage.add(notifGroup);

		const notifSwitch = this._makeSwitchRow(settings, GSKeys.ENABLE_NOTIFICATIONS, "Show notifications");
		notifGroup.add(notifSwitch);

		const notifMaxRow = this._makeSpinRow(settings, GSKeys.MAX_NOTIFICATIONS, "Max notifications", 1, MAX_NOTIFICATIONS);
		notifGroup.add(notifMaxRow);

		const notifLockRow = this._makeSwitchRow(settings, GSKeys.NOTIFICATIONS_ON_LOCKSCREEN, "Show on lock screen");
		notifGroup.add(notifLockRow);

		const notifCleanRow = this._makeSwitchRow(settings, GSKeys.CLEANUP_NOTIFICATIONS, "Clean up notifications");
		notifGroup.add(notifCleanRow);

		const updateNotifSensitive = (enabled) =>
		{
			notifMaxRow.sensitive = enabled;
			notifLockRow.sensitive = enabled;
			notifCleanRow.sensitive = enabled;
		};

		updateNotifSensitive(settings.get_boolean(GSKeys.ENABLE_NOTIFICATIONS));
		settings.connect('changed::' + GSKeys.ENABLE_NOTIFICATIONS, () =>
		{
			updateNotifSensitive(settings.get_boolean(GSKeys.ENABLE_NOTIFICATIONS));
		});

		// Sources page
		const sourcesPage = new Adw.PreferencesPage({ title : "Sources", icon_name : 'view-list-symbolic' });
		window.add(sourcesPage);

		const sourcesOptionsGroup = new Adw.PreferencesGroup();
		sourcesPage.add(sourcesOptionsGroup);
		sourcesOptionsGroup.add(this._makeSwitchRow(settings, GSKeys.MARK_INITIAL_AS_NEW, "Mark items from first poll as new"));

		const sourcesGroup = new Adw.PreferencesGroup({ title : "RSS Sources" });
		sourcesPage.add(sourcesGroup);

		// Header suffix: Add + Re-check buttons
		const headerBox = new Gtk.Box({ spacing : 8 });

		const recheckBtn = new Gtk.Button(
		{
			icon_name : 'view-refresh-symbolic',
			tooltip_text : "Re-check all RSS sources",
			valign : Gtk.Align.CENTER,
		});
		headerBox.append(recheckBtn);

		const addBtn = new Gtk.Button(
		{
			icon_name : 'list-add-symbolic',
			tooltip_text : "Add source",
			valign : Gtk.Align.CENTER,
		});
		headerBox.append(addBtn);

		sourcesGroup.set_header_suffix(headerBox);

		// Cache for pending requests: url -> cancellable
		const fCache = new Object();

		const validateUrl = (entryRow, url) =>
		{
			if (!url.length)
				return;

			let jsonParams = HTTP.getParametersAsJson(url);
			let l2o = url.indexOf('?');
			let baseUrl = l2o != -1 ? url.substr(0, l2o) : url;
			let finalUrl = HTTP.buildUrl(baseUrl, jsonParams);

			let msg = Soup.Message.new('GET', finalUrl);
			if (!msg)
			{
				entryRow.set_title("Invalid URL");
				return;
			}

			if (fCache[url])
				fCache[url].cancel();

			let rowCancellable = new Gio.Cancellable();
			fCache[url] = rowCancellable;

			entryRow._statusLabel.set_text("Checking..");

			httpSession.send_and_read_async(msg, GLib.PRIORITY_DEFAULT, rowCancellable,
				(session, result) =>
				{
					delete fCache[url];

					let bytes;
					try
					{
						bytes = session.send_and_read_finish(result);
					}
					catch (e)
					{
						if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
						{
							entryRow._statusLabel.set_text("");
							return;
						}
						entryRow._statusLabel.set_text("Error");
						return;
					}

					let status = msg.get_status();
					if (!(status >= 200 && status < 300))
					{
						entryRow._statusLabel.set_text(Soup.Status.get_phrase(status));
						return;
					}

					let parser;
					try
					{
						let data = new TextDecoder().decode(bytes.toArray());
						parser = createRssParser(data);
					}
					catch (e)
					{
						entryRow._statusLabel.set_text(e.message || "Parse error");
						return;
					}

					if (parser == null)
					{
						entryRow._statusLabel.set_text("Unable to parse");
						return;
					}
					parser.parse();
					entryRow._statusLabel.set_text("OK (" + parser._type + ")");
					entryRow._titleLabel.set_text(parser.Publisher.Title);
				});
		};

		const buildSourceRow = (url) =>
		{
			const row = new Adw.EntryRow({ title : url });

			const titleLabel = new Gtk.Label({ label : "", xalign : 0.0, hexpand : true });
			titleLabel.add_css_class('dim-label');
			row._titleLabel = titleLabel;

			const statusLabel = new Gtk.Label({ label : "", xalign : 1.0 });
			statusLabel.add_css_class('dim-label');
			row._statusLabel = statusLabel;

			const noNotifBtn = new Gtk.ToggleButton(
			{
				icon_name : 'notifications-disabled-symbolic',
				tooltip_text : "No notifications",
				valign : Gtk.Align.CENTER,
			});
			noNotifBtn.active = !!aSettings.get(url, 'n');
			noNotifBtn.connect('toggled', () =>
			{
				aSettings.set(url, 'n', noNotifBtn.active);
			});

			const noUpdBtn = new Gtk.ToggleButton(
			{
				icon_name : 'software-update-urgent-symbolic',
				tooltip_text : "No updates detection",
				valign : Gtk.Align.CENTER,
			});
			noUpdBtn.active = !!aSettings.get(url, 'u');
			noUpdBtn.connect('toggled', () =>
			{
				aSettings.set(url, 'u', noUpdBtn.active);
			});

			const upBtn = new Gtk.Button(
			{
				icon_name : 'go-up-symbolic',
				tooltip_text : "Move up",
				valign : Gtk.Align.CENTER,
			});

			const downBtn = new Gtk.Button(
			{
				icon_name : 'go-down-symbolic',
				tooltip_text : "Move down",
				valign : Gtk.Align.CENTER,
			});

			const delBtn = new Gtk.Button(
			{
				icon_name : 'list-remove-symbolic',
				tooltip_text : "Remove",
				valign : Gtk.Align.CENTER,
			});
			delBtn.add_css_class('destructive-action');

			row.add_suffix(titleLabel);
			row.add_suffix(statusLabel);
			row.add_suffix(noNotifBtn);
			row.add_suffix(noUpdBtn);
			row.add_suffix(upBtn);
			row.add_suffix(downBtn);
			row.add_suffix(delBtn);

			row.connect('apply', () =>
			{
				let newUrl = row.get_text().trim();
				if (!newUrl.length)
					return;

				let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
				let idx = feeds.indexOf(url);
				if (idx == -1)
					return;

				aSettings.rename(url, newUrl);
				feeds[idx] = newUrl;
				settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);

				url = newUrl;
				row.set_title(newUrl);
				validateUrl(row, newUrl);
			});

			upBtn.connect('clicked', () =>
			{
				let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
				let idx = feeds.indexOf(url);
				if (idx <= 0)
					return;

				[feeds[idx - 1], feeds[idx]] = [feeds[idx], feeds[idx - 1]];
				settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);

				refreshSourcesList();
			});

			downBtn.connect('clicked', () =>
			{
				let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
				let idx = feeds.indexOf(url);
				if (idx == -1 || idx >= feeds.length - 1)
					return;

				[feeds[idx], feeds[idx + 1]] = [feeds[idx + 1], feeds[idx]];
				settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);

				refreshSourcesList();
			});

			delBtn.connect('clicked', () =>
			{
				aSettings.remove(url);
				let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
				let idx = feeds.indexOf(url);
				if (idx != -1)
					feeds.splice(idx, 1);
				settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);

				sourcesGroup.remove(row);
			});

			validateUrl(row, url);

			return row;
		};

		const rowMap = new Map();

		const refreshSourcesList = () =>
		{
			let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);

			for (let [url, row] of rowMap)
			{
				if (!feeds.includes(url))
				{
					sourcesGroup.remove(row);
					rowMap.delete(url);
				}
			}

			for (let i = 0; i < feeds.length; i++)
			{
				let url = feeds[i];
				if (!rowMap.has(url))
				{
					let row = buildSourceRow(url);
					sourcesGroup.add(row);
					rowMap.set(url, row);
				}
			}
		};

		refreshSourcesList();

		recheckBtn.connect('clicked', () =>
		{
			let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
			for (let url of feeds)
			{
				let row = rowMap.get(url);
				if (row)
					validateUrl(row, url);
			}
		});

		addBtn.connect('clicked', () =>
		{
			let dialog = new Adw.MessageDialog(
			{
				transient_for : window,
				heading : "New RSS Feed source",
			});

			let entry = new Gtk.Entry(
			{
				placeholder_text : "https://example.com/rss",
				activates_default : true,
			});

			dialog.set_extra_child(entry);
			dialog.add_response('cancel', "Cancel");
			dialog.add_response('ok', "Add");
			dialog.set_default_response('ok');
			dialog.set_response_appearance('ok', Adw.ResponseAppearance.SUGGESTED);

			dialog.connect('response', (d, response) =>
			{
				if (response != 'ok')
				{
					d.destroy();
					return;
				}

				let url = entry.get_text().trim();
				if (!url.length)
				{
					d.destroy();
					return;
				}

				let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
				feeds.push(url);
				settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);

				let row = buildSourceRow(url);
				sourcesGroup.add(row);
				rowMap.set(url, row);

				d.destroy();
			});

			dialog.present();
		});
	}

	_makeSwitchRow(settings, key, title)
	{
		const row = new Adw.SwitchRow({ title });
		settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
		return row;
	}

	_makeSpinRow(settings, key, title, min, max)
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
}
