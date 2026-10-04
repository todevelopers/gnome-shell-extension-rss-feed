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
import Pango from 'gi://Pango';
import St from 'gi://St';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Misc from '../../misc.js';

export const MinimalArticleItem = GObject.registerClass(
class MinimalArticleItem extends PopupMenu.PopupBaseMenuItem
{
	_init(item, source, runner, feedTitle)
	{
		super._init();
		this._item = item;
		this._source = source;
		this._runner = runner;

		let contentBox = new St.BoxLayout({ vertical: true, x_expand: true });
		this._titleLabel = new St.Label({ text: item.title });
		this._titleLabel.add_style_class_name(item.read ? 'rss-article-read' : 'rss-article-unread');
		this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
		contentBox.add_child(this._titleLabel);

		let metaBox = new St.BoxLayout({ style: 'spacing: 6px;' });
		this._sourceTag = new St.Label({ text: feedTitle, style_class: 'rss-source-tag' });
		this._sourceTag.clutter_text.ellipsize = Pango.EllipsizeMode.END;
		metaBox.add_child(this._sourceTag);
		metaBox.add_child(new St.Label({ text: Misc.relativeTime(item.publishDate), style_class: 'rss-article-time' }));
		contentBox.add_child(metaBox);
		this.add_child(contentBox);

		this.connect('destroy', () =>
		{
			this._destroyed = true;
		});
	}

	// PopupBaseMenuItem activates on any button release; the menu closes only through the base activate
	activate(event)
	{
		let button = Clutter.BUTTON_PRIMARY;
		if (event.type() === Clutter.EventType.BUTTON_RELEASE)
			button = event.get_button();

		let id = this._runner.mouseAction(button);
		this._runner.run(id, this._source, this._item);
		if (this._runner.closesMenu(id))
			super.activate(event);
	}
});
