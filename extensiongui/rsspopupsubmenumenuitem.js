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

import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import { getInstance } from '../encoder.js';
import { RssPopupSubMenu } from './rsspopupsubmenu.js';

const Encoder = getInstance();

function _feedInitials(title)
{
	let words = title.trim().split(/\s+/);
	if (words.length >= 2)
		return (words[0][0] + words[1][0]).toUpperCase();
	return title.substring(0, 2).toUpperCase();
}

export const RssPopupSubMenuMenuItem = GObject.registerClass(
class RssPopupSubMenuMenuItem extends PopupMenu.PopupSubMenuMenuItem
{
	_init(publisher, _nitems)
	{
		let title = Encoder.htmlDecode(publisher.Title);
		if (title.length > 128)
			title = title.substr(0, 128) + "...";

		super._init(title);

		this._avatar = new St.Label(
		{
			text: _feedInitials(title),
			style_class: 'rss-feed-avatar',
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.CENTER,
		});
		this.insert_child_at_index(this._avatar, 0);

		this._countBadge = new St.Label(
		{
			text: '',
			style_class: 'rss-feed-count',
			y_align: Clutter.ActorAlign.CENTER,
			visible: false,
		});
		this.insert_child_before(this._countBadge, this._triangleBin);

		this.menu.destroy();
		this.menu = new RssPopupSubMenu(this, this._triangle);
		this.menu.connect('open-state-changed',
			this._subMenuOpenStateChanged.bind(this));
		this._olabeltext = title;
	}

	setUnreadCount(n)
	{
		if (n > 0)
		{
			this._countBadge.set_text(n.toString());
			this._countBadge.show();
		}
		else
		{
			this._countBadge.hide();
		}
	}
});
