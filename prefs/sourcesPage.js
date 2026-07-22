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
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';
import Soup from 'gi://Soup';

import * as GSKeys from '../gskeys.js';
import * as HTTP from '../http.js';
import { getInstance } from '../encoder.js';
import { parseOpml, buildOpml } from '../opml.js';
import { createRssParser } from '../parsers/factory.js';
import { makeSpinRow, makeSwitchRow, getInitials, urlToInitials } from './prefsWidgets.js';

const Encoder = getInstance();
const MAX_SOURCES_LIMIT = 1024;

export function buildSourcesPage(window, settings, aSettings, httpSession)
{
	const sourcesPage = new Adw.PreferencesPage({ title : "Sources", icon_name : 'view-list-symbolic' });

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
		.source-action-btn:checked:not(:hover) {
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
	window.connect('close-request', () =>
	{
		Gtk.StyleContext.remove_provider_for_display(Gdk.Display.get_default(), cssProvider);
	});

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

		// some feeds reject libsoup's default User-Agent; identify the extension honestly
		msg.get_request_headers().replace("User-Agent",
		"gnome-shell-extension-rss-feed/1.0 (+https://github.com/todevelopers/gnome-shell-extension-rss-feed)");

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
					let rawBytes = bytes.toArray();
					let encoding = 'utf-8';

					let ctHeader = msg.get_response_headers().get_one('content-type');
					if (ctHeader)
					{
						let m = ctHeader.match(/charset=([^\s;]+)/i);
						if (m) encoding = m[1];
					}

					if (encoding === 'utf-8')
					{
						let prolog = new TextDecoder('latin1').decode(rawBytes.subarray(0, 200));
						let m = prolog.match(/encoding=["']([^"']+)["']/i);
						if (m) encoding = m[1];
					}

					let data = new TextDecoder(encoding).decode(rawBytes);
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
					let feedTitle = Encoder.htmlDecode(parser.Publisher.Title);
					row.set_title(feedTitle);
					aSettings.set(url, 't', feedTitle);
					if (row._titleEntry && !row._titleEntry.get_text().trim())
					{
						row._titleEntry.set_text(feedTitle);
						row._titleDirty = false;
					}
				}
				if (!aSettings.get(url, 'v'))
					row._avatarLabel.set_label(getInitials(Encoder.htmlDecode(parser.Publisher.Title)));
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
		dropTarget.connect('drop', (_target, value) =>
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

	const sourceActionsBox = new Gtk.Box({ spacing : 6 });

	const refreshButton = new Gtk.Button({
		icon_name : 'view-refresh-symbolic',
		tooltip_text : 'Check all sources',
		valign : Gtk.Align.CENTER,
	});
	refreshButton.add_css_class('flat');

	const importButton = new Gtk.Button({
		icon_name : 'document-open-symbolic',
		tooltip_text : 'Import OPML…',
		valign : Gtk.Align.CENTER,
	});
	importButton.add_css_class('flat');

	const exportButton = new Gtk.Button({
		icon_name : 'document-save-symbolic',
		tooltip_text : 'Export OPML…',
		valign : Gtk.Align.CENTER,
	});
	exportButton.add_css_class('flat');

	sourceActionsBox.append(refreshButton);
	sourceActionsBox.append(importButton);
	sourceActionsBox.append(exportButton);
	sourcesGroup.set_header_suffix(sourceActionsBox);

	refreshButton.connect('clicked', () =>
	{
		for (let [url, row] of rowMap)
			validateUrl(row, url);
	});

	importButton.connect('clicked', () =>
	{
		const filters = new Gio.ListStore({ item_type : Gtk.FileFilter });
		const opmlFilter = new Gtk.FileFilter({ name : 'OPML files' });
		opmlFilter.add_pattern('*.opml');
		opmlFilter.add_pattern('*.xml');
		const allFilter = new Gtk.FileFilter({ name : 'All files' });
		allFilter.add_pattern('*');
		filters.append(opmlFilter);
		filters.append(allFilter);

		const dialog = new Gtk.FileDialog({
			title : 'Import OPML',
			filters : filters,
			default_filter : opmlFilter,
		});

		dialog.open(window, null, (dlg, result) =>
		{
			let file;
			try
			{
				file = dlg.open_finish(result);
			}
			catch
			{
				return;
			}

			file.load_contents_async(null, (f, res) =>
			{
				let text;
				try
				{
					let [, contents] = f.load_contents_finish(res);
					text = new TextDecoder().decode(contents);
				}
				catch
				{
					window.add_toast(new Adw.Toast({ title : "Could not read file" }));
					return;
				}

				let parsed;
				try
				{
					parsed = parseOpml(text);
				}
				catch
				{
					window.add_toast(new Adw.Toast({ title : "Could not parse OPML file" }));
					return;
				}

				let existing = settings.get_strv(GSKeys.RSS_FEEDS_LIST);
				let existingSet = new Set(existing);
				let newFeeds = [];
				let duplicates = 0;
				for (let feed of parsed)
				{
					if (existingSet.has(feed.url))
					{
						duplicates++;
						continue;
					}
					newFeeds.push(feed);
				}

				if (!newFeeds.length)
				{
					window.add_toast(new Adw.Toast({ title : "No new feeds found in file" }));
					return;
				}

				for (let feed of newFeeds)
				{
					if (feed.title)
						aSettings.set(feed.url, 't', feed.title);
					if (feed.folder)
						aSettings.set(feed.url, 'f', feed.folder);
				}

				let newUrls = newFeeds.map(feed => feed.url);
				settings.set_strv(GSKeys.RSS_FEEDS_LIST, existing.concat(newUrls));

				sourcesGroup.remove(addRow);
				for (let url of newUrls)
				{
					let row = buildSourceRow(url);
					rowMap.set(url, row);
					sourcesGroup.add(row);
				}
				sourcesGroup.add(addRow);

				let message = "Imported " + newFeeds.length + (newFeeds.length === 1 ? " feed" : " feeds");
				if (duplicates)
					message += duplicates === 1 ? " (1 duplicate skipped)" : " (" + duplicates + " duplicates skipped)";
				window.add_toast(new Adw.Toast({ title : message }));
			});
		});
	});

	exportButton.connect('clicked', () =>
	{
		let feeds = settings.get_strv(GSKeys.RSS_FEEDS_LIST).map((url) =>
		{
			let domain = url.replace(/^https?:\/\//, '').split('/')[0];
			return {
				url,
				title : aSettings.get(url, 't') || domain,
				folder : aSettings.get(url, 'f') || '',
			};
		});

		const dialog = new Gtk.FileDialog({
			title : 'Export OPML',
			initial_name : 'rss-feeds.opml',
		});

		dialog.save(window, null, (dlg, result) =>
		{
			let file;
			try
			{
				file = dlg.save_finish(result);
			}
			catch
			{
				return;
			}

			let bytes = new GLib.Bytes(new TextEncoder().encode(buildOpml(feeds)));
			file.replace_contents_bytes_async(bytes, null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null, (f, res) =>
			{
				try
				{
					f.replace_contents_finish(res);
				}
				catch
				{
					window.add_toast(new Adw.Toast({ title : "Could not save file" }));
					return;
				}
				window.add_toast(new Adw.Toast({ title : "Exported " + feeds.length + (feeds.length === 1 ? " feed" : " feeds") }));
			});
		});
	});

	const sourcesOptionsGroup = new Adw.PreferencesGroup();
	sourcesPage.add(sourcesOptionsGroup);

	const itemsRetainedRow = makeSpinRow(settings, GSKeys.ITEMS_RETAINED, "Articles kept per feed", 1, MAX_SOURCES_LIMIT);
	itemsRetainedRow.subtitle = "How many articles are stored per feed.";
	sourcesOptionsGroup.add(itemsRetainedRow);

	const initialUnreadRow = makeSwitchRow(settings, GSKeys.MARK_INITIAL_AS_NEW, "Initial unread");
	initialUnreadRow.subtitle = "Marks all articles as unread on first load after the extension starts.";
	sourcesOptionsGroup.add(initialUnreadRow);

	return sourcesPage;
}
