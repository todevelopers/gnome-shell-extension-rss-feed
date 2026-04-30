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

import Clutter from 'gi://Clutter';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export class RssPopupSubMenu extends PopupMenu.PopupSubMenu
{
	constructor(sourceActor, sourceArrow)
	{
		super(sourceActor, sourceArrow);

		this.actor.connect('scroll-event', (_actor, event) =>
		{
			let outerScrollView = this._parent ? this._parent.actor : null;
			if (!outerScrollView) return Clutter.EVENT_PROPAGATE;
			let adj = outerScrollView.vadjustment;
			if (!adj) return Clutter.EVENT_PROPAGATE;

			let direction = event.get_scroll_direction();
			let step = adj.step_increment || 40;

			if (direction === Clutter.ScrollDirection.SMOOTH)
			{
				let [, dy] = event.get_scroll_delta();
				adj.value = Math.max(adj.lower,
					Math.min(adj.upper - adj.page_size, adj.value + dy * step));
			}
			else if (direction === Clutter.ScrollDirection.UP)
			{
				adj.value = Math.max(adj.lower, adj.value - step);
			}
			else if (direction === Clutter.ScrollDirection.DOWN)
			{
				adj.value = Math.min(adj.upper - adj.page_size, adj.value + step);
			}
			else
			{
				return Clutter.EVENT_PROPAGATE;
			}

			return Clutter.EVENT_STOP;
		});
	}

	_needsScrollbar(_o)
	{
		return false;
	}
}
