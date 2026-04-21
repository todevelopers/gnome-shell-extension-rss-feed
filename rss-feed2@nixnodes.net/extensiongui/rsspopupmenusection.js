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

const
PopupMenu = imports.ui.popupMenu;

const
Me = imports.misc.extensionUtils.getCurrentExtension();
const
Log = Me.imports.logger;

const
St = imports.gi.St;
const
Gtk = imports.gi.Gtk;

var
RssPopupMenuSection = class _RssPopupMenuSection extends PopupMenu.PopupMenuSection
{
	constructor(sv_style)
	{
		super();

		this.actor = new St.ScrollView(
		{
			style : (sv_style ? sv_style : ''),
			hscrollbar_policy : Gtk.PolicyType.NEVER,
			vscrollbar_policy : Gtk.PolicyType.AUTOMATIC
		});

		this.actor.add_actor(this.box);
		this.actor._delegate = this;
		this.actor.clip_to_allocation = true;

		this.actor.add_style_pseudo_class('scrolled');

	}

	_needsScrollbar (child)
	{
		let
		topMenu = this;
		let[topMinHeight, topNaturalHeight] = topMenu.actor.get_preferred_height(-1);
		let[topMinHeight2, topNaturalHeight2] = child.actor.get_preferred_height(-1);

		let
		topThemeNode = this._parent.actor.get_theme_node();
		let
		topMaxHeight = topThemeNode.get_max_height();

		return topNaturalHeight + topNaturalHeight2 > topMaxHeight;
	}

};
