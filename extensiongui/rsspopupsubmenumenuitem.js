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
import { RssBadgeButton } from './rssbadgebutton.js';
import { feedInitials } from '../misc.js';

const Encoder = getInstance();

export const RssPopupSubMenuMenuItem = GObject.registerClass(
class RssPopupSubMenuMenuItem extends PopupMenu.PopupSubMenuMenuItem
{
	_init(publisher, _nitems)
	{
		let title = Encoder.htmlDecode(publisher.Title);
		if (title.length > 128)
			title = title.substr(0, 128) + "...";

		super._init(title);

		this._avatar = new St.Bin(
		{
			style_class: 'rss-feed-avatar',
			y_align: Clutter.ActorAlign.CENTER,
			x_align: Clutter.ActorAlign.CENTER,
		});
		let avatarLabel = new St.Label({ text: feedInitials(title) });
		avatarLabel.x_align = Clutter.ActorAlign.CENTER;
		avatarLabel.y_align = Clutter.ActorAlign.CENTER;
		this._avatar.child = avatarLabel;
		this.insert_child_at_index(this._avatar, 0);

		this._countBadgeText = new St.Label(
		{
			text: '',
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
			style_class: 'rss-badge-text',
		});

		this._countBadge = new RssBadgeButton('rss-feed-count', this._countBadgeText);
		this._countBadge.visible = false;
		this.insert_child_at_index(this._countBadge, this.get_n_children() - 1);

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
			this._countBadgeText.set_text(n > 99 ? '99+' : n.toString());
			this._countBadge.show();
		}
		else
		{
			this._countBadge.hide();
		}
	}

	setOrnament(_ornament)
	{
	}
});
