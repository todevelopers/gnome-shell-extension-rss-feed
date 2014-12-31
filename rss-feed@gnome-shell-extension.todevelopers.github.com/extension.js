/*
*   TODO licence
*/

const Lang = imports.lang;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;


/* Main extension class */
const RssFeedButton = new Lang.Class({

    Name: 'RssFeedMenuButton',
    Extends: PanelMenu.Button,

    _init: function() {
        this.parent(0.0, "RSS Feed");

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

        this.menu.addMenuItem(buttonMenu);
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
    rssFeedBtn.destroy();
}
