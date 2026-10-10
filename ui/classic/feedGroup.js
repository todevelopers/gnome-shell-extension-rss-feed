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
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as GSKeys from '../../gskeys.js';
import { getInstance } from '../../encoder.js';
import { feedInitials } from '../../misc.js';
import { ClassicFeedSubmenu } from './feedSubmenu.js';
import { ClassicArticleItem } from './articleItem.js';
import { ConfirmBadge } from '../confirmBadge.js';
import { ShowMoreRow } from '../showMoreRow.js';

const Encoder = getInstance();

export const ClassicFeedGroup = GObject.registerClass(
class ClassicFeedGroup extends PopupMenu.PopupSubMenuMenuItem
{
	_init(source, runner, settings)
	{
		super._init('');

		this._runner = runner;
		this._settings = settings;
		this._dirty = true;
		this._rowByItem = new Map();
		this._chunkBuildId = 0;
		this._reconcileId = 0;
		this._showMoreRow = null;
		this._items = [];
		this._renderLimit = 0;
		this._olabeltext = '';
		this.onActivateConfirm = null;

		this._avatar = new St.Bin(
		{
			style_class: 'rss-feed-avatar',
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.CENTER,
		});
		this.insert_child_at_index(this._avatar, 0);

		this._countBadge = new ConfirmBadge('rss-feed-count');
		this._countBadge.onEnterConfirm = (b) =>
		{
			if (this.onActivateConfirm)
				this.onActivateConfirm(b);
		};
		this.insert_child_at_index(this._countBadge, this.get_n_children() - 1);

		this.menu.destroy();
		this.menu = new ClassicFeedSubmenu(this, this._triangle);
		this.menu.connectObject('open-state-changed',
			this._subMenuOpenStateChanged.bind(this), this);

		this._attach(source);

		this.connect('destroy', () =>
		{
			if (this._chunkBuildId)
			{
				GLib.source_remove(this._chunkBuildId);
				this._chunkBuildId = 0;
			}
			if (this._reconcileId)
			{
				GLib.source_remove(this._reconcileId);
				this._reconcileId = 0;
			}
			this._rowByItem = null;
			this._showMoreRow = null;
			this._items = null;
		});
	}

	// everything that depends on where the articles come from, the Starred group takes them from the store
	_attach(source)
	{
		this._source = source;

		let avatarLabel = new St.Label();
		avatarLabel.x_align = Clutter.ActorAlign.CENTER;
		avatarLabel.y_align = Clutter.ActorAlign.CENTER;
		this._avatar.child = avatarLabel;

		this._countBadge.onConfirm = () => this._source.markAllSeen();

		source.connectObject(
			'items-changed', () => this._queueReconcile(),
			'unread-changed', () => this._syncUnread(),
			'starred-changed', () => this._syncStarred(),
			'meta-changed', () => this._syncMeta(),
			this
		);

		this._syncMeta();
		this.setUnreadCount(source.unreadCount);
	}

	_listItems()
	{
		return this._source.items.filter(i => !i.dismissed);
	}

	_createRow(item)
	{
		return new ClassicArticleItem(item, this._source, this._runner);
	}

	_unreadCount()
	{
		return this._source.unreadCount;
	}

	activate(event)
	{
		if (this._dirty && !this.menu.isOpen)
			this._startChunkedBuild();

		super.activate(event);
	}

	_subMenuOpenStateChanged(menu, open)
	{
		super._subMenuOpenStateChanged(menu, open);

		// the popup opens the last group again by itself, past activate() and its rebuild
		if (open && this._dirty && !this._chunkBuildId)
			this._startChunkedBuild();
	}

	vfunc_key_press_event(event)
	{
		let symbol = event.get_key_symbol();

		if (symbol === Clutter.KEY_Delete && this._countBadge.visible)
		{
			this._countBadge.activate();
			return Clutter.EVENT_STOP;
		}

		if (symbol === Clutter.KEY_Right && this._dirty && !this.menu.isOpen)
			this._startChunkedBuild();

		return super.vfunc_key_press_event(event);
	}

	_startChunkedBuild()
	{
		this._cancelChunk();
		this.menu.removeAll();
		this._rowByItem = new Map();
		this._showMoreRow = null;

		this._items = this._listItems();
		this._renderLimit = Math.min(this._displayLimit(), this._items.length);
		this._renderRows(0);
	}

	_renderRows(startIdx)
	{
		this._cancelChunk();
		this._removeShowMore();

		let idx = this._renderChunk(startIdx);
		if (idx >= this._renderLimit)
		{
			this._dirty = false;
			this._addShowMoreIfNeeded();
			return;
		}

		this._chunkBuildId = GLib.idle_add(GLib.PRIORITY_LOW, () =>
		{
			if (!this._rowByItem)
			{
				this._chunkBuildId = 0;
				return GLib.SOURCE_REMOVE;
			}

			idx = this._renderChunk(idx);
			if (idx >= this._renderLimit)
			{
				this._chunkBuildId = 0;
				this._dirty = false;
				this._addShowMoreIfNeeded();
				return GLib.SOURCE_REMOVE;
			}
			return GLib.SOURCE_CONTINUE;
		});
	}

	_renderChunk(startIdx)
	{
		let end = Math.min(startIdx + 10, this._renderLimit);
		for (let i = startIdx; i < end; i++)
		{
			let row = this._createRow(this._items[i]);
			this.menu.addMenuItem(row);
			this._rowByItem.set(this._items[i], row);
		}
		return end;
	}

	_appendMore()
	{
		if (this._chunkBuildId)
			return;

		let from = this._renderLimit;
		this._renderLimit = Math.min(this._renderLimit + this._displayLimit(), this._items.length);
		this._renderRows(from);

		this._rowByItem.get(this._items[from])?.grab_key_focus();
	}

	_queueReconcile()
	{
		this._dirty = true;
		// a row can be dismissed from its own click, it must not be destroyed before that event is done
		if (this.menu.isOpen && !this._reconcileId)
		{
			this._reconcileId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () =>
			{
				this._reconcileId = 0;
				this._reconcile();
				return GLib.SOURCE_REMOVE;
			});
		}
	}

	_reconcile()
	{
		if (!this._rowByItem)
			return;

		if (this._chunkBuildId)
		{
			this._startChunkedBuild();
			return;
		}

		this._removeShowMore();

		this._items = this._listItems();
		this._renderLimit = Math.min(this._renderLimit || this._displayLimit(), this._items.length);

		let desired = this._items.slice(0, this._renderLimit);
		let wanted = new Set(desired);

		for (let [item, row] of this._rowByItem)
		{
			if (!wanted.has(item))
			{
				// destroying the row that holds the key focus logs "already disposed" warnings; the focus is null since GNOME 48 when nothing has it
				let focus = global.stage.get_key_focus();
				if (focus && row.contains(focus))
					this.menu.actor.navigate_focus(row, St.DirectionType.TAB_FORWARD, true);
				row.destroy();
				this._rowByItem.delete(item);
			}
		}

		for (let i = 0; i < desired.length; i++)
		{
			let item = desired[i];
			if (this._rowByItem.has(item))
				continue;
			let row = this._createRow(item);
			this._rowByItem.set(item, row);
			this.menu.addMenuItem(row, i);
		}

		this._dirty = false;
		this._addShowMoreIfNeeded();
	}

	_addShowMoreIfNeeded()
	{
		if (!this._rowByItem || this._renderLimit >= this._items.length)
			return;

		let row = new ShowMoreRow(() => this._appendMore(), true);
		row.setCounts(this._renderLimit, this._items.length);
		this.menu.addMenuItem(row);
		this._showMoreRow = row;
	}

	_removeShowMore()
	{
		if (this._showMoreRow)
		{
			// the menus above the submenu keep their active item past its destroy and deactivate it on the next focus change
			this._showMoreRow.active = false;
			this._showMoreRow.destroy();
			this._showMoreRow = null;
		}
	}

	_cancelChunk()
	{
		if (this._chunkBuildId)
		{
			GLib.source_remove(this._chunkBuildId);
			this._chunkBuildId = 0;
		}
	}

	_displayLimit()
	{
		let n = this._settings.get_int(GSKeys.ITEMS_VISIBLE);
		return n > 0 ? n : this._items.length;
	}

	refreshVisibleLimit()
	{
		if (this.menu.isOpen)
			this._startChunkedBuild();
		else
			this._dirty = true;
	}

	_syncUnread()
	{
		this.setUnreadCount(this._unreadCount());

		if (!this._rowByItem)
			return;

		for (let [item, row] of this._rowByItem)
			row.setOrnament(item.read ? PopupMenu.Ornament.NONE : PopupMenu.Ornament.DOT);
	}

	_syncStarred()
	{
		if (!this._rowByItem)
			return;

		for (let [item, row] of this._rowByItem)
			row.setStarred(item.starred);
	}

	_syncMeta()
	{
		let title = Encoder.htmlDecode(this._source.title);
		if (title.length > 128)
			title = title.substr(0, 128) + "...";

		if (this._olabeltext !== title)
		{
			this.label.set_text(title);
			this._olabeltext = title;
		}

		if (this._source.customAvatar)
			this._avatar.child.set_text(this._source.customAvatar);
		else
			this._avatar.child.set_text(feedInitials(this._olabeltext));
	}

	setUnreadCount(n)
	{
		this._countBadge.setCount(n);
	}
});
