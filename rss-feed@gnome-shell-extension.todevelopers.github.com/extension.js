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

        let icon = new St.Icon({
            icon_name: 'application-rss+xml-symbolic',
            style_class: 'system-status-icon'
        });

        this.actor.add_actor(icon);
    }
});

let rssFeedButton;

function init() {

}

function enable() {
    rssFeedButton = new RssFeedButton();
    Main.panel.addToStatusArea('rssFeedMenu', rssFeedButton, 0, 'right');
}

function disable() {
    rssFeedButton.destroy();
}
