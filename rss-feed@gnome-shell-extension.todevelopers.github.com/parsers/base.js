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
//const Log = Me.imports.logger;

/*
 *  Base 'abstract' class for RSS parser. Every format inherits from this class
 *  and must implements all empty methods
 */
const BaseParser = new Lang.Class({

    Name: 'BaseParser',

    /*
     *  Array of RSS articles
     */
    Items: [],

    /*
     *  RSS publisher
     */
    Publisher: {
        Title: '',
        HttpLink: '',
        Description: '',
        PublishDate: ''
    },

    /*
     *  Initialize the instance of BaseParser class
     *  root - root element of feed file
     */
    _init: function(root) {

        this._root = root;
    },

    /*
     *  Initialize RSS article item object
     */
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

    /*
     *  Clears publisher and items
     */
    clear: function() {

        while(this.Items.length > 0)
            this.Items.pop();
        this.Publisher.Title = '';
        this.Publisher.HttpLink = '';
        this.Publisher.Description = '';
        this.Publisher.PublishDate = '';
    },

    /*
     *  Abstract function to Parse feed file
     */
    parse: function() {
        // child classes implements this 'abstract' function
    },

    /*
     *  Abstract function to Parse publisher
     */
    _parsePublisher: function(childElements) {
        // child classes implements this 'abstract' function
    },

    /*
     *  Abstract function to Parse item
     */
    _parseItem: function(itemElements) {
        // child classes implements this 'abstract' function
    }
});
