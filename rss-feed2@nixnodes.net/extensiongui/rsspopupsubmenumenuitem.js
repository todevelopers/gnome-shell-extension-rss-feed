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


const
PopupMenu = imports.ui.popupMenu;

const
Me = imports.misc.extensionUtils.getCurrentExtension();
const
Log = Me.imports.logger;
const
Encoder = Me.imports.encoder.getInstance();

const
RssPopupSubMenu = Me.imports.extensiongui.rsspopupsubmenu.RssPopupSubMenu;

/*
 *  RssPopupSubMenuMenuItem class that extends PopupSubMenuMenuItem. Holds RSS feed articles
 */
var
RssPopupSubMenuMenuItem = class _RssPopupSubMenuMenuItem extends PopupMenu.PopupSubMenuMenuItem
{

	/*
	 *  Initialize instance of RssPopupSubMenuMenuItem class
	 *  publisher - RSS feed publisher
	 *  nitems - number of articles
	 */
	constructor(publisher, nitems)
	{

		let
		title = Encoder.htmlDecode(publisher.Title);
		if (title.length > 128)
			title = title.substr(0, 128) + "...";

		super(title);

		// kinda nasty, but what the hell
		this.menu.destroy();
		this.menu = new RssPopupSubMenu(this.actor, this._triangle);
		this.menu.connect('open-state-changed', 
			this._subMenuOpenStateChanged.bind(this));
		this._olabeltext = title;
	}
};
