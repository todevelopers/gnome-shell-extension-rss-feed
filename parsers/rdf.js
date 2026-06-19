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

import { BaseParser } from './base.js';

export class RdfParser extends BaseParser
{
	constructor(root)
	{
		super(root);
		this._type = "RSS 1.0";
	}

	parse()
	{
		let elements = this._root.children.filter(c => typeof c === 'object');
		for (let i = 0; i < elements.length; i++)
		{
			if (elements[i].tagName == 'channel')
			{
				this._parsePublisher(elements[i].children.filter(c => typeof c === 'object'));
			}
			else if (elements[i].tagName == 'item')
			{
				this._parseItem(elements[i].children.filter(c => typeof c === 'object'));
			}
		}
	}

	_parsePublisher(childElements)
	{
		for (let i = 0; i < childElements.length; i++)
		{
			if (childElements[i].tagName == 'title')
			{
				this.Publisher.Title = childElements[i].children.filter(c => typeof c === 'string').join('');
			}
			else if (childElements[i].tagName == 'link')
			{
				this.Publisher.HttpLink = childElements[i].children.filter(c => typeof c === 'string').join('');
			}
			else if (childElements[i].tagName == 'description')
			{
				this.Publisher.Description = childElements[i].children.filter(c => typeof c === 'string').join('');
			}
			else if (childElements[i].tagName == 'dc:date')
			{
				this.Publisher.PublishDate = childElements[i].children.filter(c => typeof c === 'string').join('');
			}
		}
	}

	_parseItem(itemElements)
	{
		let item = this._initItem();

		for (let i = 0; i < itemElements.length; i++)
		{
			if (itemElements[i].tagName == 'title')
			{
				item.Title = itemElements[i].children.filter(c => typeof c === 'string').join('');
			}
			else if (itemElements[i].tagName == 'link')
			{
				item.HttpLink = itemElements[i].children.filter(c => typeof c === 'string').join('');
			}
			else if (itemElements[i].tagName == 'description')
			{
				item.Description = itemElements[i].children.filter(c => typeof c === 'string').join('');
			}
			else if (itemElements[i].tagName == 'dc:date')
			{
				item.PublishDate = itemElements[i].children.filter(c => typeof c === 'string').join('');
			}
			else if (itemElements[i].tagName == 'dc:creator')
			{
				item.Author = itemElements[i].children.filter(c => typeof c === 'string').join('');
			}
			else if (itemElements[i].tagName == 'dc:contributor')
			{
				let a = itemElements[i].children.filter(c => typeof c === 'object')[0];
				let b = a && a.children.filter(c => typeof c === 'object')[0];
				item.Contributor = b ? b.children.filter(c => typeof c === 'string').join('') : '';
			}
		}

		if (!this._postprocessItem(item))
			return;

		this.Items.push(item);
	}
}
