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
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Soup from 'gi://Soup';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import * as GSKeys from './gskeys.js';
import { GSAA } from './gsaa.js';
import * as HTTP from './http.js';
import { createRssParser } from './parsers/factory.js';

const MAX_UPDATE_INTERVAL = 1440;
const MAX_SOURCES_LIMIT = 1024;
const MAX_HEIGHT = 8192;
const MAX_NOTIFICATIONS = 100;

function urlToInitials(url)
{
	let domain = url.replace(/^https?:\/\//, '').split('/')[0];
	let parts = domain.split('.').filter(p => p.length > 0);
	let filtered = parts.filter(p => !['www', 'feeds', 'feed', 'rss', 'com', 'org', 'net', 'co', 'uk', 'io', 'news'].includes(p));
	if (!filtered.length) filtered = parts;
	if (filtered.length >= 2)
		return (filtered[0][0] + filtered[1][0]).toUpperCase();
	return filtered[0] ? filtered[0].slice(0, 2).toUpperCase() : '--';
}

function getInitials(title)
{
	let words = title.trim().split(/\s+/).filter(w => /\p{L}/u.test(w[0]));
	if (words.length >= 2)
		return (words[0][0] + words[1][0]).toUpperCase();
	return title.substring(0, 2).toUpperCase();
}

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

		// Layout group
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

		// Display group
		const displayGroup = new Adw.PreferencesGroup({ title : "Display" });
		generalPage.add(displayGroup);

		displayGroup.add(this._makeSpinRow(settings, GSKeys.MAX_HEIGHT, "Max menu height (px)", 1, MAX_HEIGHT));
		displayGroup.add(this._makeSpinRow(settings, GSKeys.ITEMS_VISIBLE, "Max items per source", 1, MAX_SOURCES_LIMIT));
		const pollingGroup = new Adw.PreferencesGroup({ title : "Polling" });
		generalPage.add(pollingGroup);

		pollingGroup.add(this._makeSpinRow(settings, GSKeys.UPDATE_INTERVAL, "Update interval (min)", 1, MAX_UPDATE_INTERVAL));

		// Notifications page
		const notifPage = new Adw.PreferencesPage({ title : "Notifications", icon_name : 'preferences-system-notifications-symbolic' });
		window.add(notifPage);

		const notifGroup = new Adw.PreferencesGroup({ title : "Notifications" });
		notifPage.add(notifGroup);

		const notifSwitch = this._makeSwitchRow(settings, GSKeys.ENABLE_NOTIFICATIONS, "Show notifications");
		notifGroup.add(notifSwitch);

		const notifMaxRow = this._makeSpinRow(settings, GSKeys.MAX_NOTIFICATIONS, "Max notifications", 1, MAX_NOTIFICATIONS);
		notifGroup.add(notifMaxRow);

		const notifLockRow = this._makeSwitchRow(settings, GSKeys.NOTIFICATIONS_ON_LOCKSCREEN, "Show on lock screen");
		notifGroup.add(notifLockRow);

		const notifCleanRow = this._makeSwitchRow(settings, GSKeys.CLEANUP_NOTIFICATIONS, "Auto-cleanup");
		notifCleanRow.subtitle = "Removes all RSS notifications from the tray when the extension is disabled.";
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

		const sourcesGroup = new Adw.PreferencesGroup({ title : "RSS Sources" });
		sourcesPage.add(sourcesGroup);

		const cssProvider = new Gtk.CssProvider();
		cssProvider.load_from_string(`
			.source-avatar {
				border-radius: 9999px;
				background-color: alpha(@window_fg_color, 0.08);
				color: alpha(@window_fg_color, 0.4);
				min-width: 32px;
				min-height: 32px;
				font-size: 11px;
				font-weight: bold;
			}
			.status-pill {
				border-radius: 9999px;
				padding: 2px 8px;
				font-size: 11px;
				font-weight: 500;
				background-color: alpha(@window_fg_color, 0.06);
			}
			.status-ok {
				background-color: alpha(@success_color, 0.15);
				color: @success_color;
			}
			.status-error {
				background-color: alpha(@error_color, 0.13);
				color: @error_color;
			}
			.dnd-over {
				border-top: 2px solid @accent_color;
			}
			.source-action-btn {
				border-radius: 9999px;
				min-width: 30px;
				min-height: 30px;
				padding: 0;
			}
			.source-action-btn:checked {
				background-color: transparent;
			}
			.source-delete-btn {
				color: @error_color;
			}
			.source-delete-btn:hover {
				background-color: alpha(@error_color, 0.12);
			}
		`);
		Gtk.StyleContext.add_provider_for_display(
			Gdk.Display.get_default(),
			cssProvider,
			Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
		);

		const fCache = new Object();

		const validateUrl = (row, url) =>
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
				row._statusLabel.set_label("Invalid URL");
				row._statusLabel.remove_css_class('status-ok');
				row._statusLabel.add_css_class('status-error');
				return;
			}

			if (fCache[url])
				fCache[url].cancel();

			let rowCancellable = new Gio.Cancellable();
			fCache[url] = rowCancellable;

			row._statusLabel.set_label("Checking…");
			row._statusLabel.remove_css_class('status-ok');
			row._statusLabel.remove_css_class('status-error');

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
							row._statusLabel.set_label("");
							return;
						}
						row._statusLabel.set_label("Error");
						row._statusLabel.remove_css_class('status-ok');
						row._statusLabel.add_css_class('status-error');
						return;
					}

					let status = msg.get_status();
					if (!(status >= 200 && status < 300))
					{
						row._statusLabel.set_label(Soup.Status.get_phrase(status));
						row._statusLabel.remove_css_class('status-ok');
						row._statusLabel.add_css_class('status-error');
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
						row._statusLabel.set_label(e.message || "Parse error");
						row._statusLabel.remove_css_class('status-ok');
						row._statusLabel.add_css_class('status-error');
						return;
					}

					if (parser == null)
					{
						row._statusLabel.set_label("Unable to parse");
						row._statusLabel.remove_css_class('status-ok');
						row._statusLabel.add_css_class('status-error');
						return;
					}
					parser.parse();
					row._statusLabel.set_label("OK (" + parser._type + ")");
					row._statusLabel.remove_css_class('status-error');
					row._statusLabel.add_css_class('status-ok');
					if (!aSettings.get(url, 't'))
					{
						row.set_title(parser.Publisher.Title);
						aSettings.set(url, 't', parser.Publisher.Title);
						if (row._titleEntry && !row._titleEntry.get_text().trim())
						{
							row._titleEntry.set_text(parser.Publisher.Title);
							row._titleDirty = false;
						}
					}
					if (!aSettings.get(url, 'v'))
						row._avatarLabel.set_label(getInitials(parser.Publisher.Title));
				});
		};

		const rowMap = new Map();

		const reorderFeeds = (draggedUrl, targetUrl) =>
		{
			let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
			let srcIdx = feeds.indexOf(draggedUrl);
			let dstIdx = feeds.indexOf(targetUrl);
			if (srcIdx === -1 || dstIdx === -1 || srcIdx === dstIdx)
				return;
			feeds.splice(srcIdx, 1);
			feeds.splice(dstIdx, 0, draggedUrl);
			settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);

			sourcesGroup.remove(addRow);
			for (let [, r] of rowMap)
				sourcesGroup.remove(r);
			for (let feedUrl of feeds)
			{
				let r = rowMap.get(feedUrl);
				if (r) sourcesGroup.add(r);
			}
			sourcesGroup.add(addRow);
		};

		const buildSourceRow = (url) =>
		{
			const state = { url };

			const storedTitle = aSettings.get(url, 't');
			const storedAvatar = aSettings.get(url, 'v');

			const dragHandle = new Gtk.Image({
				icon_name : 'list-drag-handle-symbolic',
				valign : Gtk.Align.CENTER,
				opacity : 0.35,
			});

			const avatarLabel = new Gtk.Label({
				label : storedAvatar || (storedTitle ? getInitials(storedTitle) : urlToInitials(url)),
				width_request : 32,
				height_request : 32,
				valign : Gtk.Align.CENTER,
				halign : Gtk.Align.CENTER,
			});
			avatarLabel.add_css_class('source-avatar');

			const row = new Adw.ExpanderRow({
				title : storedTitle || url.replace(/^https?:\/\//, '').split('/')[0],
				subtitle : url,
			});
			row.add_prefix(dragHandle);
			row.add_prefix(avatarLabel);

			const statusLabel = new Gtk.Label({
				label : 'Checking…',
				valign : Gtk.Align.CENTER,
			});
			statusLabel.add_css_class('status-pill');
			row._statusLabel = statusLabel;
			row._avatarLabel = avatarLabel;

			const noUpdBtn = new Gtk.ToggleButton({
				icon_name : 'view-refresh-symbolic',
				tooltip_text : 'Updates detection',
				valign : Gtk.Align.CENTER,
			});
			noUpdBtn.add_css_class('flat');
			noUpdBtn.add_css_class('source-action-btn');
			noUpdBtn.active = !!aSettings.get(url, 'u');
			noUpdBtn.opacity = noUpdBtn.active ? 0.4 : 1.0;
			noUpdBtn.connect('toggled', () =>
			{
				aSettings.set(state.url, 'u', noUpdBtn.active);
				noUpdBtn.opacity = noUpdBtn.active ? 0.4 : 1.0;
			});

			const isMuted = !!aSettings.get(url, 'n');
			const noNotifBtn = new Gtk.ToggleButton({
				icon_name : isMuted ? 'notifications-disabled-symbolic' : 'preferences-system-notifications-symbolic',
				tooltip_text : 'Notifications',
				valign : Gtk.Align.CENTER,
			});
			noNotifBtn.add_css_class('flat');
			noNotifBtn.add_css_class('source-action-btn');
			noNotifBtn.active = isMuted;
			noNotifBtn.connect('toggled', () =>
			{
				aSettings.set(state.url, 'n', noNotifBtn.active);
				noNotifBtn.set_icon_name(noNotifBtn.active ? 'notifications-disabled-symbolic' : 'preferences-system-notifications-symbolic');
			});

			const delBtn = new Gtk.Button({
				icon_name : 'user-trash-symbolic',
				tooltip_text : 'Remove',
				valign : Gtk.Align.CENTER,
			});
			delBtn.add_css_class('flat');
			delBtn.add_css_class('source-action-btn');
			delBtn.add_css_class('source-delete-btn');
			delBtn.connect('clicked', () =>
			{
				aSettings.remove(state.url);
				let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
				let idx = feeds.indexOf(state.url);
				if (idx !== -1)
					feeds.splice(idx, 1);
				settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);
				sourcesGroup.remove(row);
				rowMap.delete(state.url);
			});

			row.add_suffix(delBtn);
			row.add_suffix(noNotifBtn);
			row.add_suffix(noUpdBtn);
			row.add_suffix(statusLabel);

			const avatarEntry = new Adw.EntryRow({ title : 'Avatar' });
			avatarEntry.set_text(storedAvatar || (storedTitle ? getInitials(storedTitle) : urlToInitials(url)));
			let _avatarUpdating = false;
			avatarEntry.connect('changed', () =>
			{
				if (_avatarUpdating) return;
				let raw = avatarEntry.get_text();
				let val = raw.replace(/\s/g, '').toUpperCase().slice(0, 2);
				if (val !== raw)
				{
					_avatarUpdating = true;
					avatarEntry.set_text(val);
					_avatarUpdating = false;
				}
				if (val.length > 0)
				{
					avatarLabel.set_label(val);
					aSettings.set(state.url, 'v', val);
				}
				else
				{
					let t = aSettings.get(state.url, 't');
					avatarLabel.set_label(t ? getInitials(t) : urlToInitials(state.url));
					aSettings.set(state.url, 'v', undefined);
				}
			});

			const titleEntry = new Adw.EntryRow({ title : 'Title' });
			titleEntry.set_text(storedTitle || '');
			titleEntry.connect('changed', () =>
			{
				row._titleDirty = true;
				let val = titleEntry.get_text().trim();
				let domain = state.url.replace(/^https?:\/\//, '').split('/')[0];
				row.set_title(val || domain);
				if (val)
					aSettings.set(state.url, 't', val);
				if (!aSettings.get(state.url, 'v'))
					avatarLabel.set_label(val ? getInitials(val) : urlToInitials(state.url));
			});
			row._titleEntry = titleEntry;
			row._titleDirty = false;

			const urlEntry = new Adw.EntryRow({ title : 'URL', show_apply_button : true });
			urlEntry.set_text(url);
			urlEntry.connect('apply', () =>
			{
				let newUrl = urlEntry.get_text().trim();
				if (!newUrl.length || newUrl === state.url)
					return;

				if (fCache[state.url])
				{
					fCache[state.url].cancel();
					delete fCache[state.url];
				}

				let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
				let idx = feeds.indexOf(state.url);
				if (idx !== -1)
				{
					feeds[idx] = newUrl;
					settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);
				}

				aSettings.rename(state.url, newUrl);

				let titleIsManual = row._titleDirty && row._titleEntry.get_text().trim().length > 0;
				if (!titleIsManual)
					aSettings.set(newUrl, 't', undefined);

				rowMap.delete(state.url);
				state.url = newUrl;
				rowMap.set(newUrl, row);

				row.set_subtitle(newUrl);
				validateUrl(row, newUrl);
			});

			row.add_row(avatarEntry);
			row.add_row(titleEntry);
			row.add_row(urlEntry);

			const dragSource = new Gtk.DragSource({ actions : Gdk.DragAction.MOVE });
			dragSource.connect('prepare', () => Gdk.ContentProvider.new_for_value(state.url));
			let _wasExpanded = false;
			dragSource.connect('drag-begin', (source, _drag) =>
			{
				source.set_icon(new Gtk.WidgetPaintable({ widget : row }), 0, 0);
				_wasExpanded = row.expanded;
				if (_wasExpanded)
					row.expanded = false;
			});
			dragSource.connect('drag-end', () =>
			{
				if (_wasExpanded)
					row.expanded = true;
			});
			dragHandle.add_controller(dragSource);

			const dropTarget = new Gtk.DropTarget({ actions : Gdk.DragAction.MOVE });
			dropTarget.set_gtypes([GObject.TYPE_STRING]);
			dropTarget.connect('enter', () =>
			{
				row.add_css_class('dnd-over');
				return Gdk.DragAction.MOVE;
			});
			dropTarget.connect('leave', () => row.remove_css_class('dnd-over'));
			dropTarget.connect('drop', (target, value) =>
			{
				row.remove_css_class('dnd-over');
				if (value === state.url)
					return false;
				reorderFeeds(value, state.url);
				return true;
			});
			row.add_controller(dropTarget);

			validateUrl(row, url);

			return row;
		};

		const addRow = new Adw.EntryRow({
			title : 'New RSS source URL',
			show_apply_button : true,
		});
		addRow.connect('apply', () =>
		{
			let url = addRow.get_text().trim();
			if (!url.length)
				return;
			let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
			if (feeds.includes(url))
				return;
			feeds.push(url);
			settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);
			let newRow = buildSourceRow(url);
			rowMap.set(url, newRow);
			sourcesGroup.remove(addRow);
			sourcesGroup.add(newRow);
			sourcesGroup.add(addRow);
			addRow.set_text('');
		});

		let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
		for (let url of feeds)
		{
			let row = buildSourceRow(url);
			sourcesGroup.add(row);
			rowMap.set(url, row);
		}
		sourcesGroup.add(addRow);

		const sourcesOptionsGroup = new Adw.PreferencesGroup();
		sourcesPage.add(sourcesOptionsGroup);
		const initialUnreadRow = this._makeSwitchRow(settings, GSKeys.MARK_INITIAL_AS_NEW, "Initial unread");
		initialUnreadRow.subtitle = "Marks all articles as unread on first load after the extension starts.";
		sourcesOptionsGroup.add(initialUnreadRow);
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
