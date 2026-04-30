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

export class AtomParser extends BaseParser
{
	constructor(root)
	{
		super(root);
		this._type = "Atom";
	}

	parse()
	{
		this._parsePublisher(this._root.childElements);
	}

	_parsePublisher(childElements)
	{
		for (let i = 0; i < childElements.length; i++)
		{
			if (childElements[i].name == 'title')
			{
				this.Publisher.Title = childElements[i].text;
			}
			else if (childElements[i].name == 'link' && childElements[i].attribute('rel') != 'self')
			{
				this.Publisher.HttpLink = childElements[i].attribute('href');
			}
			else if (childElements[i].name == 'description')
			{
				this.Publisher.Description = childElements[i].text;
			}
			else if (childElements[i].name == 'updated')
			{
				this.Publisher.PublishDate = childElements[i].text;
			}
			else if (childElements[i].name == 'entry')
			{
				this._parseItem(childElements[i].childElements);
			}
		}
	}

	_parseItem(itemElements)
	{
		let item = this._initItem();

		for (let i = 0; i < itemElements.length; i++)
		{
			if (itemElements[i].name == 'title')
			{
				item.Title = itemElements[i].text;
			}
			else if (itemElements[i].name == 'link')
			{
				item.HttpLink = itemElements[i].attribute('href');
			}
			else if (itemElements[i].name == 'description')
			{
				item.Description = itemElements[i].text;
			}
			else if (itemElements[i].name == 'published')
			{
				item.PublishDate = itemElements[i].text;
			}
			else if (itemElements[i].name == 'updated')
			{
				item.UpdateTime = itemElements[i].text;
			}
			else if (itemElements[i].name == 'author')
			{
				item.Author = itemElements[i].childElements[0].text;
			}
			else if (itemElements[i].name == 'id')
			{
				item.ID = itemElements[i].text;
			}
		}

		if (!this._postprocessItem(item))
			return;

		this.Items.push(item);
	}
}
