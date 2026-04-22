/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2017
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
Gtk = imports.gi.Gtk;

const
Me = imports.misc.extensionUtils.getCurrentExtension();
const
Log = Me.imports.logger;

var
RssPopupSubMenu = class _RssPopupSubMenu extends PopupMenu.PopupSubMenu
{

	constructor(sourceActor, sourceArrow)
	{
		super(sourceActor, sourceArrow);

		/* pass any 'scoll-event' to the parent */
		this.actor.connect('scroll-event', (actor, event) =>
		{
			let
			scrollBar = this._parent.actor.get_vscroll_bar();
			if (scrollBar)
				scrollBar.emit('scroll-event', event);
		});

	}

	open (animate)
	{
		/*
		let
		needsScrollbar = this._parent._needsScrollbar(this);

		this._parent.actor.vscrollbar_policy = (needsScrollbar ? Gtk.PolicyType.AUTOMATIC
			: Gtk.PolicyType.NEVER);
		 */
		super.open(this._parent._animate);
	}

	close (animate)
	{
		super.close(this._parent._animate);
	}

	_needsScrollbar(o)
	{
		return false;
	}

};
