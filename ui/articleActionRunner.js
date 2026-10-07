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

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as GSKeys from '../gskeys.js';
import * as Misc from '../misc.js';
import { DEFAULT_CONFIG, hoverSlots, resolveConfig } from '../data/articleActions.js';

// Reads the action settings live and applies the configured action to an article; rows listen to 'changed'.
export const ArticleActionRunner = GObject.registerClass(
{
	Signals: {
		'changed': {},
	},
},
class ArticleActionRunner extends GObject.Object
{
	_init(settings, store, flash, path)
	{
		super._init();

		this._settings = settings;
		this._store = store;
		this._flash = flash;
		this._path = path;

		settings.connectObject(
			'changed::' + GSKeys.HOVER_ACTION_1, () => this.emit('changed'),
			'changed::' + GSKeys.HOVER_ACTION_2, () => this.emit('changed'),
			'changed::' + GSKeys.HOVER_ACTION_3, () => this.emit('changed'),
			'changed::' + GSKeys.CLICK_ACTION_LEFT, () => this.emit('changed'),
			'changed::' + GSKeys.CLICK_ACTION_MIDDLE, () => this.emit('changed'),
			'changed::' + GSKeys.CLICK_ACTION_RIGHT, () => this.emit('changed'),
			this
		);
	}

	_config()
	{
		let raw = {};
		for (let key of Object.keys(DEFAULT_CONFIG))
			raw[key] = this._settings.get_string(key);

		return resolveConfig(raw);
	}

	slots()
	{
		return hoverSlots(this._config());
	}

	mouseAction(button)
	{
		let config = this._config();

		if (button === Clutter.BUTTON_PRIMARY)
			return config[GSKeys.CLICK_ACTION_LEFT];
		if (button === Clutter.BUTTON_MIDDLE)
			return config[GSKeys.CLICK_ACTION_MIDDLE];
		if (button === Clutter.BUTTON_SECONDARY)
			return config[GSKeys.CLICK_ACTION_RIGHT];

		return 'none';
	}

	// an action without a themed icon has its icon in the extension directory
	iconPath(name)
	{
		return this._path + '/icons/' + name + '.svg';
	}

	// only opening and marking as read closes the popup, the other actions flash their message in the header
	closesMenu(id)
	{
		return id === 'openread';
	}

	run(id, source, item)
	{
		if (id === 'read')
		{
			this._store.toggleRead(source, item);
			this._flash(item.read ? 'Marked as read' : 'Marked as unread');
		}
		else if (id === 'star')
		{
			this._store.toggleStar(source, item);
			this._flash(item.starred ? 'Article starred' : 'Article unstarred');
		}
		else if (id === 'dismiss')
		{
			this._store.dismiss(source, item);
			this._flash('Article dismissed');
		}
		else if (id === 'older')
		{
			this._store.markOlderRead(source, item);
			this._flash('Older articles marked as read');
		}
		else if (id === 'copy')
		{
			St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.link);
			this._flash('Link copied');
		}
		else if ((id === 'open' || id === 'openread') && Misc.processLinkOpen(item.link))
		{
			if (id === 'openread')
				this._store.markRead(source, item);
			else
				this._flash('Opened in browser');
		}
	}

	destroy()
	{
		this._settings.disconnectObject(this);
	}
});
