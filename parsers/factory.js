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

import { parse } from '../txml.js';
import { FeedburnerParser } from './feedburner.js';
import { RdfParser } from './rdf.js';
import { AtomParser } from './atom.js';
import { RssParser } from './rss.js';

export function createRssParser(rawXml)
{
	try
	{
		let nodes = parse(rawXml, { selfClosingTags: [] });
		let root = nodes.find(n => typeof n === 'object' && n.tagName[0] !== '?');

		if (!root)
			return null;

		if (root.attributes['xmlns:feedburner'] == 'http://rssnamespace.org/feedburner/ext/1.0')
			return new FeedburnerParser(root);

		let test;

		test = 'rdf:RDF';
		if (root.tagName.slice(0, test.length) == test)
			return new RdfParser(root);

		test = 'feed';
		if (root.tagName.toLowerCase().slice(0, test.length) == test)
			return new AtomParser(root);

		test = 'rss';
		if (root.tagName.toLowerCase().slice(0, test.length) == test)
			return new RssParser(root);
	}
	catch (e)
	{
		console.error('[rss-feed] parser error: ' + e);
	}

	return null;
}
