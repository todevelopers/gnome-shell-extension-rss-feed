const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const XML = Me.imports.rexml;

// base class for RSS parser
const BaseParser = new Lang.Class({

    Name: 'BaseParserClass',

    Items: [],
    Publisher: {
        Title: '',
        HttpLink: '',
        Description: '',
        PublishDate: ''
    },

    _init: function(root) {

        this._root = root;
    },

    parse: function() {

        this._parsePublisher(this._root.childElements[0].childElements);   // root=rss -> channel
    },

    _parsePublisher: function(childElements) {
        // child classes implements this function
    },

    _parseItem: function(itemElements) {
        // child classes implements this function
    }
});

// special class for Feedburner RSS feed
const FeedburnerRssParser = new Lang.Class({

    Name: 'FeedburnerRssParserClass',
    Extends: BaseParser,

    _parsePublisher: function(childElements) {

        log('FeedburnerRssParserClass');
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

// default rss parser class
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

// factory function that creates correct RSS parser class instance
function createRssParser(rawXml) {

    try {
        // remove XML declarations because REXML library does not parse it
        // more lines possibility
        let cleanXml = rawXml.split(/\<\?\s*xml(.*?).*\?\>/).join('');

        let xdoc = new XML.REXML(cleanXml);

        if (xdoc.rootElement.attribute('xmlns:feedburner') == 'http://rssnamespace.org/feedburner/ext/1.0')
            return new FeedburnerRssParser(xdoc.rootElement);
        else
            return new DefaultRssParser(xdoc.rootElement);
    }
    catch (e) {
        logError(e);
    }
}
