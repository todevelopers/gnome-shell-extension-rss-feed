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

import { parse } from './lib/txml.js';

function getAttribute(attributes, name)
{
	let lower = name.toLowerCase();
	for (let key in attributes)
	{
		if (key.toLowerCase() === lower)
			return attributes[key];
	}
	return undefined;
}

function outlineTitle(node)
{
	let text = getAttribute(node.attributes, 'text');
	if (text != null)
		return text;
	let title = getAttribute(node.attributes, 'title');
	if (title != null)
		return title;
	return '';
}

function collectFeeds(node, folder, feeds, seen)
{
	let url = getAttribute(node.attributes, 'xmlUrl');
	if (url && !seen.has(url))
	{
		seen.add(url);
		feeds.push({ url, title : outlineTitle(node), folder });
	}

	for (let child of node.children)
	{
		if (typeof child === 'object' && child.tagName.toLowerCase() === 'outline')
			collectFeeds(child, folder, feeds, seen);
	}
}

export function parseOpml(text)
{
	let nodes = parse(text, { selfClosingTags : [], decodeEntities : true });
	let root = nodes.find(n => typeof n === 'object' && n.tagName[0] !== '?');

	if (!root || root.tagName.toLowerCase() !== 'opml')
		return [];

	let body = root.children.find(n => typeof n === 'object' && n.tagName.toLowerCase() === 'body');

	if (!body)
		return [];

	let feeds = [];
	let seen = new Set();

	for (let child of body.children)
	{
		if (typeof child !== 'object' || child.tagName.toLowerCase() !== 'outline')
			continue;

		let folder = getAttribute(child.attributes, 'xmlUrl') ? '' : outlineTitle(child);
		collectFeeds(child, folder, feeds, seen);
	}

	return feeds;
}

function escapeAttribute(value)
{
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function feedOutline(feed)
{
	let title = escapeAttribute(feed.title);
	return '<outline text="' + title + '" title="' + title + '" type="rss" xmlUrl="' + escapeAttribute(feed.url) + '"/>';
}

export function buildOpml(feeds)
{
	let order = [];
	let folders = new Map();

	for (let feed of feeds)
	{
		let folder = feed.folder || '';
		if (!folder)
		{
			order.push({ feed });
			continue;
		}

		let group = folders.get(folder);
		if (!group)
		{
			group = { folder, feeds : [] };
			folders.set(folder, group);
			order.push(group);
		}
		group.feeds.push(feed);
	}

	let lines = [];
	lines.push('<?xml version="1.0" encoding="UTF-8"?>');
	lines.push('<opml version="2.0">');
	lines.push('\t<head>');
	lines.push('\t\t<title>RSS Feed</title>');
	lines.push('\t</head>');
	lines.push('\t<body>');

	for (let entry of order)
	{
		if (entry.feed)
		{
			lines.push('\t\t' + feedOutline(entry.feed));
		}
		else
		{
			let name = escapeAttribute(entry.folder);
			lines.push('\t\t<outline text="' + name + '" title="' + name + '">');
			for (let feed of entry.feeds)
				lines.push('\t\t\t' + feedOutline(feed));
			lines.push('\t\t</outline>');
		}
	}

	lines.push('\t</body>');
	lines.push('</opml>');

	return lines.join('\n') + '\n';
}
