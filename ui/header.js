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
import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import { ConfirmBadge } from './confirmBadge.js';

const REPO_URL = 'https://github.com/todevelopers/gnome-shell-extension-rss-feed';

export const RssHeader = GObject.registerClass(
class RssHeader extends PopupMenu.PopupBaseMenuItem
{
	_init(callbacks, path)
	{
		super._init({ reactive : false, can_focus : false, style_class : 'rss-header' });

		// St flags a non-reactive row as insensitive and the theme then greys out its buttons too
		this.remove_style_pseudo_class('insensitive');

		this._status = '';
		this._flashId = 0;

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
		// title and status keep the dimmed look; St CSS has no opacity, so it is set on the actors
		titleBox.add_child(new St.Label({ text : 'RSS Feed', style_class : 'rss-header-title', opacity : 128 }));

		let subtitleBox = new St.BoxLayout({ x_expand : true });
		this._subtitle = new St.Label(
		{
			text : '',
			y_align : Clutter.ActorAlign.CENTER,
			style_class : 'rss-header-subtitle',
			opacity : 128,
		});
		subtitleBox.add_child(this._subtitle);

		// without ellipsis the pill keeps its width and only the status text gives way
		let failedLabel = new St.Label();
		failedLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;

		this._failedPill = new St.Button(
		{
			visible : false,
			can_focus : true,
			style_class : 'rss-header-warning',
			y_align : Clutter.ActorAlign.CENTER,
			child : failedLabel,
		});
		this._failedPill.label_actor = failedLabel;
		this._failedPill.connect('clicked', () => callbacks.onOpenSources());
		subtitleBox.add_child(this._failedPill);

		titleBox.add_child(subtitleBox);
		this.add_child(titleBox);

		this._badge = new ConfirmBadge('rss-unread-badge');
		this._badge.can_focus = true;
		this._badge.accessible_name = 'Mark all as read';
		this._badge.onConfirm = () => callbacks.onMarkAllSeen();
		this._badge.onEnterConfirm = (b) => callbacks.onActivateConfirm(b);
		this.add_child(this._badge);

		let moreBtn = new St.Button(
		{
			style_class : 'rss-icon-btn',
			y_align : Clutter.ActorAlign.CENTER,
			can_focus : true,
			accessible_name : 'More actions',
			child : new St.Icon({ icon_name : 'view-more-symbolic', style_class : 'popup-menu-icon' }),
		});
		this.add_child(moreBtn);

		this._menu = this._buildMenu(moreBtn, path, callbacks);
		this._menu.connect('open-state-changed', (_menu, open) =>
		{
			moreBtn.checked = open;
			// an armed badge would swallow the first Escape after the menu closes
			if (open)
				callbacks.onActivateConfirm(null);
		});
		moreBtn.connect('clicked', () =>
		{
			// closing the menu restores the previous focus; park it on the popup so a mouse click leaves no focus ring
			this._getTopMenu().actor.grab_key_focus();
			if (!this._menu.isOpen)
				this._updateRestoreItem(callbacks.getDismissedCount());
			this._menu.toggle();
		});

		this._navButtons = [this._failedPill, this._badge, moreBtn];
		this.connect('key-press-event', (_actor, event) => this._navigate(event));

		this.connect('destroy', () =>
		{
			if (this._flashId)
			{
				GLib.source_remove(this._flashId);
				this._flashId = 0;
			}
			this._menu.destroy();
		});
	}

	_buildMenu(button, path, callbacks)
	{
		let menu = new PopupMenu.PopupMenu(button, 1, St.Side.TOP);
		menu.addAction('Refresh', () => callbacks.onReload(), 'view-refresh-symbolic');
		this._markAllItem = menu.addAction('Mark all as read', () => callbacks.onMarkAllSeen(), 'object-select-symbolic');
		this._restoreItem = menu.addAction('Restore dismissed', () => callbacks.onRestoreDismissed(), 'edit-undo-symbolic');
		this._restoreItem.visible = false;
		menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		menu.addAction('Website', () => callbacks.onOpenLink(REPO_URL), Gio.icon_new_for_string(path + '/icons/external-link-symbolic.svg'));
		menu.addAction('Settings', () => callbacks.onOpenSettings(), 'applications-system-symbolic');

		Main.uiGroup.add_child(menu.actor);
		menu.actor.hide();

		this._menuManager = new PopupMenu.PopupMenuManager(button);
		this._menuManager.addMenu(menu);

		return menu;
	}

	_updateRestoreItem(count)
	{
		this._restoreItem.visible = count > 0;
		this._restoreItem.label.text = 'Restore dismissed (' + count + ')';
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
		this._markAllItem.setSensitive(n > 0);
	}

	setFailedCount(n)
	{
		this._failedPill.visible = n > 0;
		if (n > 0)
			this._failedPill.child.text = n + ' failed';
	}

	closeMenu()
	{
		this._menu.close();
	}

	flash(text, ms = 2000)
	{
		if (this._flashId)
			GLib.source_remove(this._flashId);

		this._subtitle.set_text(text);
		this._flashId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () =>
		{
			this._flashId = 0;
			this._subtitle.set_text(this._status);
			return GLib.SOURCE_REMOVE;
		});
	}

	_setStatus(text)
	{
		this._status = text;
		if (!this._flashId)
			this._subtitle.set_text(text);
	}

	markUpdating(total)
	{
		this._setStatus('Updating… 0/' + total);
	}

	markProgress(done, total)
	{
		this._setStatus('Updating… ' + done + '/' + total);
	}

	markIdle()
	{
		this._setStatus('');
	}

	markUpdated()
	{
		this._setStatus('Updated at ' + new Date().toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' }));
	}
});
