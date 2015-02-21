/*
*   TODO licence
*/

const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Main = imports.ui.main;
const Mainloop = imports.mainloop;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup;
const St = imports.gi.St;
const Util = imports.misc.util;

const Convenience = Me.imports.convenience;
const Parser = Me.imports.parser;

const RSS_FEEDS_LIST_KEY = 'rss-feeds-list';
const UPDATE_INTERVAL_KEY = 'update-interval';

/* class that extend PopupMenuItem class of rss feed functionality*/
const PopupRssFeedMenuItem = new Lang.Class({

    Name: 'PopupRssFeedMenuItem',
    Extends: PopupMenu.PopupMenuItem,

    _init: function(link, title) {
        this.parent(title);

        this._link = link;

        try {
            // try to get default browser
            this._browser = Gio.app_info_get_default_for_uri_scheme("http").get_executable();
        }
        catch (err) {
            logError(err + ' (get default browser error)');
            throw 'get default browser error';
            return;
        }

        this.connect('activate', Lang.bind(this, function() {
            Util.trySpawnCommandLine(this._browser + ' ' + this._link);
        }));
    }
});

/* Main extension class */
const RssFeedButton = new Lang.Class({

    Name: 'RssFeedButton',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "RSS Feed");

        this._httpSession = null;
        this._settings = Convenience.getSettings();
        this._feedsArray = new Array();

        this._scid = this._settings.connect('changed', Lang.bind(this, this._onSettingsChanged));

        /* top panel button */
        let icon = new St.Icon({
            icon_name: 'application-rss+xml-symbolic',
            style_class: 'system-status-icon'
        });

        this.actor.add_actor(icon);

        /* menu items*/
        let testarea = new PopupMenu.PopupMenu();

        this._feedsBox = new St.BoxLayout({
            vertical: true,
            reactive: false
        });

        this._feedsSection = new PopupMenu.PopupMenuSection();

        //let scrollView = new St.ScrollView();
        //scrollView.add_actor(this._feedsSection.actor);

        let testlabel = new St.Label({
            text: 'Lorem ipsum dolor sit amet'
        });

        let testlabel2 = new St.Label({
            text: 'duni dunaj a luna za lunou sa vali'
        });

        let popupitem = new PopupMenu.PopupSubMenuMenuItem("Lorem ipsum dolor sit amet");
        let popupitem2 = new PopupMenu.PopupSubMenuMenuItem("Duni Dunaj a vlna za vlnou sa vali");

        popupitem.menu.addMenuItem(new PopupMenu.PopupMenuItem("consectetur adipiscing elit"));
        popupitem.menu.addMenuItem(new PopupMenu.PopupMenuItem("sed do eiusmod tempor incididunt ut labore"));

        let boxItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        //boxItem.actor.add_actor(scrollView);

        //this.menu.addMenuItem(popupitem);
        //this.menu.addMenuItem(popupitem2);

        this.menu.addMenuItem(this._feedsSection);

        //this.menu.addMenuItem(this._feedsSection);

        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(separator);

        let buttonMenu = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        let systemMenu = Main.panel.statusArea.aggregateMenu._system;

        let reloadBtn = systemMenu._createActionButton('view-refresh-symbolic', "Reload RSS Feeds");
        let settingsBtn = systemMenu._createActionButton('preferences-system-symbolic', "RSS Feed Settings");
        buttonMenu.actor.add_actor(reloadBtn);
        buttonMenu.actor.add_actor(settingsBtn);

        reloadBtn.connect('clicked', Lang.bind(this, this._realoadRssFeeds));
        settingsBtn.connect('clicked', Lang.bind(this, this._onSettingsBtnClicked));

        this.menu.addMenuItem(buttonMenu);

        this._updateInterval = this._settings.get_int(UPDATE_INTERVAL_KEY);
        this._rssFeeds = this._settings.get_strv(RSS_FEEDS_LIST_KEY);
        this._realoadRssFeeds();
        this._refreshExtensionUI();
        this._feedsArray.length = this._rssFeeds.length;
    },

    stop: function() {

        if (this._httpSession)
            this._httpSession.abort();
        this._httpSession = null;

        if (this._scid)
            this._settings.disconnect(this._scid);

        if (this._timeout)
            Mainloop.source_remove(this._timeout);
    },

    _onSettingsBtnClicked: function() {

        this.menu.actor.hide();
        Util.spawn(["gnome-shell-extension-prefs", "rss-feed@gnome-shell-extension.todevelopers.github.com"]);
    },

    _onSettingsChanged: function() {

        this._updateInterval = this._settings.get_int(UPDATE_INTERVAL_KEY);
        this._rssFeeds = this._settings.get_strv(RSS_FEEDS_LIST_KEY);
        this._realoadRssFeeds();
    },

    _realoadRssFeeds: function() {

        if (this._timeout)
            Mainloop.source_remove(this._timeout);

        if (this._rssFeeds) {

            for (let i = 0; i < this._rssFeeds.length; i++)
                this._httpGetRequestAsync(this._rssFeeds[i], i, Lang.bind(this, this._onDownload));
        }

        this._timeout = Mainloop.timeout_add_seconds(this._updateInterval*60, Lang.bind(this, this._realoadRssFeeds));
    },

    _httpGetRequestAsync: function(url, position, callback) {

        if (this._httpSession == null)
            this._httpSession = new Soup.Session();

        let request = Soup.form_request_new_from_hash('GET', url, {});

        this._httpSession.queue_message(request, Lang.bind(this, function(httpSession, message) {

            callback(message.response_body.data, position);
        }));
    },

    _onDownload: function(responseData, position) {

        let rssParser = new Parser.createRssParser(responseData);
        rssParser.parse();

        let rssFeed = {
            Publisher: {
                Title: ''
            },
            Items: []
        };
        rssFeed.Publisher.Title = rssParser.Publisher.Title;
        for (let i = 0; i < rssParser.Items.length; i++) {
            let item = {
                Title: '',
                HttpLink: ''
            };
            item.Title = rssParser.Items[i].Title;
            item.HttpLink = rssParser.Items[i].HttpLink;
            rssFeed.Items.push(item);
        }
        this._feedsArray[position] = rssFeed;


        /*let subMenu = new PopupMenu.PopupSubMenuMenuItem(rssParser.Publisher.Title + ' (' + nItems + ')');

        for (let i = 0; i < nItems; i++) {
            let menuItem = new PopupMenu.PopupMenuItem(rssParser.Items[i].Title);
            subMenu.menu.addMenuItem(menuItem);
        }

        this._feedsSection.addMenuItem(subMenu);*/

        this._refreshExtensionUI();

        rssParser.clear();

        /*log('link: ' + rssParser.Publisher.HttpLink);
        log('description: ' + rssParser.Publisher.Description);
        log('publish date: ' + rssParser.Publisher.PublishDate);

        for (let i = 0; i < rssParser.Items.length; i++) {
            log('item ' + i);
            log('title: ' + rssParser.Items[i].Title);
            log('link: ' + rssParser.Items[i].HttpLink);
            log('description: ' + rssParser.Items[i].Description);
            log('publish date: ' + rssParser.Items[i].PublishDate);
            log('author: ' + rssParser.Items[i].Author);
        }*/
    },

    _refreshExtensionUI: function() {

        this._feedsSection.removeAll();

        for (let i = 0; i < this._feedsArray.length; i++) {

            let nItems = this._feedsArray[i].Items.length;

            if (this._feedsArray[i] && nItems > 0) {

                let subMenu = new PopupMenu.PopupSubMenuMenuItem(this._feedsArray[i].Publisher.Title + ' (' + nItems + ')');

                for (let j = 0; j < nItems; j++) {

                    let menuItem = new PopupRssFeedMenuItem(this._feedsArray[i].Items[j].HttpLink, this._feedsArray[i].Items[j].Title);
                    subMenu.menu.addMenuItem(menuItem);
                }

                this._feedsSection.addMenuItem(subMenu);
            }
            else {

                let subMenu = new PopupMenu.PopupSubMenuMenuItem('loading...');
                this._feedsSection.addMenuItem(subMenu);
            }

        }
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
