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

import { ConfirmBadge } from './confirmBadge.js';

const REPO_URL = 'https://github.com/todevelopers/gnome-shell-extension-rss-feed';

export const RssHeader = GObject.registerClass(
class RssHeader extends PopupMenu.PopupBaseMenuItem
{
	_init(callbacks)
	{
		super._init({ reactive : false, can_focus : false, style_class : 'rss-header' });

		let iconBox = new St.Button(
		{
			style_class : 'rss-header-icon',
			x_align : Clutter.ActorAlign.CENTER,
			y_align : Clutter.ActorAlign.CENTER,
			can_focus : false,
			child : new St.Icon({ icon_name : 'application-rss+xml-symbolic', icon_size : 20 }),
		});
		iconBox.connect('clicked', () => callbacks.onOpenLink(REPO_URL));
		this.add_child(iconBox);

		let titleBox = new St.BoxLayout({ vertical : true, x_expand : true });
		titleBox.add_child(new St.Label({ text : 'RSS Feed', style_class : 'rss-header-title' }));
		this._subtitle = new St.Label({ text : '', style_class : 'rss-header-subtitle' });
		titleBox.add_child(this._subtitle);
		this.add_child(titleBox);

		this._badge = new ConfirmBadge('rss-unread-badge');
		this._badge.can_focus = true;
		this._badge.accessible_name = 'Mark all as read';
		this._badge.onConfirm = () => callbacks.onMarkAllSeen();
		this._badge.onEnterConfirm = (b) => callbacks.onActivateConfirm(b);
		this.add_child(this._badge);

		let reloadBtn = new St.Button(
		{
			style_class : 'rss-icon-btn',
			can_focus : true,
			accessible_name : 'Refresh',
			child : new St.Icon({ icon_name : 'view-refresh-symbolic', style_class : 'popup-menu-icon' }),
		});
		reloadBtn.connect('clicked', () => callbacks.onReload());

		let settingsBtn = new St.Button(
		{
			style_class : 'rss-icon-btn',
			can_focus : true,
			accessible_name : 'Settings',
			child : new St.Icon({ icon_name : 'applications-system-symbolic', style_class : 'popup-menu-icon' }),
		});
		settingsBtn.connect('clicked', () => callbacks.onOpenSettings());

		this.add_child(reloadBtn);
		this.add_child(settingsBtn);

		this._navButtons = [this._badge, reloadBtn, settingsBtn];
		this.connect('key-press-event', (_actor, event) => this._navigate(event));
	}

	_navigate(event)
	{
		let focused = global.stage.get_key_focus();
		let buttons = this._navButtons.filter(b => b.visible);
		let idx = buttons.indexOf(focused);
		if (idx < 0)
			return Clutter.EVENT_PROPAGATE;

		let symbol = event.get_key_symbol();

		if (symbol === Clutter.KEY_Left || symbol === Clutter.KEY_Right)
		{
			let next = idx + (symbol === Clutter.KEY_Right ? 1 : -1);
			if (next >= 0 && next < buttons.length)
				buttons[next].grab_key_focus();
			return Clutter.EVENT_STOP;
		}

		if (symbol === Clutter.KEY_Up || symbol === Clutter.KEY_Down)
		{
			let dir = symbol === Clutter.KEY_Up ? St.DirectionType.UP : St.DirectionType.DOWN;
			global.focus_manager.get_group(focused)?.navigate_focus(focused, dir, true);
			return Clutter.EVENT_STOP;
		}

		return Clutter.EVENT_PROPAGATE;
	}

	setUnreadCount(n)
	{
		this._badge.setCount(n);
	}

	markUpdated()
	{
		this._subtitle.set_text('Updated at ' + new Date().toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' }));
	}
});
