/*
 * RSS Feed extension for GNOME Shell
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

import Gio from 'gi://Gio';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export function getDefaultBrowser()
{
	let browser;
	try
	{
		browser = Gio.app_info_get_default_for_uri_scheme("http").get_executable();
	}
	catch (err)
	{
		browser = "epiphany";
	}
	return browser;
}

export function processLinkOpen(url, cacheObj)
{
	if (isScreenLocked())
		return false;

	try
	{
		Gio.app_info_launch_default_for_uri(url, null);
	}
	catch (err)
	{
		console.error('rss-feed: failed to open URL: ' + err);
		return false;
	}

	if (cacheObj && cacheObj.Unread)
	{
		cacheObj.Unread = null;

		if (cacheObj.Menu)
			cacheObj.Menu.setOrnament(PopupMenu.Ornament.NONE);

		let feedCacheObj = cacheObj.parent;

		if (feedCacheObj)
		{
			feedCacheObj.UnreadCount--;

			let subMenu = feedCacheObj.Menu;

			feedCacheObj.pUnreadCount = feedCacheObj.UnreadCount;
			if (feedCacheObj.Menu)
				feedCacheObj.Menu.setUnreadCount(feedCacheObj.UnreadCount);

			let parentClass = feedCacheObj.parentClass;

			if (parentClass)
			{
				parentClass._totalUnreadCount--;
				parentClass._updateUnreadCountLabel(parentClass._totalUnreadCount);
			}

			if (!feedCacheObj.UnreadCount)
			{
				subMenu.setOrnament(PopupMenu.Ornament.NONE);
			}
		}
	}

	return true;
}

export function clampTitle(title)
{
	if (title.length > 128)
		title = title.substr(0, 128) + "...";
	return title;
}

export function isScreenLocked()
{
	return Main.sessionMode.isLocked;
}

export function lineBreak(input, ld, lm, pl)
{
	var result = "";
	var pi = 0;
	var lc = 0;

	for (var i = 0; i < input.length; i++)
	{
		lc++;
		if ((lc >= ld && input[i] == " " || lc == lm) || input[i] == "\n")
		{
			result += pl + input.substr(pi, lc).trim() + "\n";
			lc = 0;
			pi = i + 1;
		}
	}

	if (lc > 0)
		result += pl + input.substr(pi, lc);

	return result;
}
