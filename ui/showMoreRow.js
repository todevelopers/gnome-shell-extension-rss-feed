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

export const ShowMoreRow = GObject.registerClass(
class ShowMoreRow extends PopupMenu.PopupBaseMenuItem
{
	_init(onActivate)
	{
		super._init();
		this._onActivate = onActivate;

		this._label = new St.Label(
		{
			x_expand: true,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
			style_class: 'rss-show-more',
		});
		this.add_child(this._label);

		this.connect('destroy', () =>
		{
			this._destroyed = true;
			this._onActivate = null;
		});
	}

	setCounts(shown, total)
	{
		this._label.set_text("Show more (" + shown + " of " + total + ")");
	}

	activate(_event)
	{
		if (this._onActivate)
			this._onActivate();
	}
});
