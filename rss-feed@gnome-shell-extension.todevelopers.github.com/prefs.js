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

		this._store = new Gtk.ListStore();
		this._store.set_column_types([GObject.TYPE_STRING]);

		this._actor = new Gtk.TreeView({ model: this._store,
									   headers_visible: false,
									   reorderable: true,
									   hexpand: true,
									   vexpand: true });
		this._actor.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

		let column = new Gtk.TreeViewColumn();

		let cell = new Gtk.CellRendererText({ editable: false });
		column.pack_start(cell, true);
		column.add_attribute(cell, "text", COLUMN_ID);
		this._actor.append_column(column);

		scrolledWindow.add(this._actor);
		this.add(scrolledWindow);

		let toolbar = new Gtk.Toolbar();
		toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_INLINE_TOOLBAR);
		toolbar.set_icon_size(1);

		let delButton = new Gtk.ToolButton({ icon_name: 'list-remove-symbolic' });
		delButton.connect('clicked', Lang.bind(this, this._deleteSelected));
		toolbar.add(delButton);

		let editButton = new Gtk.ToolButton({ icon_name: 'edit-symbolic' });
		editButton.connect('clicked', Lang.bind(this, this._editSelected));
		toolbar.add(editButton);

		let newButton = new Gtk.ToolButton({ icon_name: 'list-add-symbolic' });
		newButton.connect('clicked', Lang.bind(this, this._createNew));
		toolbar.add(newButton);

		this.add(toolbar);
	},

	_createDialog: function(title, text, onOkButton) {

		let dialog = new Gtk.Dialog({title: title});
		dialog.set_modal(true);
		dialog.set_resizable(false);
		dialog.set_border_width(12);

		this._entry = new Gtk.Entry({text: text});
		//this._entry.margin_top = 12;
		this._entry.margin_bottom = 12;
		this._entry.width_chars = 40;

		dialog.add_button(Gtk.STOCK_CANCEL, 0);
		let okButton = dialog.add_button(Gtk.STOCK_OK, 1);	// default
		okButton.set_can_default(true);
		dialog.set_default(okButton);
		this._entry.activates_default = true;

		let dialog_area = dialog.get_content_area();
		//dialog_area.pack_start(label, 0, 0, 0);
		dialog_area.pack_start(this._entry, 0, 0, 0);

		dialog.connect("response", Lang.bind(this, function(w, response_id) {

			if (response_id) {	// button OK
				onOkButton();
			}

			dialog.hide();
		}));

		dialog.show_all();
	},

	_createNew: function() {

		this._createDialog('New RSS Feed source', '', Lang.bind(this, function() {

			let iter = this._store.append();
			this._store.set_value(iter, COLUMN_ID, this._entry.get_text());
		}));
	},

	_editSelected: function() {

		let [any, model, iter] = this._actor.get_selection().get_selected();

		if (any) {

			this._createDialog('Edit RSS Feed source', this._store.get_value(iter, COLUMN_ID),
			Lang.bind(this, function() {

				this._store.set_value(iter, COLUMN_ID, this._entry.get_text());
			}));
		}

	},

	_deleteSelected: function() {

		let [any, model, iter] = this._actor.get_selection().get_selected();

		if (any) {

			this._store.remove(iter);
		}
	}
});

function init() {
}

function buildPrefsWidget() {

	let widget = new RssFeedSettingsWidget();
	widget.show_all();

	return widget;
}
