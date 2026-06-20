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

import { getInstance } from '../encoder.js';

const Encoder = getInstance();

function stripTags(s)
{
	return Encoder.htmlDecode(s).replace(/<.*?>/g, "").trim();
}

function buildDesc(s)
{
	let desc = stripTags((s || "").replace("<![CDATA[", "").replace("]]>", ""));
	if (desc.length > 290)
		desc = desc.substr(0, 290) + "...";
	return desc;
}

// A single feed entry: normalized fields and a read flag that FeedSource owns.
export class FeedItem
{
	constructor(data)
	{
		this.id = data.id;
		this.read = true;
		this.link = data.link;
		this.title = stripTags(data.title);
		this.publishDate = data.publishDate || new Date().toISOString();
		this.updateTime = data.updateTime || '';
		this.desc = buildDesc(data.desc);
	}

	update(data)
	{
		this.link = data.link;
		this.title = stripTags(data.title);
		this.publishDate = data.publishDate || this.publishDate;
		this.updateTime = data.updateTime || '';
		this.desc = buildDesc(data.desc);
	}
}
