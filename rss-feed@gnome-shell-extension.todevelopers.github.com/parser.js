const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const XML = Me.imports.rexml;

const RssFeedParser = new Lang.Class({

    Name: 'RssFeedParserClass',

    RssFeedItem: [],
    Publisher: {
        Title: '',
        HttpLink: '',
        Description: ''
    },
    PublishDate: '',

    _init: function() {

    },

    parse: function(xmlDoc) {

        try {

            let xdoc = new XML.REXML(xmlDoc);
            this._parsePublisher(xdoc.rootElement.childElements[0].childElements);   // rss -> channel
            log('atribute xmlns:feedburner: ' + xdoc.rootElement.attribute('xmlns:feedburner'));
        }
        catch(e) {

            logError(e);
        }
    },

    _parsePublisher: function(childElements) {

        for (let i = 0; i < childElements.length; i++) {

            //log(childElements[i].name);

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
                this.PublishDate = childElements[i].text;
            }
        }
    }
});
