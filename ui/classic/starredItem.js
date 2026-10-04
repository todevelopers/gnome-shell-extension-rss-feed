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
import { getInstance } from '../../encoder.js';
import { ArticleHoverButtons } from '../articleHoverButtons.js';

const Encoder = getInstance();

export const ClassicStarredItem = GObject.registerClass(
class ClassicStarredItem extends PopupMenu.PopupBaseMenuItem
{
	_init(item, source, runner)
	{
		super._init();
		this.add_style_class_name('rss-starred-article-row');
		this._item = item;
		this._source = source;
		this._runner = runner;

		let contentBox = new St.BoxLayout({ vertical: true, x_expand: true });
		this._titleLabel = new St.Label({ text: item.title });
		this._titleLabel.add_style_class_name(item.read ? 'rss-article-read' : 'rss-article-unread');
		this._titleLabel.clutter_text.ellipsize = Pango.EllipsizeMode.END;
		contentBox.add_child(this._titleLabel);

		// the line is as high as the hover buttons, the labels must not stretch to it
		let metaBox = new St.BoxLayout({ style_class: 'rss-article-meta' });
		this._sourceTag = new St.Label({ text: Encoder.htmlDecode(source.title), style_class: 'rss-source-tag', y_align: Clutter.ActorAlign.CENTER });
		this._sourceTag.clutter_text.ellipsize = Pango.EllipsizeMode.END;
		metaBox.add_child(this._sourceTag);

		let timeLabel = new St.Label(
		{
			text: Misc.relativeTime(item.publishDate),
			style_class: 'rss-article-time',
			x_expand: true,
			x_align: Clutter.ActorAlign.END,
			y_align: Clutter.ActorAlign.CENTER,
		});

		// the buttons take the place of the time, whichever of the two shows sits at the end of the line
		this._hoverButtons = new ArticleHoverButtons(this, item, source, runner, [timeLabel]);
		this._hoverButtons.x_expand = true;
		this._hoverButtons.x_align = Clutter.ActorAlign.END;
		metaBox.add_child(this._hoverButtons);
		metaBox.add_child(timeLabel);

		contentBox.add_child(metaBox);
		this.add_child(contentBox);

		source.connectObject('meta-changed', () => this._sourceTag.set_text(Encoder.htmlDecode(this._source.title)), this);

		this.connect('notify::hover', () => this._hoverButtons.sync());
		this.connect('notify::active', () => this._hoverButtons.sync());
		this.connect('key-press-event', (_actor, event) => this._hoverButtons.navigate(event));
	}

	get source()
	{
		return this._source;
	}

	// PopupBaseMenuItem activates on any button release; the menu closes only through the base activate
	activate(event)
	{
		let button = Clutter.BUTTON_PRIMARY;
		if (event.type() === Clutter.EventType.BUTTON_RELEASE)
			button = event.get_button();

		let id = this._runner.mouseAction(button);
		this._runner.run(id, this._source, this._item);
		this._hoverButtons.sync();
		if (this._runner.closesMenu(id))
			super.activate(event);
	}

	setOrnament(ornament)
	{
		if (!this._titleLabel)
			return;
		if (ornament === PopupMenu.Ornament.DOT)
		{
			this._titleLabel.remove_style_class_name('rss-article-read');
			this._titleLabel.add_style_class_name('rss-article-unread');
		}
		else
		{
			this._titleLabel.remove_style_class_name('rss-article-unread');
			this._titleLabel.add_style_class_name('rss-article-read');
		}
	}
});
