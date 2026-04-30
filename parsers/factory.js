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

import { REXML } from '../rexml.js';
import { FeedburnerParser } from './feedburner.js';
import { RdfParser } from './rdf.js';
import { AtomParser } from './atom.js';
import { RssParser } from './rss.js';

export function createRssParser(rawXml)
{
	try
	{
		let cleanXml = rawXml.split(/\<\?\s*xml(.*?).*\?\>/).join('');
		cleanXml = cleanXml.split(/<!--[\s\S]*?-->/g).join('');

		let xdoc = new REXML(cleanXml);

		if (xdoc.rootElement.attribute('xmlns:feedburner') == 'http://rssnamespace.org/feedburner/ext/1.0')
			return new FeedburnerParser(xdoc.rootElement);

		let test;

		test = 'rdf:RDF';
		if (xdoc.rootElement.name.slice(0, test.length) == test)
			return new RdfParser(xdoc.rootElement);

		test = 'feed';
		if (xdoc.rootElement.name.toLowerCase().slice(0, test.length) == test)
			return new AtomParser(xdoc.rootElement);

		test = 'rss';
		if (xdoc.rootElement.name.toLowerCase().slice(0, test.length) == test)
			return new RssParser(xdoc.rootElement);
	}
	catch (e)
	{
		console.error('rss-feed: parser error: ' + e);
	}

	return null;
}
