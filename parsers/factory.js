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

import { parse } from '../lib/txml.js';
import { FeedburnerParser } from './feedburner.js';
import { RdfParser } from './rdf.js';
import { AtomParser } from './atom.js';
import { RssParser } from './rss.js';

const VOID_TAGS = ['img', 'br', 'hr'];

// unclosed void tags in an unescaped description fail the strict parse, so retry once with them treated as self-closing
function parseXml(text)
{
	try
	{
		return parse(text, { selfClosingTags: [] });
	}
	catch
	{
		return parse(text, { selfClosingTags: VOID_TAGS });
	}
}

export function createRssParser(rawXml, sourceURL)
{
	try
	{
		let nodes = parseXml(rawXml);
		let root = nodes.find(n => typeof n === 'object' && n.tagName[0] !== '?');

		if (!root)
			return null;

		let test;

		test = 'rdf:RDF';
		if (root.tagName.slice(0, test.length) == test)
			return new RdfParser(root);

		test = 'feed';
		if (root.tagName.toLowerCase().slice(0, test.length) == test)
			return new AtomParser(root);

		// FeedBurner serves Atom with its namespace too, its parser reads only the RSS shape
		if (root.attributes['xmlns:feedburner'] == 'http://rssnamespace.org/feedburner/ext/1.0')
			return new FeedburnerParser(root);

		test = 'rss';
		if (root.tagName.toLowerCase().slice(0, test.length) == test)
			return new RssParser(root);
	}
	catch (e)
	{
		console.warn('[rss-feed] ' + sourceURL + ': ' + String(e.message).replace(/\s+/g, ' '));
	}

	return null;
}

// a url that no longer serves a feed and a feed we cannot read need different fixes, so the status has to tell them apart
export function describeParseFailure(rawXml)
{
	let text = rawXml.trim();

	if (!text)
		return 'Empty response';

	// a moved or retired feed usually answers with the site's own page
	if (/^(<!doctype html|<html)/i.test(text))
		return 'Not a feed';

	try
	{
		parseXml(text);
	}
	catch
	{
		return 'Malformed XML';
	}

	return 'Not a feed';
}
