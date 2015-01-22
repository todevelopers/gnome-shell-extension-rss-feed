/*
*	TODO licence
*/

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const MAX_UPDATE_INTERVAL = 1440;


const RssFeedSettingsWidget = new GObject.Class({

	Name: 'RssFeed.Prefs.RssFeedSettingsWidget',
	GTypeName: 'RssFeedSettingsWidget',
	Extends: Gtk.Box,

	_init : function(params) {

		this.parent(params);
		this.orientation = Gtk.Orientation.VERTICAL;
		this.margin = 12;
		this.spacing = 6;

		let settings = Convenience.getSettings();

		let box = new Gtk.Box( { orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 } );
		box.add(new Gtk.Label( { label: 'Update interval (minutes):' } ));

		let spinbtn = Gtk.SpinButton.new_with_range(1, MAX_UPDATE_INTERVAL, 1);
		spinbtn.set_value(settings.get_int('update-interval'));
		settings.bind('update-interval', spinbtn, 'value', Gio.SettingsBindFlags.DEFAULT);

		box.add(spinbtn);
		this.add(box);
	}
});

function init() {
}

function buildPrefsWidget() {

	let widget = new RssFeedSettingsWidget();
	widget.show_all();

	return widget;
}
