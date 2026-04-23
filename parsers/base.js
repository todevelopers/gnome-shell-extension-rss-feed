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
Me = imports.misc.extensionUtils.getCurrentExtension();

/*
 *  Base 'abstract' class for RSS parser. Every format inherits from this class
 *  and must implements all empty methods
 */
var
BaseParser = class _BaseParser
{

	/*
	 *  Initialize the instance of BaseParser class
	 *  root - root element of feed file
	 */
	constructor(root)
	{

		this._root = root;

		this.Publisher =
		{
			Title : '',
			HttpLink : '',
			Description : '',
			PublishDate : ''
		};

		this.Items = [];
	}

	/*
	 *  Initialize RSS article item object
	 */
	_initItem ()
	{
		return {
			Title : '',
			HttpLink : '',
			Description : '',
			Author : '',
			Contributor : '',
			PublishDate : '',
			UpdateTime : '',
			ID: ''
		};
	}

	/*
	 *  Clears publisher and items
	 */

	clear ()
	{

		while (this.Items.length > 0)
			this.Items.pop();
		this.Publisher.Title = '';
		this.Publisher.HttpLink = '';
		this.Publisher.Description = '';
		this.Publisher.PublishDate = '';
		this.Publisher.UpdateTime = '';
	}

	/*
	 *  Abstract function to Parse feed file
	 */
	parse ()
	{
		// child classes implements this 'abstract' function
	}

	/*
	 *  Abstract function to Parse publisher
	 */
	_parsePublisher(childElements)
	{
		// child classes implements this 'abstract' function
	}

	/*
	 *  Abstract function to Parse item
	 */
	_parseItem (itemElements)
	{
		// child classes implements this 'abstract' function
	}
	
	_postprocessItem (item)
	{
		if ( !item.ID ) {
			if ( !item.HttpLink ) {
				return 0;
			} else {
				item.ID = item.HttpLink;
			}
		}
		
		return 1;
	}
};
