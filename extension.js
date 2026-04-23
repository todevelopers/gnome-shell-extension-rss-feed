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

import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Soup from 'gi://Soup';
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import * as GSKeys from './gskeys.js';
import { GSAA } from './gsaa.js';
import { getInstance } from './encoder.js';
import * as HTTP from './http.js';
import * as Misc from './misc.js';
import { createRssParser } from './parsers/factory.js';
import { RssPopupMenuItem } from './extensiongui/rsspopupmenuitem.js';
import { RssPopupSubMenuMenuItem } from './extensiongui/rsspopupsubmenumenuitem.js';
import { RssPopupMenuSection } from './extensiongui/rsspopupmenusection.js';

const Encoder = getInstance();
const NOTIFICATION_ICON = 'application-rss+xml';

function _actionButton(iconName, accessibleName, onClicked)
{
	const btn = new St.Button(
	{
		style_class : 'rss-action-button',
		can_focus : true,
		x_expand : false,
		accessible_name : accessibleName,
		child : new St.Icon(
		{
			icon_name : iconName,
			style_class : 'popup-menu-icon',
		}),
	});
	btn.connect('clicked', onClicked);
	return btn;
}

const RssFeed2 = GObject.registerClass(
	class RssFeed2 extends PanelMenu.Button
	{
		_init(settings, extension)
		{
			super._init(0.0, "RSS Feed 2");

			this._settings = settings;
			this._extension = extension;

			this._httpSession = new Soup.Session({ timeout : 60 });
			this._cancellable = new Gio.Cancellable();

			this._aSettings = new GSAA(settings, GSKeys.RSS_FEEDS_SETTINGS);
			this._aSettings.set_autoload(false);

			this._scid = settings.connect('changed::' + GSKeys.RSS_FEEDS_LIST, () =>
			{
				this._pollFeeds();
			});

			this._startIndex = 0;
			this._feedsCache = new Array();
			this._feedTimers = new Array();
			this._notifCache = new Array();

			this._totalUnreadCount = 0;
			this._notifLimit = 10;

			this._miStPadding = Array(158).join(" ");

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

			this.add_child(button);

			this.menu.actor.add_style_class_name('rss-menu');

			let seenOnClose = settings.get_boolean(GSKeys.SET_SEEN_WHEN_CLOSED);

			this.menu.connect('open-state-changed', (self, open) =>
			{
				if (open && this._lastOpen)
				{
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

			let mbAlignTop = settings.get_boolean(GSKeys.MB_ALIGN_TOP);

			if (mbAlignTop)
			{
				this._createMainPanelButtons();
				this.menu.addMenuItem(separator);
			}

			this._pMaxMenuHeight = settings.get_int(GSKeys.MAX_HEIGHT);

			this._feedsSection = new RssPopupMenuSection("max-height: " + this._pMaxMenuHeight + "px;");

			this.menu.addMenuItem(this._feedsSection);

			if (!mbAlignTop)
			{
				this.menu.addMenuItem(separator);
				this._createMainPanelButtons();
			}
		}

		_createMainPanelButtons()
		{
			this._buttonMenu = new PopupMenu.PopupBaseMenuItem({ reactive : false });

			this._lastUpdateTime = new St.Label(
			{
				text : "",
				style_class : 'rss-status-label'
			});

			this._buttonMenu.add_child(this._lastUpdateTime);
			this._buttonMenu.actor.set_x_align(Clutter.ActorAlign.CENTER);

			this._lastUpdateTime.set_y_align(Clutter.ActorAlign.CENTER);

			let reloadBtn = _actionButton('view-refresh-symbolic', "Reload RSS Feeds",
				this._pollFeeds.bind(this));
			let settingsBtn = _actionButton('emblem-system-symbolic', "RSS Feed Settings",
				this._onSettingsBtnClicked.bind(this));

			this._buttonMenu.add_child(reloadBtn);
			this._buttonMenu.add_child(settingsBtn);

			this.menu.addMenuItem(this._buttonMenu);
		}

		destroy()
		{
			this._isDiscarded = true;

			this._cancellable.cancel();

			if (this._scid)
				this._settings.disconnect(this._scid);

			if (this._timeout)
				GLib.source_remove(this._timeout);

			if (this._settingsCWId)
				GLib.source_remove(this._settingsCWId);

			for (let t in this._feedTimers)
				GLib.source_remove(t);

			if (this._settings.get_boolean(GSKeys.CLEANUP_NOTIFICATIONS))
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
					feedCache.Items[link].Unread = null;
				}

				feedCache.Menu.label.text = feedCache.Menu._olabeltext;
				feedCache.Menu.setOrnament(PopupMenu.Ornament.NONE);
				this._feedsCache[url] = feedCache;
			}
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

		_getSettings()
		{
			this._updateInterval = this._settings.get_int(GSKeys.UPDATE_INTERVAL);
			this._itemsVisible = this._settings.get_int(GSKeys.ITEMS_VISIBLE);
			this._rssFeedsSources = this._settings.get_strv(GSKeys.RSS_FEEDS_LIST);
			this._rssPollDelay = this._settings.get_int(GSKeys.POLL_DELAY);
			this._enableNotifications = this._settings.get_boolean(GSKeys.ENABLE_NOTIFICATIONS);
			this._maxMenuHeight = this._settings.get_int(GSKeys.MAX_HEIGHT);
			this._feedsSection._animate = this._settings.get_boolean(GSKeys.ENABLE_ANIMATIONS);
			this._notifLimit = this._settings.get_int(GSKeys.MAX_NOTIFICATIONS);
			this._detectUpdates = this._settings.get_boolean(GSKeys.DETECT_UPDATES);
			this._notifOnLockScreen = this._settings.get_boolean(GSKeys.NOTIFICATIONS_ON_LOCKSCREEN);
			this._http_keepalive = this._settings.get_boolean(GSKeys.HTTP_KEEPALIVE);
			this._setSeenOnClose = this._settings.get_boolean(GSKeys.SET_SEEN_WHEN_CLOSED);

			this._aSettings.load();
		}

		_onSettingsBtnClicked()
		{
			if (Misc.isScreenLocked())
				return;

			this.menu.close();
			this._extension.openPreferences();
		}

		_purgeSource(key)
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

		_pollFeeds()
		{
			this._getSettings();

			if (this._maxMenuHeight != this._pMaxMenuHeight)
				this._feedsSection.actor.set_style(this._generatePopupMenuCSS(this._maxMenuHeight));

			this._pMaxMenuHeight = this._maxMenuHeight;

			console.debug("rss-feed: Reload RSS Feeds");

			if (this._feedTimers.length)
			{
				for (let t in this._feedTimers)
					GLib.source_remove(t);

				this._feedTimers = new Array();
			}

			if (this._timeout)
				GLib.source_remove(this._timeout);

			if (this._rssFeedsSources)
			{
				if ((this._pItemsVisible && this._itemsVisible > this._pItemsVisible))
				{
					this._feedsSection.removeAll();
					delete this._feedsCache;
					this._feedsCache = new Array();

					this._totalUnreadCount = 0;
					this._updateUnreadCountLabel(0);
				}

				this._pItemsVisible = this._itemsVisible;

				for (var key in this._feedsCache)
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

					let finalUrl = HTTP.buildUrl(url, jsonObj);

					let sourceID = GLib.timeout_add(GLib.PRIORITY_DEFAULT,
						i * this._rssPollDelay,
						() =>
						{
							this._httpGetRequestAsync(finalUrl, sourceURL,
								this._onDownload.bind(this));
							delete this._feedTimers[sourceID];
							return GLib.SOURCE_REMOVE;
						});

					this._feedTimers[sourceID] = true;
				}
			}

			if (this._updateInterval > 0)
			{
				console.debug("rss-feed: Next scheduled reload after " + this._updateInterval * 60 + " seconds");
				this._timeout = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT,
					this._updateInterval * 60,
					() =>
					{
						this._timeout = undefined;
						this._pollFeeds();
						return GLib.SOURCE_REMOVE;
					});
			}
		}

		_httpGetRequestAsync(url, sourceURL, callback)
		{
			let message = Soup.Message.new('GET', url);

			if (!message)
			{
				console.debug("rss-feed: Soup.Message.new returned null for URL '" + url + "'");
				return;
			}

			if (!this._http_keepalive)
				message.get_request_headers().replace("Connection", "close");

			let cancellable = this._cancellable;

			this._httpSession.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable,
				(session, result) =>
				{
					let bytes;
					try
					{
						bytes = session.send_and_read_finish(result);
					}
					catch (e)
					{
						if (e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
							return;
						console.error("rss-feed: HTTP GET " + sourceURL + ": " + e);
						return;
					}

					let status = message.get_status();
					let statusPhrase = Soup.Status.get_phrase(status);

					if (!(status >= 200 && status < 300))
					{
						console.debug("rss-feed: HTTP GET " + sourceURL + ": " + status + " " + statusPhrase);
						return;
					}

					console.debug("rss-feed: HTTP GET " + sourceURL + ": " + status + " " + statusPhrase);

					if (bytes)
					{
						let data = new TextDecoder().decode(bytes.toArray());
						if (data)
							callback(data, sourceURL);
					}
				});
		}

		_onDownload(responseData, sourceURL)
		{
			let rssParser = createRssParser(responseData);

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

			if (!feedCache.Menu)
			{
				subMenu = new RssPopupSubMenuMenuItem(rssParser.Publisher, nItems);
				this._feedsSection.addMenuItem(subMenu);

				subMenu.menu.connect('open-state-changed', (self, open) =>
				{
					if (open)
						this._lastOpen = self;
					else if (this.menu.isOpen && this._lastOpen == self)
						this._lastOpen = undefined;
				});

				subMenu.menu.connect('destroy', (self, _open) =>
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

			i = nItems;

			while (i--)
			{
				let item = rssParser.Items[i];
				let itemURL = item.HttpLink;
				let itemID = item.ID;

				if (itemCache[itemID])
					continue;

				item.Title = Encoder.htmlDecode(item.Title).replace(/<.*?>/g, "").trim();

				let menu = new RssPopupMenuItem(item);
				subMenu.menu.addMenuItem(menu, 0);

				let cacheObj = new Object();
				cacheObj.Menu = menu;
				cacheObj.Item = item;
				cacheObj.parent = feedCache;
				cacheObj.lText = menu.label.get_text();
				itemCache[itemID] = cacheObj;
				itemCache.push(itemID);

				menu._cacheObj = cacheObj;

				if (item.Description.length > 0)
				{
					let itemDescription = Encoder.htmlDecode(item.Description).replace("<![CDATA[",
						"").replace("]]>", "").replace(/<.*?>/g, "").trim();

					if (itemDescription.length > 0)
					{
						cacheObj._bItemDescription = Misc.lineBreak(itemDescription, 80, 90, "  ");

						if (itemDescription.length > 290)
							itemDescription = itemDescription.substr(0, 290) + "...";

						cacheObj._itemDescription = itemDescription;

						menu.connect('active-changed', (self, over) =>
						{
							if (!this._settings.get_boolean(GSKeys.ENABLE_DESC))
								return;

							let label_actor = self.label;

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

				if (!feedCache._initialRefresh)
					continue;

				feedCache.UnreadCount++;
				this._totalUnreadCount++;

				cacheObj.Unread = true;
				menu.setOrnament(PopupMenu.Ornament.DOT);

				if (this._enableNotifications && !muteNotifications)
				{
					let itemTitle = item.Title;

					cacheObj.Notification = this._dispatchNotification(item._update ? ("UPDATE"
						+ ': ' + item.Title) : itemTitle, "Source"
						+ ': '
						+ Encoder.htmlDecode(rssParser.Publisher.Title)
						+ (item.Author.length ? ', ' + "Author" + ': '
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

			this._lastUpdateTime.set_text("Last update" + ': ' + new Date().toLocaleTimeString());
		}

		_dispatchNotification(title, message, url, cacheObj)
		{
			if (Misc.isScreenLocked() && !this._notifOnLockScreen)
				return null;

			let source = new MessageTray.Source(
			{
				title : 'RSS Feed',
				icon : new Gio.ThemedIcon({ name : NOTIFICATION_ICON }),
			});

			Main.messageTray.add(source);

			let notification = new MessageTray.Notification(
			{
				source,
				title,
				body : message,
				iconName : NOTIFICATION_ICON,
				resident : true,
				isTransient : false,
				urgency : MessageTray.Urgency.HIGH,
			});

			let notifCache = this._notifCache;

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

			notification.addAction('Open URL', () =>
			{
				Misc.processLinkOpen(notification._itemURL, notification._cacheObj);
				notification.destroy();
			});

			notification.addAction('Copy URL', () =>
			{
				St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD,
					notification._itemURL);

				if (Main.messageTray._banner)
					Main.messageTray._banner.emit('done-displaying');
			});

			notification.connect('activated', (self) =>
			{
				Misc.processLinkOpen(self._itemURL, self._cacheObj);
				self.destroy();
			});

			notification.connect('destroy', (self) =>
			{
				self.source.destroy();
			});

			notifCache.push(notification);

			while (notifCache.length > this._notifLimit)
				notifCache.shift().destroy();

			source.addNotification(notification);

			return notification;
		}
	}
);

export default class RssFeedExtension extends Extension
{
	enable()
	{
		let settings = this.getSettings();
		this._indicator = new RssFeed2(settings, this);
		this._indicator._pollFeeds();
		Main.panel.addToStatusArea('rssFeed2Menu', this._indicator, 0, 'right');
		console.debug("rss-feed: Extension enabled.");
	}

	disable()
	{
		this._indicator?.destroy();
		this._indicator = null;
		console.debug("rss-feed: Extension disabled.");
	}
}
