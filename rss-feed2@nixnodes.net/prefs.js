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
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Soup = imports.gi.Soup;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Me.imports.convenience;
const Settings = Convenience.getSettings();

const Mainloop = imports.mainloop;

const Gettext = imports.gettext.domain('rss-feed2');
const _ = Gettext.gettext;

const HTTP = Me.imports.http;
const AssocSettings = Me.imports.gsaa;
const Parser = Me.imports.parsers.factory;

const COLUMN_URL = 0;
const COLUMN_TITLE = 1;
const COLUMN_STATUS = 2;
const COLUMN_NOTIF = 3;
const COLUMN_UPD = 4;

const MAX_UPDATE_INTERVAL = 1440;
const MAX_SOURCES_LIMIT = 1024;
const MAX_POLL_DELAY = 9999;
const MAX_HEIGHT = 8192;
const MAX_NOTIFICATIONS = 100;

const GSKeys = Me.imports.gskeys;

const Log = Me.imports.logger;

const GSE_TOOL_PATH = 'gnome-shell-extension-tool';

/*
 *	RssFeedSettingsWidget class for settings widget
 */

const RssFeedSettingsWidget = GObject.registerClass(
	class RssFeedSettingsWidget extends Gtk.Box
	{

		/*
		 *	Initialize new instance of RssFeedSettingsWidget class
		 */
		_init(params)
		{
			super._init(params);
			
			this.GTypeName = 'RssFeed2SettingsWidget';
			
			this.orientation = Gtk.Orientation.VERTICAL;
			this.margin_left = 10;
			this.margin_right = 10;
			this.margin_top = 10;
			this.margin_bottom = 2;

			this._aSettings = new AssocSettings.GSAA(GSKeys.RSS_FEEDS_SETTINGS);

			this._httpSession = new Soup.SessionAsync(
			{
				timeout: 30
			});

			Soup.Session.prototype.add_feature.call(this._httpSession, new Soup.ProxyResolverDefault());

			this._fCache = new Array();

			if (this.set_size_request)
				this.set_size_request(682, 600);

			let upper_box = new Gtk.Box(
			{
				orientation: Gtk.Orientation.HORIZONTAL,
				spacing: 8,
				margin_bottom: 6
			});
			{
				let general_box = new Gtk.Box(
				{
					orientation: Gtk.Orientation.VERTICAL,
					spacing: 6,
					hexpand: true
				});
				{
					this._addSpinButton(general_box, GSKeys.UPDATE_INTERVAL, _("Update interval (min):"), MAX_UPDATE_INTERVAL);
					this._addSpinButton(general_box, GSKeys.POLL_DELAY, _("Poll delay (ms):"), MAX_POLL_DELAY);
					this._addSwitch(general_box, GSKeys.PRESERVE_ON_LOCK, _("Preserve when screen off:"));
					this._addSwitch(general_box, GSKeys.DETECT_UPDATES, _("Detect updates:"));
					


					let debug_box = new Gtk.Box(
					{
						orientation: Gtk.Orientation.HORIZONTAL,
						spacing: 6,
						hexpand: true
					});
					{
						let reloadButton = new Gtk.ToolButton(
						{
							icon_name: 'view-refresh-symbolic'
						});
						reloadButton.connect('clicked', () =>
						{
							if (this._rldTimeout)
								return;

							if (!try_spawn([GSE_TOOL_PATH, '-d', Me.uuid]))
								return;

							this._rldTimeout = Mainloop.timeout_add(100, () =>
							{
								this._rldTimeout = undefined;
								try_spawn([GSE_TOOL_PATH, '-e', Me.uuid])
							});
						});
						reloadButton.set_tooltip_text(_("Reactivate extension"));

						let box_dbgsw = this._createControlBase(_("Debug mode:"));
						box_dbgsw.set_hexpand(true);
						box_dbgsw.add(reloadButton);

						let dbg_sw = new Gtk.Switch(
						{
							active: Settings.get_boolean(GSKeys.ENABLE_DEBUG),
							vexpand: false,
							margin_top: 2,
							margin_bottom: 2
						});

						dbg_sw.connect('notify::active', (b) =>
						{
							Settings.set_boolean(GSKeys.ENABLE_DEBUG, b.active);
						});

						box_dbgsw.add(dbg_sw);

						debug_box.add(box_dbgsw);
					}

					general_box.add(debug_box);
				}

				upper_box.add(general_box);

				this._addSeparator(upper_box, 2, 8);

				let menu_box = new Gtk.Box(
				{
					orientation: Gtk.Orientation.VERTICAL,
					spacing: 6,
					hexpand: true
				});
				{
					this._addSpinButton(menu_box, GSKeys.MAX_HEIGHT, _("Max menu height (px):"), MAX_HEIGHT);
					this._addSpinButton(menu_box, GSKeys.ITEMS_VISIBLE, _("Max items per source:"), MAX_SOURCES_LIMIT);
					this._addSwitch(menu_box, GSKeys.ENABLE_ANIMATIONS, _("Enable animations:"));
					this._addSwitch(menu_box, GSKeys.MB_ALIGN_TOP, _("Top-align buttons:"));
					this._addSwitch(menu_box, GSKeys.ENABLE_DESC, _("Show descriptions:"));
					this._addSwitch(menu_box, GSKeys.SET_SEEN_WHEN_CLOSED, _("Set every feed as seen when closed:"));
				}

				upper_box.add(menu_box);
			}

			this.add(upper_box);
			this._addSeparator(this, 0, 12);

			let notif_box = new Gtk.Box(
			{
				orientation: Gtk.Orientation.HORIZONTAL,
				spacing: 16,
				margin_bottom: 6
			});
			{
				let nbswStFunc = (self, state) =>
				{
					this._nbMax.set_sensitive(state);
					this._nbOnLockScreen.set_sensitive(state);
					this._nbCleanup.set_sensitive(state);
				};

				let notif_left = new Gtk.Box(
				{
					orientation: Gtk.Orientation.VERTICAL,
					spacing: 6,
					hexpand: true
				});
				{
					this._nbSwitch = this._addSwitch(notif_left, GSKeys.ENABLE_NOTIFICATIONS, _("Show notifications:"),
						nbswStFunc
					);
					this._nbMax = this._addSpinButton(notif_left, GSKeys.MAX_NOTIFICATIONS, _("Max notifications:"), MAX_NOTIFICATIONS);
				}

				let notif_right = new Gtk.Box(
				{
					orientation: Gtk.Orientation.VERTICAL,
					spacing: 6,
					hexpand: true
				});
				{
					this._nbOnLockScreen = this._addSwitch(notif_right, GSKeys.NOTIFICATIONS_ON_LOCKSCREEN, _("Show on lock screen:"));
					this._nbCleanup = this._addSwitch(notif_right, GSKeys.CLEANUP_NOTIFICATIONS, _("Clean up notifications:"));
				}

				notif_box.add(notif_left);
				notif_box.add(notif_right);

				nbswStFunc(null, Settings.get_boolean(GSKeys.ENABLE_NOTIFICATIONS));
			}

			this.add(notif_box);

			this._addSeparator(this, 2, 2);

			// sources label
			let boxsources = new Gtk.Box(
			{
				orientation: Gtk.Orientation.HORIZONTAL,
				spacing: 6
			});
			boxsources.set_margin_bottom(6);
			boxsources.set_margin_top(4);
			let labels = new Gtk.Label(
			{
				xalign: Gtk.Align.CENTER,
				label: _("RSS sources")
			});
			boxsources.pack_start(labels, true, true, 0);

			let checkRSSButton = new Gtk.ToolButton(
			{
				icon_name: 'view-refresh-symbolic'
			});
			checkRSSButton.connect('clicked', () =>
			{
				let [res, iter] = this._store.get_iter_first();
				let path;

				while (res)
				{
					path = this._store.get_path(iter);

					let cacheObj = this._fCache[path.get_indices()];

					if (!cacheObj)
						throw "FIXME: cache object and ListStore out of sync";

					this._validateItemURL(iter, cacheObj);

					path.next();

					[res, iter] = this._store.get_iter(path);
				}
			});
			checkRSSButton.set_tooltip_text(_("Re-check all RSS sources"))

			boxsources.add(checkRSSButton);

			this.add(boxsources);

			// rss feed sources
			let scrolledWindow = new Gtk.ScrolledWindow();
			scrolledWindow.set_border_width(0);
			scrolledWindow.set_shadow_type(1);

			this._store = new Gtk.ListStore();
			this._store.set_column_types([
				GObject.TYPE_STRING, 
				GObject.TYPE_STRING,
				GObject.TYPE_STRING,
				GObject.TYPE_BOOLEAN, 
				GObject.TYPE_BOOLEAN
			]);
			this._loadStoreFromSettings();

			this._actor = new Gtk.TreeView(
			{
				model: this._store,
				headers_visible: true,
				headers_clickable: true,
				reorderable: true,
				hexpand: true,
				vexpand: true,
				enable_search: true
			});

			this._actor.set_search_equal_func(
				(model, column, key, iter) =>
				{
					if (model.get_value(iter, COLUMN_URL).match(key))
						return false;
					else
						return true;
				});

			this._actor.get_selection().set_mode(Gtk.SelectionMode.SINGLE);
			let cellToggleFunc = function(key, self, path, iter, state)
			{
				let urlValue = this._store.get_value(iter, COLUMN_URL);
				this._aSettings.set(urlValue, key, state);
			};
			
			// URL column
			let [column_url, cell_url] = this._addSourcesColumn(this._actor, 
				new Gtk.CellRendererText({editable: true}), COLUMN_URL, _("URL"));

			column_url.add_attribute(cell_url, "text", COLUMN_URL);
			column_url.set_fixed_width(320);
			column_url.set_expand(true);
			column_url.set_sizing(Gtk.TreeViewColumnSizing.GROW_ONLY);

			// title column
			let [column_title, cell_title] = this._addSourcesColumn(this._actor,
				new Gtk.CellRendererText(), COLUMN_TITLE, _("Title"));
			
			column_title.add_attribute(cell_title, "text", COLUMN_TITLE);
			column_title.set_expand(true);
			column_title.set_sizing(Gtk.TreeViewColumnSizing.GROW_ONLY);
			
			// status column		
			let [column_status, cell_status] = this._addSourcesColumn(this._actor, 
				new Gtk.CellRendererText(), COLUMN_STATUS, _("Status"));

			column_status.add_attribute(cell_status, "text", COLUMN_STATUS);
			column_status.set_sizing(Gtk.TreeViewColumnSizing.AUTOSIZE);

			// disable notifications column
			let [column_notif, cell_notif] = this._addSourcesColumn(this._actor,
				new Gtk.CellRendererToggle({activatable:true, xalign: Gtk.Align.CENTER}), COLUMN_NOTIF, _("No not."));

			column_notif.add_attribute(cell_notif, "active", COLUMN_NOTIF);
			column_notif.set_fixed_width(60);

			cell_notif.connect('toggled', this._gToggleHandler.bind(this, COLUMN_NOTIF,
				cellToggleFunc.bind(this, 'n')));

			// disable updates column
			let [column_upd, cell_upd] = this._addSourcesColumn(this._actor,
				new Gtk.CellRendererToggle({activatable:true, xalign: Gtk.Align.CENTER}), COLUMN_UPD, _("No upd."));

			column_upd.add_attribute(cell_upd, "active", COLUMN_UPD);
			column_upd.set_fixed_width(60);

			cell_upd.connect('toggled', this._gToggleHandler.bind(this, COLUMN_UPD,
				cellToggleFunc.bind(this, 'u')));

			this._actor.connect('row-activated', 
				(self, path, column) =>
				{
					if ( column != column_status )
						return;

					let [res, iter] = this._store.get_iter(path);

					if (!res)
						return;

					let index = path.get_indices();

					if (index > this._fCache)
						return;

					this._validateItemURL(iter, this._fCache[index]);
				});

			cell_url.connect('edited', 
				(self, str_path, text) =>
				{
					if (!text.length)
						return;

					let path = Gtk.TreePath.new_from_string(str_path);

					if (!path)
						return;

					let [res, iter] = this._store.get_iter(path);

					if (!res)
						return;

					let urlValue = this._store.get_value(iter, COLUMN_URL);

					this._aSettings.rename(urlValue, text);

					this._store.set_value(iter, COLUMN_URL, text);
				});

			this._store.connect('row-inserted', 
				(tree, path, iter) =>
				{
					let feeds = Settings.get_strv(GSKeys.RSS_FEEDS_LIST);

					if (feeds == null)
						feeds = new Array();

					let index = path.get_indices();

					if (index > feeds.length)
						return;

					feeds.splice(index, 0, ""); // placeholder
					this._fCache.splice(index, 0, new Object());

					Settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);
				});

			this._store.connect('row-changed', 
				(tree, path, iter) =>
				{
					let feeds = Settings.get_strv(GSKeys.RSS_FEEDS_LIST);

					if (feeds == null)
						feeds = new Array();

					let index = path.get_indices();

					if (index >= feeds.length)
						return;

					let urlValue = this._store.get_value(iter, COLUMN_URL);

					// detect URL column changes
					if (urlValue == feeds[index])
						return;

					feeds[index] = urlValue;

					let cacheObj = this._fCache[index];
					cacheObj.v = urlValue;

					Settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);

					this._validateItemURL(iter, cacheObj);
				});

			this._store.connect('row-deleted', 
				(tree, path) =>
				{
					let feeds = Settings.get_strv(GSKeys.RSS_FEEDS_LIST);
					if (feeds == null)
						feeds = new Array();

					let index = path.get_indices();

					if (index >= feeds.length)
						return;

					let cacheObj = this._fCache[index];
					if (cacheObj.p)
						this._httpSession.cancel_message(cacheObj.p, Soup.Status.CANCELLED);

					feeds.splice(index, 1);
					this._fCache.splice(index, 1);

					Settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);
				});

			scrolledWindow.add(this._actor);
			this.add(scrolledWindow);

			let box_toolbar = new Gtk.Box(
			{
				orientation: Gtk.Orientation.HORIZONTAL
			});

			let toolbar = new Gtk.Toolbar();
			toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_TOOLBAR);

			toolbar.set_icon_size(1);

			let delButton = new Gtk.ToolButton(
			{
				icon_name: 'list-remove-symbolic'
			});
			delButton.connect('clicked', this._deleteSelected.bind(this));
			toolbar.add(delButton);

			let newButton = new Gtk.ToolButton(
			{
				hexpand: true,
				icon_name: 'list-add-symbolic'
			});
			newButton.connect('clicked', this._createNew.bind(this));
			toolbar.add(newButton);

			box_toolbar.add(toolbar);

			let toolbar2 = new Gtk.Toolbar();
			toolbar2.set_icon_size(1);

			let moveUpButton = new Gtk.ToolButton(
			{
				icon_name: 'go-up-symbolic'
			});
			moveUpButton.connect('clicked', this._moveItem.bind(this, true));
			toolbar2.add(moveUpButton);

			let moveDownButton = new Gtk.ToolButton(
			{
				icon_name: 'go-down-symbolic'
			});
			moveDownButton.connect('clicked', this._moveItem.bind(this, false));
			toolbar2.add(moveDownButton);

			box_toolbar.add(toolbar2);
			box_toolbar.get_style_context().add_class(Gtk.STYLE_CLASS_TOOLBAR);

			this.add(box_toolbar);
		}

		_gToggleHandler(cid, callback, self, str_path)
		{
			let path = Gtk.TreePath.new_from_string(str_path);

			if (!path)
				return;

			let [res, iter] = this._store.get_iter(path);

			if (!res)
				return;

			let val = !this._store.get_value(iter, cid);

			this._store.set_value(iter, cid, val);

			if (callback)
				callback(self, path, iter, val);
		}

		/* 
		 * Validates the URL of an item and displays
		 * result in 'Status' column
		 */
		_validateItemURL(iter, cacheObj)
		{
			this._store.set_value(iter, COLUMN_TITLE, "");
			
			let url = this._store.get_value(iter, COLUMN_URL);

			let params = HTTP.getParametersAsJson(url);

			let l2o = url.indexOf('?');
			if (l2o != -1) url = url.substr(0, l2o);

			let request = Soup.form_request_new_from_hash('GET', url, JSON.parse(params));

			if (!request)
			{
				this._store.set_value(iter, COLUMN_STATUS, _("Invalid URL"));
				return null;
			}

			if (cacheObj.p)
				this._httpSession.cancel_message(cacheObj.p, Soup.Status.CANCELLED);

			cacheObj.p = request;

			this._store.set_value(iter, COLUMN_STATUS, _("Checking") + "..");

			this._httpSession.queue_message(request, 
				(session, message) =>
				{
					cacheObj.p = undefined;

					if (message.status_code == Soup.Status.CANCELLED)
						return;

					if (!((message.status_code) >= 200 && (message.status_code) < 300))
					{
						this._store.set_value(iter, COLUMN_STATUS,
							Soup.Status.get_phrase(message.status_code));
						return;
					}

					let parser;

					try
					{
						parser = Parser.createRssParser(message.response_body.data);
					}
					catch (e)
					{
						this._store.set_value(iter, COLUMN_STATUS, e.message);
						Log.Error(e);
						return;
					}

					if (parser == null)
					{
						this._store.set_value(iter, COLUMN_STATUS, _("Unable to parse"));
						return;
					}
					parser.parse();

					this._store.set_value(iter, COLUMN_STATUS, _("OK") + " (" + parser._type + ")");
					this._store.set_value(iter, COLUMN_TITLE, parser.Publisher.Title);
				});

			return request;
		}

		_createControlBase(text)
		{
			let box = new Gtk.Box(
			{
				orientation: Gtk.Orientation.HORIZONTAL,
				spacing: 6
			});
			box.set_margin_bottom(6);
			let label = new Gtk.Label(
			{
				xalign: Gtk.Align.FILL,
				hexpand: true,
				label: text
			});
			box.pack_start(label, true, true, 0);

			return box;
		}
		
		_addSourcesColumn(parent, cell, params, title)
		{
			let column = new Gtk.TreeViewColumn();

			column.pack_start(cell, true);
			
			column.set_resizable(true);
			column.set_title(title);

			parent.append_column(column);
			
			return [column, cell];
		}

		_addSwitch(parent, key, text, callback)
		{
			let box = this._createControlBase(text);

			let sw = new Gtk.Switch(
			{
				active: Settings.get_boolean(key)
			});
			sw.connect('notify::active', (b) =>
			{
				Settings.set_boolean(key, b.active);
				if (callback)
					callback(sw, b.active);
			});

			box.add(sw);
			parent.add(box);

			return box;
		}

		_addSpinButton(parent, key, text, limit)
		{
			let box = this._createControlBase(text);

			let spin = Gtk.SpinButton.new_with_range(1, limit, 1);
			spin.set_value(Settings.get_int(key));
			Settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);

			box.add(spin);

			parent.add(box);

			return box;
		}

		_addSeparator(parent, margin_top, margin_bottom, visible)
		{
			let sep = new Gtk.Separator(
			{
				orientation: Gtk.Orientation.HORIZONTAL,
				visible: (visible != undefined ? visible : true)
			});
			sep.set_margin_top(margin_top);
			sep.set_margin_bottom(margin_bottom);

			parent.add(sep);

			return sep;
		}

		/*
		 *	Creates modal dialog when adding new or editing RSS source
		 *	title - dialog title
		 *	text - text in dialog
		 *	onOkButton - callback on OK button clicked
		 */
		_createDialog(title, text, onOkButton)
		{

			let dialog = new Gtk.Dialog(
			{
				title: title
			});
			dialog.set_modal(true);
			dialog.set_resizable(false);
			dialog.set_border_width(12);

			this._entry = new Gtk.Entry(
			{
				text: text
			});
			this._entry.margin_bottom = 12;
			this._entry.width_chars = 40;

			this._entry.connect("changed", () =>
			{

				if (this._entry.get_text().length === 0)
					this._okButton.sensitive = false;
				else
					this._okButton.sensitive = true;
			});

			dialog.add_button(Gtk.STOCK_CANCEL, 0);
			this._okButton = dialog.add_button(Gtk.STOCK_OK, 1); 
			this._okButton.set_can_default(true);
			this._okButton.sensitive = false;
			dialog.set_default(this._okButton);
			this._entry.activates_default = true;

			let dialog_area = dialog.get_content_area();
			dialog_area.pack_start(this._entry, 0, 0, 0);

			dialog.connect("response", (w, response_id) =>
			{
				if (response_id == 1)
				{
					onOkButton(response_id);
				}

				dialog.hide();
			});

			dialog.show_all();
		}

		/*
		 *	Move selected item on the list
		 */
		_moveItem(direction, self)
		{

			let [any, model, iter] = this._actor.get_selection().get_selected();

			if (!any)
				return;

			let path = model.get_path(iter);

			if (!direction)
				path.next();
			else
				path.prev();

			let [res, iter_step] = model.get_iter(path);

			if (!res)
				return;

			this._store.swap(iter, iter_step);

			let index = model.get_path(iter).get_indices();
			let index_step = model.get_path(iter_step).get_indices();

			let feeds = Settings.get_strv(GSKeys.RSS_FEEDS_LIST);

			if (feeds == null)
				feeds = new Array();

			if (index < feeds.length && index_step < feeds.length)
			{
				feeds[index] = model.get_value(iter, COLUMN_URL);
				feeds[index_step] = model.get_value(iter_step, COLUMN_URL);

				let it = this._fCache[index];
				this._fCache[index] = this._fCache[index_step];
				this._fCache[index_step] = it;

				Settings.set_strv(GSKeys.RSS_FEEDS_LIST, feeds);
			}
		}


		/*
		 *	On create new clicked callback
		 */
		_createNew()
		{
			this._createDialog(_("New RSS Feed source"), '', 
				(id) =>
			{
				let text = this._entry.get_text();

				if (!text.length)
					return;

				// update tree view
				let iter = this._store.append();
				this._store.set_value(iter, COLUMN_URL, text);

				// select and scroll to added entry
				let path = this._store.get_path(iter);
				this._actor.get_selection().select_iter(iter);
				this._actor.scroll_to_cell(path, null, false, 0, 0);
			});
		}

		/*
		 *	On delete clicked callback
		 */
		_deleteSelected()
		{
			let [any, model, iter] = this._actor.get_selection().get_selected();

			if (any)
			{
				// must call before remove
				let index = model.get_path(iter).get_indices();
				// update tree view

				this._aSettings.remove(this._store.get_value(iter, COLUMN_URL));

				this._store.remove(iter);
			}
		}

		/*
		 *	Loads RSS feeds entries from gsettings structure
		 */
		_loadStoreFromSettings()
		{
			let feeds = Settings.get_strv(GSKeys.RSS_FEEDS_LIST);

			if (feeds)
			{
				for (let i = 0; i < feeds.length; i++)
				{
					let iter = this._store.append();
					this._store.set_value(iter, COLUMN_URL, feeds[i]);

					let vset = this._aSettings.get(feeds[i], "n");

					if (vset)
						this._store.set_value(iter, COLUMN_NOTIF, vset);

					vset = this._aSettings.get(feeds[i], "u");

					if (vset)
						this._store.set_value(iter, COLUMN_UPD, vset);

					let cacheObj = this._fCache[i] = new Object();
					cacheObj.v = feeds[i];
					this._validateItemURL(iter, cacheObj);
				}
			}
		}
	}
);

function try_spawn(argv)
{
	var success, pid;

	try
	{
		[success, pid] = GLib.spawn_sync(null, argv, null,
			GLib.SpawnFlags.SEARCH_PATH, null);
	}
	catch (err)
	{
		Log.Error(err);
		return false;
	}

	return success;
}

/*
 *	Initialize the settings widget
 */
function init()
{
	Convenience.initTranslations("rss-feed2");
}

/*
 *	Builds settings widget
 */
function buildPrefsWidget()
{
	let widget = new RssFeedSettingsWidget();
	widget.show_all();
	return widget;
}
