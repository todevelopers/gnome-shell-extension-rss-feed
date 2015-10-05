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

const Clutter = imports.gi.Clutter;
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
const Parser = Me.imports.parsers.factory;
const Log = Me.imports.logger;
const Settings = Convenience.getSettings();

const ExtensionGui = {
    RssPopupMenuItem: Me.imports.extensiongui.rsspopupmenuitem.RssPopupMenuItem,
    RssPopupSubMenuMenuItem: Me.imports.extensiongui.rsspopupsubmenumenuitem.RssPopupSubMenuMenuItem
};

const RSS_FEEDS_LIST_KEY = 'rss-feeds-list';
const UPDATE_INTERVAL_KEY = 'update-interval';
const ITEMS_VISIBLE_KEY = 'items-visible';
const SEND_NOTIFICATION_KEY = 'send-notification';
const DEBUG_ENABLED_KEY = 'enable-debug';

/*
 *  Main RSS Feed extension class
 */
const RssFeedButton = new Lang.Class({

    Name: 'RssFeedButton',
    Extends: PanelMenu.Button,

    /*
     *  Initialize instance of RssFeedButton class
     */
    _init: function() {
        this.parent(0.0, "RSS Feed");

        this._httpSession = null;
        this._startIndex = 0;
        this._notify = false;
        
        this._newFeedIcon = Gio.icon_new_for_string(Me.path + "/application-rss+xml-symbolic-inverted.svg");
        

        // top panel button
        this._icon = new St.Icon({
            icon_name: 'application-rss+xml-symbolic',
            style_class: 'system-status-icon'
        });

        this.actor.add_actor(this._icon);
        
        this._feedsBox = new St.BoxLayout({
            vertical: true,
            reactive: false
        });

        this._feedsSection = new PopupMenu.PopupMenuSection();

        this.menu.addMenuItem(this._feedsSection);

        let separator = new PopupMenu.PopupSeparatorMenuItem();
        this.menu.addMenuItem(separator);

        // buttons in bottom menu bar
        this._buttonMenu = new PopupMenu.PopupBaseMenuItem({
            reactive: false
        });

        let systemMenu = Main.panel.statusArea.aggregateMenu._system;
        let prevBtn = systemMenu._createActionButton('go-previous-symbolic', "Previous");
        let nextBtn = systemMenu._createActionButton('go-next-symbolic', "Next");
        let reloadBtn = systemMenu._createActionButton('view-refresh-symbolic', "Reload RSS Feeds");
        let settingsBtn = systemMenu._createActionButton('preferences-system-symbolic', "RSS Feed Settings");

        this._lastUpdateTime = new St.Button({label: 'Last update: --:--'});

        this._buttonMenu.actor.add_actor(prevBtn);
        this._buttonMenu.actor.add_actor(nextBtn);
        this._buttonMenu.actor.add_actor(this._lastUpdateTime);
        this._buttonMenu.actor.add_actor(reloadBtn);
        this._buttonMenu.actor.add_actor(settingsBtn);

        prevBtn.connect('clicked', Lang.bind(this, this._onPreviousBtnClicked));
        nextBtn.connect('clicked', Lang.bind(this, this._onNextBtnClicked));
        reloadBtn.connect('clicked', Lang.bind(this, this._realoadRssFeeds));
        settingsBtn.connect('clicked', Lang.bind(this, this._onSettingsBtnClicked));

        this.menu.addMenuItem(this._buttonMenu);

        // loading data on startup
        this._realoadRssFeeds();
    },

    /*
     *  Frees resources of extension
     */
    stop: function() {

        if (this._httpSession)
            this._httpSession.abort();
        this._httpSession = null;

        if (this._scid)
            Settings.disconnect(this._scid);

        if (this._timeout)
            Mainloop.source_remove(this._timeout);
    },
    
    /*
     * Change icon on click
     */
    _onEvent: function(actor, event) {
        if (this.menu &&
            (event.type() == Clutter.EventType.TOUCH_BEGIN ||
             event.type() == Clutter.EventType.BUTTON_PRESS)) {
            this.menu.toggle();
            this._icon.set_icon_name('application-rss+xml-symbolic');
        }

        return Clutter.EVENT_PROPAGATE;
    },

    /*
     *  Get variables from GSettings
     */
    _getSettings: function() {

        Log.Debug("Get variables from GSettings");

        // interval for updates
        this._updateInterval = Settings.get_int(UPDATE_INTERVAL_KEY);
        // rss sources visible per page
        this._itemsVisible = Settings.get_int(ITEMS_VISIBLE_KEY);
        // send notification?
        this._isSendNotification = Settings.get_boolean(SEND_NOTIFICATION_KEY);
        // http sources for rss feeds
        this._rssFeedsSources = Settings.get_strv(RSS_FEEDS_LIST_KEY);

        Log.Debug("Update interval: " + this._updateInterval +
                  " Visible items: " + this._itemsVisible +
                  " Send notification: " + this._isSendNotification + 
                  " RSS sources: " + this._rssFeedsSources);
    },

    /*
     *  On settings button clicked callback
     */
    _onSettingsBtnClicked: function() {

        this.menu.actor.hide();
        Util.spawn(["gnome-shell-extension-prefs", "rss-feed@gnome-shell-extension.todevelopers.github.com"]);
    },

    /*
     *  On previous button clicked callback
     */
    _onPreviousBtnClicked: function() {

        this._startIndex -= this._itemsVisible;
        if (this._startIndex < 0)
            this._startIndex = 0
        this._refreshExtensionUI();
    },

    /*
     *  On next button clicked callback
     */
    _onNextBtnClicked: function() {

        if (this._startIndex + this._itemsVisible < this._rssFeedsSources.length)
        {
            this._startIndex += this._itemsVisible;
            this._refreshExtensionUI();
        }
    },

    /*
     *  Returns JSON object that represents HTTP (GET method) parameters
     *  stored in URL
     *  url - HTTP request URL
     */
    _getParametersAsJson: function(url) {

        if (url.indexOf('?') == -1)
            return "{}";

        let urlParams = url.substr(url.indexOf('?') + 1);
        let params = urlParams.split('&');

        let jsonObj = "{";
        for (let i = 0; i < params.length; i++)
        {
            let pair = params[i].split('=');
            jsonObj += '"' + pair[0] + '":' + '"' + pair[1] + '"';
            if (i != params.length -1)
                jsonObj += ',';
        }
        jsonObj += "}";

        return jsonObj;
    },

    /*
     *  Scheduled reload of RSS feeds from sources set in settings
     */
    _realoadRssFeeds: function() {

        this._getSettings();

        Log.Debug("Reload RSS Feeds");

        // array for GUI purposes
        // TODO check if realocate of this array is necesary after change in sources
        // TODO try to forget this array and do bussines without it
        if (!this._feedsArray) {
            this._feedsArray = new Array(this._rssFeedsSources.length);
        }

        // remove timeout
        if (this._timeout)
            Mainloop.source_remove(this._timeout);

        if (this._rssFeedsSources) {

            for (let i = 0; i < this._rssFeedsSources.length; i++)
            {
                let url = this._rssFeedsSources[i];
                let jsonObj = this._getParametersAsJson(url);

                if (url.indexOf('?') != -1)
                    url = url.substr(0, url.indexOf('?'));

                this._httpGetRequestAsync(url, JSON.parse(jsonObj), i, Lang.bind(this, this._onDownload));
            }
        }
        
        // send notification
        if (this._isSendNotification && this._notify) {
            Main.notify("RSS Feed", "New RSS Feed available");
            this._notify = false;
        }

        // set timeout if enabled
        if (this._updateInterval > 0) {
            Log.Debug("Next scheduled reload after " + this._updateInterval*60 + " seconds");
            this._timeout = Mainloop.timeout_add_seconds(this._updateInterval*60, Lang.bind(this, this._realoadRssFeeds));
        }
    },

    /*
     *  Creates asynchronous HTTP GET request through Soup interface
     *  url - HTTP request URL without parameters
     *  params - JSON object of HTTP GET request parameters
     *  position - Position in RSS sources list
     *  callback - calls on HTTP GET request response
     */
    _httpGetRequestAsync: function(url, params, position, callback) {

        if (this._httpSession == null)
            this._httpSession = new Soup.SessionAsync();

        // Lours974 Vitry David
        // This makes the session work under a proxy. The funky syntax here
        // is required because of another libsoup quirk, where there's a gobject
        // property called 'add-feature', designed as a construct property for
        // C convenience.
        Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ProxyResolverDefault());

        Log.Debug("[" + position + "] Soup HTTP GET request. URL: " + url + " parameters: " + JSON.stringify(params));

        let request = Soup.form_request_new_from_hash('GET', url, params);

        this._httpSession.queue_message(request, Lang.bind(this, function(httpSession, message) {

            Log.Debug("[" + position + "] Soup HTTP GET reponse. Status code: " + message.status_code +
            " Content Type: " + message.response_headers.get_one("Content-Type"));

            if (message.response_body.data)
                callback(message.response_body.data, position);
        }));
    },

    /*
     *  Lead number with zeros
     *  num - input number
     *  size - size of number leadign with zeros
     */
    _pad: function (num, size) {
        let s = num + "";
        while (s.length < size) s = "0" + s;
        return s;
    },

    /*
     *  On HTTP request response download callback
     *  responseData - response data
     *  position - Position in RSS sources list
     */
    _onDownload: function(responseData, position) {

        let rssParser = new Parser.createRssParser(responseData);

        if (rssParser == null)
            return;

        rssParser.parse();

        if (rssParser.Items.length > 0)
        {
            // change icon if new feed found
            if (!this._feedsArray[position] || 
                 this._feedsArray[position].Items[0] != rssParser.Items[0]) {
                 this._icon.set_gicon(this._newFeedIcon);
                 this._notify = true
            }
            
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
        }

        this._refreshExtensionUI();

        // update last download time
        let time = new Date();
        this._lastUpdateTime.set_label('Last update: ' + this._pad(time.getHours(), 2)
            + ':' + this._pad(time.getMinutes(), 2));

        rssParser.clear();
    },

    /*
     *  Reloads feeds section
     */
    _refreshExtensionUI: function() {

        this._feedsSection.removeAll();

        let counter = 0;

        for (let i = this._startIndex; i < this._feedsArray.length; i++) {

            if (this._feedsArray[i] && this._feedsArray[i].Items) {

                let nItems = this._feedsArray[i].Items.length;

                let subMenu = new ExtensionGui.RssPopupSubMenuMenuItem(this._feedsArray[i].Publisher, nItems);

                for (let j = 0; j < nItems; j++) {

                    let menuItem = new ExtensionGui.RssPopupMenuItem(this._feedsArray[i].Items[j]);
                    subMenu.menu.addMenuItem(menuItem);
                }

                this._feedsSection.addMenuItem(subMenu);
            }
            else {

                let subMenu = new PopupMenu.PopupMenuItem('No data available');
                this._feedsSection.addMenuItem(subMenu);
            }

            counter++;

            if (counter == this._itemsVisible)
                break;

        }
    }
});

/*
 *  Extension widget instance
 */
let rssFeedBtn;

/*
 *  Initialize the extension
 */
function init() {

    // hack for dconf
    let enabled = Settings.get_boolean(DEBUG_ENABLED_KEY);
    Settings.set_boolean(DEBUG_ENABLED_KEY, enabled);

    Log.Debug("Extension initialized.");
}

/*
 *  Enable the extension
 */
function enable() {

    rssFeedBtn = new RssFeedButton();
    Main.panel.addToStatusArea('rssFeedMenu', rssFeedBtn, 0, 'right');

    Log.Debug("Extension enabled.");
}

/*
 *  Disable the extension
 */
function disable() {

    rssFeedBtn.stop();
    rssFeedBtn.destroy();

    Log.Debug("Extension disabled.");
}
