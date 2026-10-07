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
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import { EXTERNAL_LINK_ICON, buttonIcon, buttonTitle } from '../data/articleActions.js';

// the external link icon has no themed namesake to stand in for a missing file
const LINK_FALLBACK_ICON = 'web-browser-symbolic';

// St CSS has no opacity; a button stays pale until the pointer or the key focus is on it
const PALE_OPACITY = 128;

// The action buttons of an article row, shown while the row is hovered or focused; replaced lists the actors that give way to them.
export const ArticleHoverButtons = GObject.registerClass(
class ArticleHoverButtons extends St.BoxLayout
{
	_init(row, item, source, runner, replaced)
	{
		super._init(
		{
			style_class: 'rss-article-actions',
			y_align: Clutter.ActorAlign.CENTER,
			visible: false,
		});

		this._row = row;
		this._item = item;
		this._source = source;
		this._runner = runner;
		this._replaced = replaced;
		this._slots = [];
		this._watching = false;
		this._moving = false;

		this.connect('destroy', () =>
		{
			this._destroyed = true;
			if (this._watching)
				this._runner.disconnectObject(this);
		});
	}

	sync()
	{
		if (this._destroyed)
			return;

		// active and not the key focus: a row keeps the focus after the pointer has left it, but it is no longer active
		let wanted = this._moving || this._row.hover || this._row.active || this._focusedIndex() >= 0;

		// a row that was never hovered or focused has no buttons to update when the settings change
		if (wanted && !this._watching)
		{
			this._watching = true;
			this._runner.connectObject('changed', () => this.sync(), this);
		}

		let ids = wanted ? this._runner.slots() : [];
		// never while the focus is on its way, a button would be destroyed inside its own focus signal
		if (wanted && !this._moving && ids.join() !== this._slots.map(slot => slot.id).join())
		{
			// the focus must not go away with a button; moving it to the row ends in another sync that rebuilds
			if (this._focusedIndex() >= 0)
			{
				this._grab(this._row);
				return;
			}
			this._build(ids);
		}

		let show = wanted && this._slots.length > 0;
		this.visible = show;
		for (let actor of this._replaced)
			actor.visible = !show;

		if (!show)
			return;

		for (let slot of this._slots)
		{
			let name = buttonIcon(slot.id, this._item);
			if (name !== slot.icon)
			{
				slot.icon = name;
				this._setIcon(slot.button.child, name);
			}
			slot.button.accessible_name = buttonTitle(slot.id, this._item);
		}
	}

	navigate(event)
	{
		if (!this.visible)
			return Clutter.EVENT_PROPAGATE;

		let symbol = event.get_key_symbol();
		let idx = this._focusedIndex();

		if (symbol === Clutter.KEY_Right)
		{
			if (idx + 1 < this._slots.length)
				this._grab(this._slots[idx + 1].button);
			return Clutter.EVENT_STOP;
		}

		if (idx < 0)
			return Clutter.EVENT_PROPAGATE;

		if (symbol === Clutter.KEY_Left)
		{
			this._grab(idx > 0 ? this._slots[idx - 1].button : this._row);
			return Clutter.EVENT_STOP;
		}

		// the row moves on to its neighbour itself once it has the focus back
		if (symbol === Clutter.KEY_Up || symbol === Clutter.KEY_Down)
			this._grab(this._row);

		return Clutter.EVENT_PROPAGATE;
	}

	_build(ids)
	{
		this.destroy_all_children();
		this._slots = [];

		for (let id of ids)
		{
			let button = new St.Button(
			{
				style_class: 'rss-article-action',
				can_focus: true,
				opacity: PALE_OPACITY,
				y_align: Clutter.ActorAlign.CENTER,
				child: new St.Icon({ icon_size: 16 }),
			});
			let highlight = () =>
			{
				button.opacity = button.hover || button.has_key_focus() ? 255 : PALE_OPACITY;
			};
			button.connect('notify::hover', highlight);
			button.connect('key-focus-in', highlight);
			button.connect('clicked', () =>
			{
				this._runner.run(id, this._source, this._item);
				this.sync();
			});
			// a click with another mouse button must not reach the row either
			button.connect_after('button-release-event', () => Clutter.EVENT_STOP);
			button.connect('key-focus-out', () =>
			{
				highlight();
				this.sync();
			});

			this.add_child(button);
			this._slots.push({ id, button, icon: '' });
		}
	}

	// the themed icons differ in size and some are drawn half transparent, so the extension's own files come first
	_setIcon(icon, name)
	{
		let path = this._runner.iconPath(name);
		if (GLib.file_test(path, GLib.FileTest.EXISTS))
			icon.gicon = Gio.icon_new_for_string(path);
		else
			icon.icon_name = name === EXTERNAL_LINK_ICON ? LINK_FALLBACK_ICON : name;
	}

	// Clutter tells the old owner of the focus first, the buttons must not hide before the new owner has it
	_grab(actor)
	{
		this._moving = true;
		actor.grab_key_focus();
		this._moving = false;
		this.sync();
	}

	_focusedIndex()
	{
		return this._slots.findIndex(slot => slot.button.has_key_focus());
	}
});
