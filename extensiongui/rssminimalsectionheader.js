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
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const RssMinimalSectionHeader = GObject.registerClass(
class RssMinimalSectionHeader extends PopupMenu.PopupBaseMenuItem
{
	_init(text, initialCollapsed, onToggle)
	{
		super._init({ style_class: 'popup-menu-item rss-minimal-section-header' });
		this._items = [];
		this._collapsed = !!initialCollapsed;
		this._onToggle = onToggle;

		this._label = new St.Label(
		{
			text,
			x_expand: true,
			y_align: Clutter.ActorAlign.CENTER,
			style_class: 'rss-minimal-section-label',
		});
		this.add_child(this._label);

		this._icon = new St.Icon(
		{
			icon_name: this._collapsed ? 'pan-end-symbolic' : 'pan-down-symbolic',
			style_class: 'popup-menu-icon',
			y_align: Clutter.ActorAlign.CENTER,
		});
		this.add_child(this._icon);

		this.connect('destroy', () =>
		{
			this._destroyed = true;
			this._items = [];
			this._onToggle = null;
		});
	}

	activate(_event)
	{
		if (this._destroyed)
			return;
		this.toggle();
	}

	addItem(item)
	{
		if (this._destroyed)
			return;
		this._items.push(item);
		item.visible = !this._collapsed;
	}

	toggle()
	{
		if (this._destroyed)
			return;
		this._collapsed = !this._collapsed;
		this._icon.icon_name = this._collapsed ? 'pan-end-symbolic' : 'pan-down-symbolic';
		for (let item of this._items)
		{
			if (item && !item._destroyed)
				item.visible = !this._collapsed;
		}
		if (this._onToggle)
			this._onToggle(this._collapsed);
	}
});
