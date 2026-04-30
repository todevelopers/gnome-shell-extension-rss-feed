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

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export class RssPopupSubMenu extends PopupMenu.PopupSubMenu
{
	constructor(sourceActor, sourceArrow)
	{
		super(sourceActor, sourceArrow);

		this.box.connect('scroll-event', (actor, event) =>
		{
			let adj = this._parent.actor ? this._parent.actor.vadjustment : this._parent.vadjustment;
			if (adj)
				adj.emit('scroll-event', event);
		});
	}

	_needsScrollbar(_o)
	{
		return false;
	}
}
