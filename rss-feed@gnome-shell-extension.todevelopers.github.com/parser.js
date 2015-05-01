/*
 * XML Parser wrapper class for RSS Feed extension
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

const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Log = Me.imports.logger;
const XML = Me.imports.rexml;

/*
 *  Base class for RSS parser
 */
const BaseParser = new Lang.Class({

    Name: 'BaseParserClass',

    Items: [],  // array of Item
    Publisher: {
        Title: '',
        HttpLink: '',
        Description: '',
        PublishDate: ''
    },

    _init: function(root) {

        this._root = root;
    },

    clear: function() {

        while(this.Items.length > 0)
            this.Items.pop();
        this.Publisher.Title = '';
        this.Publisher.HttpLink = '';
        this.Publisher.Description = '';
        this.Publisher.PublishDate = '';
    },

    parse: function() {

        this._parsePublisher(this._root.childElements[0].childElements);   // root = rss -> channel
    },

    _parsePublisher: function(childElements) {
        // child classes implements this function
    },

    _parseItem: function(itemElements) {
        // child classes implements this function
    }
});

/*
 *  special class for Feedburner RSS feed
 */
const FeedburnerRssParser = new Lang.Class({

    Name: 'FeedburnerRssParserClass',
    Extends: BaseParser,

    _parsePublisher: function(childElements) {

        for (let i = 0; i < childElements.length; i++) {

            if (childElements[i].name == 'title') {
                this.Publisher.Title = childElements[i].text;
            }
            else if (childElements[i].name == 'link') {
                this.Publisher.HttpLink = childElements[i].text;
            }
            else if (childElements[i].name == 'description') {
                this.Publisher.Description = childElements[i].text;
            }
            else if (childElements[i].name == 'lastBuildDate') {
                this.Publisher.PublishDate = childElements[i].text;
            }
            else if (childElements[i].name == 'item') {
                this._parseItem(childElements[i].childElements);
            }
        }
    },

    _parseItem: function(itemElements) {

        let item = {
            Title: '',
            HttpLink: '',
            Description: '',
            Author: '',
            PublishDate: ''
        };

        for (let i = 0; i < itemElements.length; i++) {

            if (itemElements[i].name == 'title') {
                item.Title = itemElements[i].text;
            }
            else if (itemElements[i].name == 'link') {
                item.HttpLink = itemElements[i].text;
            }
            else if (itemElements[i].name == 'description') {
                item.Description = itemElements[i].text;
            }
            else if (itemElements[i].name == 'pubDate') {
                item.PublishDate = itemElements[i].text;
            }
            else if (itemElements[i].name == 'author') {
                item.Author = itemElements[i].text;
            }
        }

        this.Items.push(item);
    }
});

/*
 *  RDF parser class
 */
const RdfRssParser = new Lang.Class({

    Name: 'RdfRssParserClass',
    Extends: BaseParser,

    parse: function() {

        this._parsePublisher(this._root.childElements);   // root = rdf
    },

    _parsePublisher: function(childElements) {

        Log.Debug("RDF parse publisher elements " + childElements.length);

        for (let i = 0; i < childElements.length; i++) {

            if (childElements[i].name == 'title') {
                this.Publisher.Title = childElements[i].text;
            }
            else if (childElements[i].name == 'link') {
                this.Publisher.HttpLink = childElements[i].text;
            }
            else if (childElements[i].name == 'description') {
                this.Publisher.Description = childElements[i].text;
            }
            else if (childElements[i].name == 'pubDate') {
                this.Publisher.PublishDate = childElements[i].text;
            }
            else if (childElements[i].name == 'item') {
                this._parseItem(childElements[i].childElements);
            }
        }
    },

    _parseItem: function(itemElements) {

        let item = {
            Title: '',
            HttpLink: '',
            Description: '',
            Author: '',
            PublishDate: ''
        };

        for (let i = 0; i < itemElements.length; i++) {

            if (itemElements[i].name == 'title') {
                item.Title = itemElements[i].text;
            }
            else if (itemElements[i].name == 'link') {
                item.HttpLink = itemElements[i].text;
            }
            else if (itemElements[i].name == 'description') {
                item.Description = itemElements[i].text;
            }
            else if (itemElements[i].name == 'pubDate') {
                item.PublishDate = itemElements[i].text;
            }
            else if (itemElements[i].name == 'author') {
                item.Author = itemElements[i].text;
            }
        }

        this.Items.push(item);
    }
});

/*
 *  default rss parser class
 */
const DefaultRssParser = new Lang.Class({

    Name: 'DefaultRssParserClass',
    Extends: BaseParser,

    _parsePublisher: function(childElements) {

        for (let i = 0; i < childElements.length; i++) {

            if (childElements[i].name == 'title') {
                this.Publisher.Title = childElements[i].text;
            }
            else if (childElements[i].name == 'link') {
                this.Publisher.HttpLink = childElements[i].text;
            }
            else if (childElements[i].name == 'description') {
                this.Publisher.Description = childElements[i].text;
            }
            else if (childElements[i].name == 'pubDate') {
                this.Publisher.PublishDate = childElements[i].text;
            }
            else if (childElements[i].name == 'item') {
                this._parseItem(childElements[i].childElements);
            }
        }
    },

    _parseItem: function(itemElements) {

        let item = {
            Title: '',
            HttpLink: '',
            Description: '',
            Author: '',
            PublishDate: ''
        };

        for (let i = 0; i < itemElements.length; i++) {

            if (itemElements[i].name == 'title') {
                item.Title = itemElements[i].text;
            }
            else if (itemElements[i].name == 'link') {
                item.HttpLink = itemElements[i].text;
            }
            else if (itemElements[i].name == 'description') {
                item.Description = itemElements[i].text;
            }
            else if (itemElements[i].name == 'pubDate') {
                item.PublishDate = itemElements[i].text;
            }
            else if (itemElements[i].name == 'author') {
                item.Author = itemElements[i].text;
            }
        }

        this.Items.push(item);
    }
});

/*
 *  Factory function that initialize correct RSS parser class instance
 */
function createRssParser(rawXml) {

    try {
        // remove XML declarations because the REXML library isnt able to parse it
        // more lines possibility
        let cleanXml = rawXml.split(/\<\?\s*xml(.*?).*\?\>/).join('');

        let xdoc = new XML.REXML(cleanXml);

        if (xdoc.rootElement.attribute('xmlns:feedburner') == 'http://rssnamespace.org/feedburner/ext/1.0')
            return new FeedburnerRssParser(xdoc.rootElement);
        else if (xdoc.rootElement.name == 'rdf:RDF')
            return new RdfRssParser(xdoc.rootElement);
        else
            return new DefaultRssParser(xdoc.rootElement);
    }
    catch (e) {
        Log.Error(e);
        return null;
    }
}
