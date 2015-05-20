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
const Base = Me.imports.parsers.base;
const Log = Me.imports.logger;

/*
 *  RDF (RSS 1.0) parser class
 */
const RdfParser = new Lang.Class({

    Name: 'RdfParser',
    Extends: Base.BaseParser,

    /*
     *  Initialize the instance of RdfParser class
     *  root - root element of feed file
     */
    _init: function(root) {
        this.parent(root);
        Log.Debug("RDF (RSS 1.0) parser");
    },

    /*
     *  Parse feed file
     */
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

    /*
     *  Parse publisher
     */
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

    /*
     *  Parse item
     */
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
