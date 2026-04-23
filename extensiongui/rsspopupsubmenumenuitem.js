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

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { getInstance } from '../encoder.js';
import { RssPopupSubMenu } from './rsspopupsubmenu.js';

const Encoder = getInstance();

export class RssPopupSubMenuMenuItem extends PopupMenu.PopupSubMenuMenuItem
{
	constructor(publisher, _nitems)
	{
		let title = Encoder.htmlDecode(publisher.Title);
		if (title.length > 128)
			title = title.substr(0, 128) + "...";

		super(title);

		this.menu.destroy();
		this.menu = new RssPopupSubMenu(this.actor, this._triangle);
		this.menu.connect('open-state-changed',
			this._subMenuOpenStateChanged.bind(this));
		this._olabeltext = title;
	}
}
