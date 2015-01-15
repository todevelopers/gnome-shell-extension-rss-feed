/*
*   TODO licence
*/

const Lang = imports.lang;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup;
const St = imports.gi.St;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Parser = Me.imports.parser;

/* Main extension class */
const RssFeedButton = new Lang.Class({

    Name: 'RssFeedMenuButton',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "RSS Feed");

        this._httpSession = null;

        /* top panel button */
        let icon = new St.Icon({
            icon_name: 'application-rss+xml-symbolic',
            style_class: 'system-status-icon'
        });

        this.actor.add_actor(icon);

        /* menu items*/
        let testarea = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        let testlabel = new St.Label({
            text: 'Lorem ipsum dolor sit amet'
        });

        testarea.actor.add_actor(testlabel);
        this.menu.addMenuItem(testarea);

        let item = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(item);

        let buttonMenu = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        let systemMenu = Main.panel.statusArea.aggregateMenu._system;

        let refreshBtn = systemMenu._createActionButton('view-refresh-symbolic', "Refresh");
        let settingsBtn = systemMenu._createActionButton('preferences-system-symbolic', "RSS Feed Settings");
        buttonMenu.actor.add_actor(refreshBtn);
        buttonMenu.actor.add_actor(settingsBtn);

        refreshBtn.connect('clicked', Lang.bind(this, this._onRefreshBtnClicked));

        this.menu.addMenuItem(buttonMenu);
    },

    stop: function() {

        if (this._httpSession != null)
            this._httpSession.abort();

        this._httpSession = null;
    },

    _onRefreshBtnClicked: function() {

        this._httpGetRequestAsync('http://www.root.cz/rss/clanky', {}, Lang.bind(this, this._onDownload));
        this._httpGetRequestAsync('http://feeds.feedburner.com/webupd8?format=xml', {}, Lang.bind(this, this._onDownload));
    },

    _httpGetRequestAsync: function(url, params, callback) {

        if (this._httpSession == null)
            this._httpSession = new Soup.Session();

        let request = Soup.form_request_new_from_hash('GET', url, params);



        this._httpSession.queue_message(request, Lang.bind(this, function(httpSession, message) {

            //Main.notify('rss-feed', message.response_body.data.substring(0, 256));
            callback(message.response_body.data);
            //callback.call(message.response_body.data);
                /*try {http://feeds.feedburner.com/webupd8
                    if (!message.response_body.data) {
                        fun.call(this, 0);
                        return;
                    }
                    let jp = JSON.parse(message.response_body.data);
                    fun.call(this, jp);
                } catch (e) {
                    fun.call(this, 0);
                    return;
                }*/
        }));
    },

    _onDownload: function(responseData) {

        let rssParser = new Parser.createRssParser(responseData);
        rssParser.parse();

        log('title: ' + rssParser.Publisher.Title);
        log('link: ' + rssParser.Publisher.HttpLink);
        log('description: ' + rssParser.Publisher.Description);
        log('publish date: ' + rssParser.PublishDate);
    }
});

let rssFeedBtn;

function init() {

}

function enable() {
    rssFeedBtn = new RssFeedButton();
    Main.panel.addToStatusArea('rssFeedMenu', rssFeedBtn, 0, 'right');
}

function disable() {
    rssFeedBtn.stop();
    rssFeedBtn.destroy();
}
