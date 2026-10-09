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

// a tag starts right after its bracket, so "5 < 6 and 7 > 3" stays text; [^<>] also matches a tag broken over several lines
const TAG = /<[a-zA-Z/!][^<>]*>/g;

// the words on both sides of a line break or of the end of a block must not run together
const BREAK = /<(?:br|\/(?:p|div|li|h[1-6]|tr|td|blockquote))\b[^<>]*>/gi;

function stripTags(s)
{
	return s.replace(BREAK, " ").replace(TAG, "");
}

function buildDesc(s)
{
	let desc = stripTags(Encoder.htmlDecode((s || "").replace("<![CDATA[", "").replace("]]>", ""))).trim();
	if (desc.length > 290)
		desc = desc.substr(0, 290) + "...";
	return desc;
}

function buildTitle(title, desc)
{
	// a title is text, brackets that arrive escaped belong to it (Vec<u8>), so markup is removed before the entities are decoded
	let result = Encoder.htmlDecode(stripTags(title || "")).trim();
	if (result)
		return result;

	return desc.replace(/\s+/g, " ");
}

// A single feed entry: normalized fields and a read flag that FeedSource owns.
export class FeedItem
{
	constructor(data)
	{
		this.id = data.id;
		this.read = true;
		this.starred = false;
		this.dismissed = false;
		this.link = Encoder.htmlDecode(data.link);
		this.publishDate = data.publishDate || new Date().toISOString();
		this.updateTime = data.updateTime || '';
		this.desc = buildDesc(data.desc);
		this.title = buildTitle(data.title, this.desc);
	}

	update(data)
	{
		this.link = Encoder.htmlDecode(data.link);
		this.publishDate = data.publishDate || this.publishDate;
		this.updateTime = data.updateTime || '';
		this.desc = buildDesc(data.desc);
		this.title = buildTitle(data.title, this.desc);
		this._timestamp = undefined;
	}

	// parsing the date is the expensive part of sorting, so it is done once per article
	get timestamp()
	{
		if (this._timestamp === undefined)
			this._timestamp = new Date(this.publishDate).getTime() || 0;

		return this._timestamp;
	}

	// persisted fields are already normalized; the constructor would decode and strip them a second time
	static restore(data)
	{
		let item = Object.create(FeedItem.prototype);

		item.id = data.id;
		item.read = !!data.read;
		item.starred = !!data.starred;
		item.dismissed = !!data.dismissed;
		// links stored by older versions still carry the entities of the feed
		item.link = Encoder.htmlDecode(data.link);
		item.title = data.title;
		item.publishDate = data.publishDate;
		item.updateTime = data.updateTime;
		item.desc = data.desc;

		return item;
	}
}
