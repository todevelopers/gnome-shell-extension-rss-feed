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

import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as Misc from '../misc.js';

export class ScrollSection extends PopupMenu.PopupMenuSection
{
	constructor(sv_style)
	{
		super();

		this.actor = new St.ScrollView(
		{
			style : (sv_style ? sv_style : ''),
			hscrollbar_policy : St.PolicyType.NEVER,
			vscrollbar_policy : St.PolicyType.AUTOMATIC
		});

		this.actor.set_child(this.box);
		this.actor._delegate = this;
		this.actor.clip_to_allocation = true;

		this.actor.add_style_pseudo_class('scrolled');
	}

	addMenuItem(menuItem, position)
	{
		super.addMenuItem(menuItem, position);
		menuItem.connect('key-focus-in', () => Misc.ensureItemVisible(menuItem));
	}
}
