/*
*	TODO licence
*/

const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;
const Lang = imports.lang;

const Me = ExtensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;

const MAX_UPDATE_INTERVAL = 1440;
const COLUMN_ID = 0;


const RssFeedSettingsWidget = new GObject.Class({

	Name: 'RssFeed.Prefs.RssFeedSettingsWidget',
	GTypeName: 'RssFeedSettingsWidget',
	Extends: Gtk.Box,

	_init : function(params) {

		this.parent(params);
		this.orientation = Gtk.Orientation.VERTICAL;
		this.margin = 12;
		//this.spacing = 6;

		let settings = Convenience.getSettings();

		// update interval
		let box = new Gtk.Box( { orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 } );
		box.set_margin_bottom(6);
		let label = new Gtk.Label({ xalign: 0, label: 'Update interval (minutes):' });
		box.pack_start(label, true, true, 0);

		let spinbtn = Gtk.SpinButton.new_with_range(1, MAX_UPDATE_INTERVAL, 1);
		spinbtn.set_value(settings.get_int('update-interval'));
		settings.bind('update-interval', spinbtn, 'value', Gio.SettingsBindFlags.DEFAULT);

		box.add(spinbtn);
		this.add(box);

		// rss feed sources
		let scrolledWindow = new Gtk.ScrolledWindow();
		scrolledWindow.set_border_width(0);
		scrolledWindow.set_shadow_type(1);

		let store = new Gtk.ListStore();
		store.set_column_types([GObject.TYPE_STRING]);

		let actor = new Gtk.TreeView({ model: store,
									   headers_visible: false,
									   reorderable: true,
									   hexpand: true,
									   vexpand: true });
		actor.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

		let column = new Gtk.TreeViewColumn();

		let cell = new Gtk.CellRendererText({ editable: false });
		column.pack_start(cell, true);
		column.add_attribute(cell, "text", COLUMN_ID);
		actor.append_column(column);

		scrolledWindow.add(actor);
		this.add(scrolledWindow);

		let toolbar = new Gtk.Toolbar();
		toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR);
		toolbar.set_icon_size(1);

		let delButton = new Gtk.ToolButton({ icon_name: 'list-remove-symbolic' });
		//delButton.connect('clicked', Lang.bind(this, this._deleteSelected));
		toolbar.add(delButton);

		let editButton = new Gtk.ToolButton({ icon_name: 'edit-symbolic' });
		//editButton.connect('clicked', Lang.bind(this, this._editSelected));
		toolbar.add(editButton);

		let newButton = new Gtk.ToolButton({ icon_name: 'list-add-symbolic' });
		newButton.connect('clicked', Lang.bind(this, this._createNew));
		toolbar.add(newButton);

		this.add(toolbar);

		/*// add fake data
		let iter = store.append();
		store.set_value(iter, COLUMN_ID, "http://mysite.com/1/rss");*/
	},

	_createNew: function() {

		let dialog = new Gtk.Dialog({title: "New RSS Feed source"});
		dialog.set_modal(true);
		dialog.set_resizable(false);
		dialog.set_border_width(12);

		let entry = new Gtk.Entry();
		//entry.margin_top = 12;
		entry.margin_bottom = 12;
		entry.width_chars = 40;

		dialog.add_button(Gtk.STOCK_CANCEL, 0);
		dialog.add_button(Gtk.STOCK_OK, 1);	// default


		let dialog_area = dialog.get_content_area();
		//dialog_area.pack_start(label, 0, 0, 0);
		dialog_area.pack_start(entry, 0, 0, 0);

		dialog.connect("response", Lang.bind(this, function(w, response_id) {

			if (response_id) {	// button OK

			}

			dialog.hide();
		}));

		dialog.show_all();
	}
});

function init() {
}

function buildPrefsWidget() {

	let widget = new RssFeedSettingsWidget();
	widget.show_all();

	return widget;
}
