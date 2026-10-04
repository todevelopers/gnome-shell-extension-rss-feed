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
import { countUnread } from '../../data/articleState.js';
import { ClassicFeedGroup } from './feedGroup.js';
import { ClassicStarredItem } from './starredItem.js';

export const ClassicStarredGroup = GObject.registerClass(
class ClassicStarredGroup extends ClassicFeedGroup
{
	_attach(store)
	{
		this._store = store;
		this._sources = new Map();

		this.label.set_text('Starred');
		this._avatar.child = new St.Icon(
		{
			icon_name: 'starred-symbolic',
			icon_size: 16,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
		});

		this._countBadge.onConfirm = () => this._store.markStarredRead();

		store.connectObject(
			'starred-changed', () => this._collect(),
			'changed', () => this._syncUnread(),
			this
		);

		this._collect();
	}

	_collect()
	{
		let sources = new Map(this._store.starredEntries().map(entry => [entry.item, entry.source]));

		// a feed that was removed and added again hands its starred articles over to a new source
		for (let [item, row] of this._rowByItem)
		{
			if (sources.has(item) && sources.get(item) !== row.source)
			{
				row.destroy();
				this._rowByItem.delete(item);
			}
		}

		this._sources = sources;
		this.visible = sources.size > 0;
		this._syncUnread();
		this._queueReconcile();
	}

	_listItems()
	{
		return [...this._sources.keys()];
	}

	_createRow(item)
	{
		return new ClassicStarredItem(item, this._sources.get(item), this._runner);
	}

	_unreadCount()
	{
		return countUnread([...this._sources.keys()]);
	}

	_reconcile()
	{
		// the group hides with its last article; the focus has to leave the rows before they are destroyed
		if (!this._sources.size && this.menu.isOpen)
		{
			let focus = global.stage.get_key_focus();
			if (focus && this.menu.actor.contains(focus))
				this._getTopMenu().actor.navigate_focus(this.menu.actor, St.DirectionType.TAB_FORWARD, true);
			this.menu.close();
		}

		super._reconcile();
	}
});
