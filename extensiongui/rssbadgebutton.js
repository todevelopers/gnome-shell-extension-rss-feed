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

export const RssBadgeButton = GObject.registerClass(
class RssBadgeButton extends St.Button
{
	_init(styleClass, defaultChild)
	{
		super._init(
		{
			style_class: styleClass,
			track_hover: true,
			can_focus: false,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this._defaultChild = defaultChild;
		this._confirmIcon = new St.Icon(
		{
			icon_name: 'object-select-symbolic',
			icon_size: 14,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
			style_class: 'rss-badge-confirm-icon',
		});
		this.set_child(defaultChild);
		this._confirmMode = false;
		this.onConfirm = null;
		this.onEnterConfirm = null;

		this.connect('clicked', () =>
		{
			if (this._confirmMode)
			{
				if (this.onConfirm)
					this.onConfirm();
				this.exitConfirm();
			}
			else
			{
				this.enterConfirm();
				if (this.onEnterConfirm)
					this.onEnterConfirm(this);
			}
		});

		this.connect_after('button-release-event', () => Clutter.EVENT_STOP);
	}

	enterConfirm()
	{
		if (this._confirmMode)
			return;
		this._confirmMode = true;
		this.set_child(this._confirmIcon);
	}

	exitConfirm()
	{
		if (!this._confirmMode)
			return;
		this._confirmMode = false;
		this.set_child(this._defaultChild);
	}
});
