const Lang = imports.lang;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const XML = Me.imports.rexml;

const RssFeedParser = new Lang.Class({

    RssFeedItem: [],
    Publisher: {
        Title: '',
        HttpLink: '',
        Description: ''
    },
    PublishDate: '',

    parse: function(xmlDoc) {

        try {
            xdoc = new XML.REXML(xmlDoc);
        }
        catch(e) {
            logError(e);
        }

        this._parsePublisher(xdoc.rootElement.childElements[0].childElements);   // rss -> channel
    }

    _parsePublisher: function(childElements) {

        for (let i = 0; i < childElements.length; i++) {

            if (childElements[i].name == 'title') {
                Publisher.Title = childElements[i].text;
            }
            else if (childElements[i].name == 'link') {
                Publisher.HttpLink = childElements[i].text;
            }
            else if (childElements[i].name == 'description') {
                Publisher.Description = childElements[i].text;
            }
            else if (childElements[i].name == 'pubDate') {
                PublishDate = childElements[i].text;
            }
        }
    }
});
