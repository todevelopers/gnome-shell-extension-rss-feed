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

    _initItem: function() {

        let item = {
            Title: '',
            HttpLink: '',
            Description: '',
            Author: '',
            Contributor: '',
            PublishDate: ''
        };

        return item;
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

    _init: function(root) {
        this.parent(root);
        Log.Debug("Feedburner RSS parser");
    },

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

        let item = this._initItem();

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

    _init: function(root) {
        this.parent(root);
        Log.Debug("RDF RSS parser");
    },

    parse: function() {

        for (let i = 0; i < this._root.childElements.length; i++) {

            if (this._root.childElements[i].name == 'channel') {
                this._parsePublisher(this._root.childElements[i].childElements);
            }
            else if (this._root.childElements[i].name == 'item') {
                this._parseItem(this._root.childElements[i].childElements);
            }
        }
    },

    _parsePublisher: function(childElements) {

        for (let i = 0; i < childElements.length; i++) {

            if (childElements[i].name == 'title') {
                this.Publisher.Title = childElements[i].text;
                //Log.Debug("Publisher Title: " + this.Publisher.Title);
            }
            else if (childElements[i].name == 'link') {
                this.Publisher.HttpLink = childElements[i].text;
                //Log.Debug("Publisher Link: " + this.Publisher.HttpLink);
            }
            else if (childElements[i].name == 'description') {
                this.Publisher.Description = childElements[i].text;
                //Log.Debug("Publisher Description: " + this.Publisher.Description);
            }
            else if (childElements[i].name == 'dc:date') {
                this.Publisher.PublishDate = childElements[i].text;
                //Log.Debug("Publisher Date: " + this.Publisher.PublishDate);
            }
        }
    },

    _parseItem: function(itemElements) {

        let item = this._initItem();

        for (let i = 0; i < itemElements.length; i++) {

            if (itemElements[i].name == 'title') {
                item.Title = itemElements[i].text;
                //Log.Debug("Item Title: " + item.Title);
            }
            else if (itemElements[i].name == 'link') {
                item.HttpLink = itemElements[i].text;
                //Log.Debug("Item Link: " + item.HttpLink);
            }
            else if (itemElements[i].name == 'description') {
                item.Description = itemElements[i].text;
                //Log.Debug("Item Description: " + item.Description);
            }
            else if (itemElements[i].name == 'dc:date') {
                item.PublishDate = itemElements[i].text;
                //Log.Debug("Item Date: " + item.PublishDate);
            }
            else if (itemElements[i].name == 'dc:creator') {
                item.Author = itemElements[i].text;
                //Log.Debug("Item Author: " + item.Author);
            }
            else if (itemElements[i].name == 'dc:contributor') {
                item.Contributor = itemElements[i].childElements[0].childElements[0].text;
                //Log.Debug("Item Author: " + item.Contributor);
            }
        }

        this.Items.push(item);
    }
});

/*
 *  default rss parser class (format RSS 2.0)
 */
const DefaultRssParser = new Lang.Class({

    Name: 'DefaultRssParserClass',
    Extends: BaseParser,

    _init: function(root) {
        this.parent(root);
        Log.Debug("Default RSS parser");
    },

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

        let item = this._initItem();

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
 *  Atom 1.0 format parser class
 */
const AtomRssParser = new Lang.Class({

    Name: 'AtomRssParserClass',
    Extends: BaseParser,

    _init: function(root) {
        this.parent(root);
        Log.Debug("Atom RSS parser");
    },

    parse: function() {

        this._parsePublisher(this._root.childElements);   // root = feed
    },

    _parsePublisher: function(childElements) {

        for (let i = 0; i < childElements.length; i++) {

            if (childElements[i].name == 'title') {
                this.Publisher.Title = childElements[i].text;
            }
            else if (childElements[i].name == 'link' && childElements[i].attribute('rel') != 'self') {
                this.Publisher.HttpLink = childElements[i].attribute('href');
            }
            else if (childElements[i].name == 'description') {
                this.Publisher.Description = childElements[i].text;
            }
            else if (childElements[i].name == 'updated') {
                this.Publisher.PublishDate = childElements[i].text;
            }
            else if (childElements[i].name == 'entry') {
                this._parseItem(childElements[i].childElements);
            }
        }
    },

    _parseItem: function(itemElements) {

        let item = this._initItem();

        for (let i = 0; i < itemElements.length; i++) {

            if (itemElements[i].name == 'title') {
                item.Title = itemElements[i].text;
            }
            else if (itemElements[i].name == 'link') {
                item.HttpLink = itemElements[i].attribute('href');
            }
            else if (itemElements[i].name == 'description') {
                item.Description = itemElements[i].text;
            }
            else if (itemElements[i].name == 'published') {
                item.PublishDate = itemElements[i].text;
            }
            else if (itemElements[i].name == 'author') {
                item.Author = itemElements[i].childElements[0].text;
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
        // remove XML declarations because the REXML library is not able to parse it
        // more lines possibility
        let cleanXml = rawXml.split(/\<\?\s*xml(.*?).*\?\>/).join('');

        // remove HTML comments. REXML library could not handle it (especially when couple of lines are commented)
        cleanXml = cleanXml.split(/<!--[\s\S]*?-->/g).join('');

        let xdoc = new XML.REXML(cleanXml);

        if (xdoc.rootElement.attribute('xmlns:feedburner') == 'http://rssnamespace.org/feedburner/ext/1.0')
            return new FeedburnerRssParser(xdoc.rootElement);

        let test;

        test = 'rdf:RDF';
        if (xdoc.rootElement.name.slice(0, test.length) == test)
            return new RdfRssParser(xdoc.rootElement);

        test = 'feed';
        if (xdoc.rootElement.name.toLowerCase().slice(0, test.length) == test)
            return new AtomRssParser(xdoc.rootElement);

        test = 'rss';
        if (xdoc.rootElement.name.toLowerCase().slice(0, test.length) == test)
            return new DefaultRssParser(xdoc.rootElement);
    }
    catch (e) {
        Log.Error(e);
    }

    return null;
}
