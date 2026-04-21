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
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gio = imports.gi.Gio;
const Soup = imports.gi.Soup;
const St = imports.gi.St;

const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Util = imports.misc.util;
const ScreenShield = imports.ui.screenShield;
const ExtensionSystem = imports.ui.extensionSystem;

const Mainloop = imports.mainloop;

const Me = imports.misc.extensionUtils.getCurrentExtension();

const Convenience = Me.imports.convenience;
const Parser = Me.imports.parsers.factory;
const Log = Me.imports.logger;
const Settings = Convenience.getSettings();
const AssocSettings = Me.imports.gsaa;

const Gettext = imports.gettext.domain('rss-feed2');
const _ = Gettext.gettext;

const MessageTray = imports.ui.messageTray;

const Misc = Me.imports.misc;
const Clutter = imports.gi.Clutter;

const Encoder = Me.imports.encoder.getInstance();
const HTTP = Me.imports.http;

const ExtensionGui =
{
	RssPopupMenuItem : Me.imports.extensiongui.rsspopupmenuitem.RssPopupMenuItem,
	RssPopupSubMenuMenuItem : Me.imports.extensiongui.rsspopupsubmenumenuitem.RssPopupSubMenuMenuItem,
	RssPopupMenuSection : Me.imports.extensiongui.rsspopupmenusection.RssPopupMenuSection
};

const GSKeys = Me.imports.gskeys;

const NOTIFICATION_ICON = 'application-rss+xml';

let _preserveOnLock = false;

/*
 * Main RSS Feed 2 extension class
 */

const RssFeed2 = GObject.registerClass(
	class RssFeed2 extends PanelMenu.Button
	{

		/*
		 * Initialize instance of RssFeed class
		 */
		_init()
		{
			super._init(0.0, "RSS Feed 2");

			this._httpSession = new Soup.SessionAsync(
			{
				timeout : 60
			});

			// Lours974 Vitry David
			// This makes the session work under a proxy. The funky syntax here
			// is required because of another libsoup quirk, where there's a gobject
			// property called 'add-feature', designed as a construct property for
			// C convenience.
			Soup.Session.prototype.add_feature.call(this._httpSession,
				new Soup.ProxyResolverDefault());

			this._aSettings = new AssocSettings.GSAA(GSKeys.RSS_FEEDS_SETTINGS);
			this._aSettings.set_autoload(false);

			this._startIndex = 0;
			this._feedsCache = new Array();
			this._feedTimers = new Array();
			this._notifCache = new Array();

			this._totalUnreadCount = 0;
			this._notifLimit = 10;

			this._miStPadding = Array(158).join(" ");

			// top panel button
			let button = new St.BoxLayout(
			{
				vertical : false,
				style_class : 'panel-status-menu-box'
			});

			this._iconLabel = new St.Label(
			{
				text : '',
				y_expand : true,
				y_align : Clutter.ActorAlign.START,
				style_class : 'rss-icon-label'
			});

			let icon = new St.Icon(
			{
				icon_name : 'application-rss+xml-symbolic',
				style_class : 'system-status-icon'
			});

			button.add_child(icon);
			button.add_child(this._iconLabel);

			this.actor.add_actor(button);

			this.menu.actor.add_style_class_name('rss-menu');

			let seenOnClose = Settings.get_boolean(GSKeys.SET_SEEN_WHEN_CLOSED);

			this.menu.connect('open-state-changed', (self, open) =>
			{
				if (open && this._lastOpen)
				{
					Log.Debug("opening")
					this._lastOpen.open();
				}

				if (open == false && seenOnClose == true)
				{
					this._setAllFeedsAsSeen();
					this._totalUnreadCount = 0;
					this._updateUnreadCountLabel(0);

				}
			});

			let separator = new PopupMenu.PopupSeparatorMenuItem();

			let mbAlignTop = Settings.get_boolean(GSKeys.MB_ALIGN_TOP);

			if (mbAlignTop)
			{
				this._createMainPanelButtons();
				
				this.menu.addMenuItem(separator);
			}

			this._pMaxMenuHeight = Settings.get_int(GSKeys.MAX_HEIGHT);

			this._feedsSection = new ExtensionGui.RssPopupMenuSection("max-height: " + this._pMaxMenuHeight + "px;");

			this.menu.addMenuItem(this._feedsSection);

			if (!mbAlignTop)
			{
				this.menu.addMenuItem(separator);
				this._createMainPanelButtons();
			}
		}

		_createMainPanelButtons ()
		{
			let systemMenu = Main.panel.statusArea.aggregateMenu._system;

			this._buttonMenu = new PopupMenu.PopupBaseMenuItem(
			{
				reactive : false
			});

			this._lastUpdateTime = new St.Label(
			{
				text : "",
				style_class : 'rss-status-label'
			});

			if (Settings.get_boolean(GSKeys.ENABLE_DEBUG))
			{
				let reloadPluginBtn = systemMenu._createActionButton('system-shutdown-symbolic',
					_("Reload Plugin"));
				this._buttonMenu.actor.add_actor(reloadPluginBtn);
				reloadPluginBtn.connect('clicked', () =>
				{
					if (this._reloadTimeout || Misc.isScreenLocked())
						return;

					this._reloadTimeout = Mainloop.timeout_add(0, function()
					{
						ExtensionSystem.reloadExtension(Me);
					});
				});

			}

			this._buttonMenu.actor.add_actor(this._lastUpdateTime);
			this._buttonMenu.actor.set_x_align(Clutter.ActorAlign.CENTER);

			this._lastUpdateTime.set_y_align(Clutter.ActorAlign.CENTER);

			let reloadBtn = systemMenu._createActionButton('view-refresh-symbolic',
				_("Reload RSS Feeds"));
			let settingsBtn = systemMenu._createActionButton('emblem-system-symbolic',
				_("RSS Feed Settings"));

			this._buttonMenu.actor.add_actor(reloadBtn);
			this._buttonMenu.actor.add_actor(settingsBtn);

			reloadBtn.connect('clicked', this._pollFeeds.bind(this));
			settingsBtn.connect('clicked', this._onSettingsBtnClicked.bind(this));
			this.menu.addMenuItem(this._buttonMenu);

		}

		/*
		 * Free resources
		 */
		destroy ()
		{
			this._isDiscarded = true;

			if (this._httpSession)
				this._httpSession.abort();

			this._httpSession = undefined;

			if (this._scid)
				Settings.disconnect(this._scid);

			if (this._timeout)
				Mainloop.source_remove(this._timeout);

			if (this._settingsCWId)
				Mainloop.source_remove(this._settingsCWId);

			for ( let t in this._feedTimers)
				Mainloop.source_remove(t);

			if (Settings.get_boolean(GSKeys.CLEANUP_NOTIFICATIONS))
			{
				let notifCache = this._notifCache;

				while (notifCache.length > 0)
					notifCache.shift().destroy();
			}

			this._aSettings.destroy();

			super.destroy();
		}



		_setAllFeedsAsSeen()
		{
			for (let i = 0; i < this._rssFeedsSources.length; i++)
			{
				let url = this._rssFeedsSources[i];

				let feedCache = this._feedsCache[url];

				if (!feedCache)
					continue;

				feedCache.UnreadCount = 0;

				for (let j = 0; j < feedCache.Items.length; j++)
				{
					let link = feedCache.Items[j];
					feedCache.Items[link].Menu.setOrnament(PopupMenu.Ornament.NONE);
					//Log.Debug(Object.keys(feedCache.Items[link]));
					feedCache.Items[link].Unread = null;

				}
				
				//Log.Debug(Object.keys(feedCache));

				feedCache.Menu.label.text = feedCache.Menu._olabeltext;

				feedCache.Menu.setOrnament(PopupMenu.Ornament.NONE);

				this._feedsCache[url] = feedCache;
			}

			return;
		}

		_updateUnreadCountLabel(count)
		{
			var text = !count ? '' : count.toString();

			if (text != this._iconLabel.get_text())
				this._iconLabel.set_text(text);
		}

		_generatePopupMenuCSS(value)
		{
			return "max-height: " + value + "px;";
		}

		/*
		 * Get variables from GSettings
		 */
		_getSettings()
		{
			this._updateInterval = Settings.get_int(GSKeys.UPDATE_INTERVAL);
			this._itemsVisible = Settings.get_int(GSKeys.ITEMS_VISIBLE);
			this._rssFeedsSources = Settings.get_strv(GSKeys.RSS_FEEDS_LIST);
			this._rssPollDelay = Settings.get_int(GSKeys.POLL_DELAY);
			this._enableNotifications = Settings.get_boolean(GSKeys.ENABLE_NOTIFICATIONS);
			this._maxMenuHeight = Settings.get_int(GSKeys.MAX_HEIGHT);
			this._feedsSection._animate = Settings.get_boolean(GSKeys.ENABLE_ANIMATIONS);
			this._notifLimit = Settings.get_int(GSKeys.MAX_NOTIFICATIONS);
			this._detectUpdates = Settings.get_boolean(GSKeys.DETECT_UPDATES);
			this._notifOnLockScreen = Settings.get_boolean(GSKeys.NOTIFICATIONS_ON_LOCKSCREEN);
			this._http_keepalive = Settings.get_boolean(GSKeys.HTTP_KEEPALIVE);
			this._setSeenOnClose = Settings.get_boolean(GSKeys.SET_SEEN_WHEN_CLOSED);

			this._aSettings.load();

			_preserveOnLock = Settings.get_boolean(GSKeys.PRESERVE_ON_LOCK);
		}

		/*
		 * On settings button clicked callback
		 */
		_onSettingsBtnClicked()
		{
			if (Misc.isScreenLocked())
				return;

			var success, pid;
			try
			{
				[
					success, pid
				] = GLib.spawn_async(null,
				[
					"gnome-shell-extension-prefs", Me.uuid
				], null, GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
			}
			catch (err)
			{
				return;
			}

			if (!success)
				return;

			this.menu.close();

			this._settingsCWId = GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid,
				(pid, status) =>
				{
					this._settingsCWId = undefined;
					GLib.spawn_close_pid(pid);
					this._pollFeeds();
				});
		}

		_purgeSource (key)
		{
			let feedCache = this._feedsCache[key];

			if (!feedCache)
				return;

			this._totalUnreadCount -= feedCache.UnreadCount;
			this._updateUnreadCountLabel(this._totalUnreadCount);

			if (feedCache.Menu)
				feedCache.Menu.destroy();

			delete this._feedsCache[key];
			this._feedsCache[key] = undefined;
		}

		_restartExtension ()
		{
			if (!this._reloadTimer)
			{
				this._reloadTimer = Mainloop.timeout_add(0, function()
				{
					extension_disable();
					enable();
				});
			}
		}

		/*
		 * Scheduled reload of RSS feeds from sources set in settings
		 */
		_pollFeeds ()
		{
			this._getSettings();

			if (this._maxMenuHeight != this._pMaxMenuHeight)
				this._feedsSection.actor.set_style(this._generatePopupMenuCSS(this._maxMenuHeight));

			this._pMaxMenuHeight = this._maxMenuHeight;

			Log.Debug("Reload RSS Feeds");

			if (this._feedTimers.length)
			{
				for ( let t in this._feedTimers)
					Mainloop.source_remove(t);

				this._feedTimers = new Array();
			}

			// remove timeout
			if (this._timeout)
				Mainloop.source_remove(this._timeout);

			if (this._rssFeedsSources)
			{
				/* clear feed list if necessary */
				if ((this._pItemsVisible && this._itemsVisible > this._pItemsVisible))
				{
					this._feedsSection.removeAll();
					delete this._feedsCache;
					this._feedsCache = new Array();

					this._totalUnreadCount = 0;
					this._updateUnreadCountLabel(0);
				}

				this._pItemsVisible = this._itemsVisible;

				/* cleanup after removed sources */

				for ( var key in this._feedsCache)
				{
					let h = false;

					for (let j = 0; j < this._rssFeedsSources.length; j++)
					{
						let url = this._rssFeedsSources[j];

						if (key == url)
						{
							h = true;
							break;
						}
					}

					if (!h)
						this._purgeSource(key);
				}

				for (let i = 0; i < this._rssFeedsSources.length; i++)
				{
					let url = this._rssFeedsSources[i];
					let sourceURL = url;

					if (!url.length)
						continue;

					let jsonObj = HTTP.getParametersAsJson(url);

					let l2o = url.indexOf('?');
					if (l2o != -1)
						url = url.substr(0, l2o);

					let sourceID = Mainloop.timeout_add(i * this._rssPollDelay,
						() =>
						{
							this._httpGetRequestAsync(url, JSON.parse(jsonObj), sourceURL,
								this._onDownload.bind(this));
							delete this._feedTimers[sourceID];
						});

					this._feedTimers[sourceID] = true;
				}
			}

			// set timeout if enabled
			if (this._updateInterval > 0)
			{
				Log.Debug("Next scheduled reload after " + this._updateInterval * 60 + " seconds");
				this._timeout = Mainloop.timeout_add_seconds(this._updateInterval * 60,
					() =>
					{
						this._timeout = undefined;
						this._pollFeeds();
					});
			}
		}

		/*
		 * Creates asynchronous HTTP GET request through Soup interface url - HTTP
		 * request URL without parameters params - JSON object of HTTP GET request
		 * sourceURL - original URL used as cache key
		 * HTTP GET request response
		 */
		_httpGetRequestAsync (url, params, sourceURL, callback)
		{
			let request = Soup.form_request_new_from_hash('GET', url, params);

			if (!request)
			{
				Log.Debug("Soup.form_request_new_from_hash returned 'null' for URL '" + url + "'");
				return;
			}

			if (!this._http_keepalive)
				request.request_headers.replace("Connection", "close");

			this._httpSession.queue_message(request, function(httpSession, message)
			{
				let status_phrase = Soup.Status.get_phrase(message.status_code);

				if (!((message.status_code) >= 200 && (message.status_code) < 300))
				{
					Log.Debug("HTTP GET " + sourceURL + ": " + message.status_code + " "
						+ status_phrase);
					return;
				}

				Log.Debug("HTTP GET " + sourceURL + ": " + message.status_code + " "
					+ status_phrase + " Content-Type: "
					+ message.response_headers.get_one("Content-Type"));

				if (message.response_body.data)
					callback(message.response_body.data, sourceURL);
			});
		}

		/*
		 * On HTTP request response download callback responseData - response data
		 * sourceURL - original URL used as cache key
		 */
		_onDownload (responseData, sourceURL)
		{

			let rssParser = Parser.createRssParser(responseData);



			if (rssParser == null)
			{
				this._purgeSource(sourceURL);
				return;
			}

			rssParser.parse();

			let nItems = rssParser.Items.length > this._itemsVisible ? this._itemsVisible
				: rssParser.Items.length;

			if (!nItems)
				return;

			let feedCache;

			if (!this._feedsCache[sourceURL])
			{
				// initialize the publisher cache
				feedCache = this._feedsCache[sourceURL] = new Object();
				feedCache.Items = new Array();
				feedCache.UnreadCount = 0;
				feedCache.pUnreadCount = 0;
				feedCache.parentClass = this;
			}
			else
				feedCache = this._feedsCache[sourceURL];

			let itemCache = feedCache.Items;
			let subMenu;

			// create publisher submenu
			if (!feedCache.Menu)
			{
				subMenu = new ExtensionGui.RssPopupSubMenuMenuItem(rssParser.Publisher, nItems);
				this._feedsSection.addMenuItem(subMenu);

				subMenu.menu.connect('open-state-changed', (self, open) =>
				{
					if (open)
						this._lastOpen = self;
					else if (this.menu.isOpen && this._lastOpen == self)
						this._lastOpen = undefined;
				});

				subMenu.menu.connect('destroy', (self, open) =>
				{
					if (this._lastOpen == self)
						this._lastOpen = undefined;
				});

				feedCache.Menu = subMenu;
			}
			else
				subMenu = feedCache.Menu;

			let gsData = this._aSettings._gsData[sourceURL];
			let muteNotifications;
			let disableUpdates;

			if (gsData)
			{
				muteNotifications = gsData['n'];
				disableUpdates = gsData['u'];
			}

			/*
			 * Cleanup article list of this source
			 */
			let i = itemCache.length;

			while (i--)
			{
				let cacheID = itemCache[i];
				let cacheObj = itemCache[cacheID];
				let j = nItems;
				let h;

				while (j--)
				{
					let item = rssParser.Items[j];

					if (cacheID == item.ID)
					{
						if (this._detectUpdates
							&& !disableUpdates
							&& (cacheObj.Item.PublishDate != item.PublishDate || cacheObj.Item.UpdateTime != item.UpdateTime))
						{
							item._update = true;
						}
						else
						{
							rssParser.Items.splice(j, 1);
							nItems--;
							h = true;
						}

						break;
					}
				}
				if (!h)
				{
					cacheObj.Menu.destroy();

					if (cacheObj.Unread)
					{
						cacheObj.Unread = null;
						feedCache.UnreadCount--;
						this._totalUnreadCount--;
					}

					delete itemCache[cacheID];
					itemCache[cacheID] = undefined;
					itemCache.splice(i, 1);
				}
			}

			/* Insert articles into the list  */

			i = nItems;

			while (i--)
			{
				let item = rssParser.Items[i];
				let itemURL = item.HttpLink;
				let itemID = item.ID;

				if (itemCache[itemID])
					continue;

				/* remove HTML tags */
				item.Title = Encoder.htmlDecode(item.Title).replace(/<.*?>/g, "").trim();

				/* create the menu item in publisher submenu */
				let menu = new ExtensionGui.RssPopupMenuItem(item);
				subMenu.menu.addMenuItem(menu, 0);

				/* enter it into cache */
				let cacheObj = new Object();
				cacheObj.Menu = menu;
				cacheObj.Item = item;
				cacheObj.parent = feedCache;
				cacheObj.lText = menu.label.get_text();
				itemCache[itemID] = cacheObj;
				itemCache.push(itemID);

				menu._cacheObj = cacheObj;

				/* decode description, if present */
				if (item.Description.length > 0)
				{
					let itemDescription = Encoder.htmlDecode(item.Description).replace("<![CDATA[",
						"").replace("]]>", "").replace(/<.*?>/g, "").trim();

					if (itemDescription.length > 0)
					{
						/* word-break it for in-menu descriptions */
						cacheObj._bItemDescription = Misc.lineBreak(itemDescription, 80, 90, "  ");

						/* trim the description shown in notifications */
						if (itemDescription.length > 290)
							itemDescription = itemDescription.substr(0, 290) + "...";

						cacheObj._itemDescription = itemDescription;

						/*
						 *  show description inside the article label, when selected
						 *
						 *  FIXME:
						 *  This is not an ideal solution, it should be replaced with
						 *  a free-floating (not bound to the menu) tooltip or similar.
						 */
						menu.connect('active-changed', (self, over) =>
						{
							if (!Settings.get_boolean(GSKeys.ENABLE_DESC))
								return;

							let label_actor = self.actor.label_actor;

							if (over)
							{
								label_actor._originalHeight = label_actor.get_height();

								label_actor.set_text(self._cacheObj.lText + "\n  "
									+ this._miStPadding + "\n" + self._cacheObj._bItemDescription);

								label_actor.set_height(120);
							}
							else
							{
								label_actor.set_text(self._cacheObj.lText);
								label_actor.set_height(label_actor._originalHeight);
							}
						});
					}
				}

				/* do not notify or flag if this is the first query */
				if (!feedCache._initialRefresh)
					continue;

				/* increment unread counts and flag item as unread */
				feedCache.UnreadCount++;
				this._totalUnreadCount++;


				//Log.Debug('--------------')
				//Log.Debug(feedCache.UnreadCount);
				//Log.Debug(feedCache.pUnreadCount);
				//Log.Debug(this._totalUnreadCount);

				cacheObj.Unread = true
				menu.setOrnament(PopupMenu.Ornament.DOT);


				/* trigger notification, if requested */
				if (this._enableNotifications && !muteNotifications)
				{
					let itemTitle = item.Title;

					cacheObj.Notification = this._dispatchNotification(item._update ? (_("UPDATE")
						+ ': ' + item.Title) : itemTitle, _("Source")
						+ ': '
						+ Encoder.htmlDecode(rssParser.Publisher.Title)
						+ (item.Author.length ? ', ' + _("Author") + ': '
							+ Encoder.htmlDecode(item.Author) : '') + '\n\n'
						+ (cacheObj._itemDescription ? cacheObj._itemDescription : itemTitle),
						itemURL, cacheObj);
				}
			}

			if (!feedCache._initialRefresh)
				feedCache._initialRefresh = true;
			else
			{
				
				if (feedCache.UnreadCount)
				{
					if (feedCache.UnreadCount != feedCache.pUnreadCount)
						subMenu.label.set_text(Misc.clampTitle(subMenu._olabeltext + ' ('
							+ feedCache.UnreadCount + ')'));

					feedCache.pUnreadCount = feedCache.UnreadCount;
					this._updateUnreadCountLabel(this._totalUnreadCount);
					
					subMenu.setOrnament(PopupMenu.Ornament.DOT);


				
				}
			}

			// update last download time
			this._lastUpdateTime
				.set_text(_("Last update") + ': ' + new Date().toLocaleTimeString());

		}

		_dispatchNotification (title, message, url, cacheObj)
		{
			/*
			 * Since per-source notification limit cannot be set, we create a new
			 * source each time.
			 */
			let Source = new MessageTray.SystemNotificationSource();
			Source.createIcon = function()
			{
				return new St.Icon(
				{
					icon_name : NOTIFICATION_ICON
				});
			};

			let sourcePolicy = Source.policy;

			/*
			 * Configure source policy, implicitly show details if lockscreen
			 * notifications are enabled
			 */
			sourcePolicy._detailsInLockScreen =
				sourcePolicy._showInLockScreen = this._notifOnLockScreen;

			Main.messageTray.add(Source);

			let notification = new MessageTray.Notification(Source, title, message);
			notification.setPrivacyScope(MessageTray.PrivacyScope.SYSTEM);

			let notifCache = this._notifCache;

			/* remove notifications with same ID */
			let i = notifCache.length;
			while (i--)
			{
				let nCacheObj = notifCache[i];
				if (nCacheObj._cacheObj.Item.ID == cacheObj.Item.ID)
				{
					nCacheObj.destroy();
					notifCache.splice(i, 1);
					break;
				}
			}

			notification._itemURL = url;
			notification._cacheObj = cacheObj;

			notification.addAction(_('Open URL'), function()
			{
				Misc.processLinkOpen(notification._itemURL, notification._cacheObj);
				notification.destroy();
			});

			notification.addAction(_('Copy URL'), function()
			{
				St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD,
					notification._itemURL);

				/* don't destroy notification, just hide the banner */
				if (Main.messageTray._banner)
					Main.messageTray._banner.emit('done-displaying');
			});

			notification.connect('activated', function(self)
			{
				Misc.processLinkOpen(self._itemURL, self._cacheObj);
				self.destroy();
			});

			notification.setResident(true);


			/*
			 * Destroy the source after notification is gone
			 */
			notification.connect('destroy', function(self)
			{
				self.source.destroy();
			});

			notification.setTransient(false);
			notification.setUrgency(MessageTray.Urgency.HIGH);

			notifCache.push(notification);

			/* remove excess notifications */
			while (notifCache.length > this._notifLimit)
				notifCache.shift().destroy();

			Source.notify(notification);

			return notification;
		}
	}
);

/*
 * Extension widget instance
 */
let rssFeed;

/*
 * Initialize the extension
 */
function init()
{
	Convenience.initTranslations("rss-feed2");

	// hack for dconf
	Settings.set_boolean(GSKeys.ENABLE_DEBUG, Settings.get_boolean(GSKeys.ENABLE_DEBUG));
	Settings.set_boolean(GSKeys.HTTP_KEEPALIVE, Settings.get_boolean(GSKeys.HTTP_KEEPALIVE));

	Log.Debug("Extension initialized.");
}

/*
 * Enable the extension
 */
function enable()
{
	if (rssFeed)
	{
		Log.Debug("Extension already enabled!");
		return;
	}

	rssFeed = new RssFeed2();

	/* trigger initial poll */
	rssFeed._pollFeeds();

	/* add plugin menu to status area */
	Main.panel.addToStatusArea('rssFeed2Menu', rssFeed, 0, 'right');

	Log.Debug("Extension enabled.");
}

function extension_disable()
{
	if (!rssFeed)
	{
		Log.Debug("Extension already disabled!");
		return;
	}

	rssFeed.destroy();
	rssFeed = undefined;

	Log.Debug("Extension disabled.");
}

/*
 * Disable the extension
 */
function disable()
{
	_preserveOnLock = Settings.get_boolean(GSKeys.PRESERVE_ON_LOCK);

	if (_preserveOnLock && Misc.isScreenLocked())
	{
		Log.Debug("Not disabling extension while screen inactive.");
		return;
	}

	extension_disable();
}
