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
import { RssBadgeButton } from './extensiongui/rssbadgebutton.js';

const Encoder = getInstance();
const NOTIFICATION_ICON = 'application-rss+xml';

function _relativeTime(dateStr)
{
	if (!dateStr) return '';
	try
	{
		let diff = (Date.now() - new Date(dateStr).getTime()) / 60000;
		if (diff < 60) return Math.round(Math.max(1, diff)) + 'm';
		if (diff < 1440) return Math.round(diff / 60) + 'h';
		return Math.round(diff / 1440) + 'd';
	}
	catch (_) { return ''; }
}

const RssMinimalSectionHeader = GObject.registerClass(
class RssMinimalSectionHeader extends PopupMenu.PopupBaseMenuItem
{
	_init(text, initialCollapsed, onToggle)
	{
		super._init({ style_class: 'popup-menu-item rss-minimal-section-header' });
		this._items = [];
		this._collapsed = !!initialCollapsed;
		this._onToggle = onToggle;

		this._label = new St.Label(
		{
			text,
			x_expand: true,
			y_align: Clutter.ActorAlign.CENTER,
			style_class: 'rss-minimal-section-label',
		});
		this.add_child(this._label);

		this._icon = new St.Icon(
		{
			icon_name: this._collapsed ? 'pan-end-symbolic' : 'pan-down-symbolic',
			style_class: 'popup-menu-icon',
			y_align: Clutter.ActorAlign.CENTER,
		});
		this.add_child(this._icon);
	}

	activate(_event)
	{
		this.toggle();
	}

	addItem(item)
	{
		this._items.push(item);
		item.visible = !this._collapsed;
	}

	toggle()
	{
		this._collapsed = !this._collapsed;
		this._icon.icon_name = this._collapsed ? 'pan-end-symbolic' : 'pan-down-symbolic';
		for (let item of this._items)
			item.visible = !this._collapsed;
		if (this._onToggle)
			this._onToggle(this._collapsed);
	}
});

const RssMinimalMenuItem = GObject.registerClass(
class RssMinimalMenuItem extends PopupMenu.PopupBaseMenuItem
{
	_init(cacheObj, feedTitle, onRead)
	{
		super._init();
		this._cacheObj = cacheObj;
		let item = cacheObj.Item;

		let contentBox = new St.BoxLayout({ vertical: true, x_expand: true });
		this._titleLabel = new St.Label({ text: item.Title });
		this._titleLabel.add_style_class_name(cacheObj.Unread ? 'rss-article-unread' : 'rss-article-read');
		contentBox.add_child(this._titleLabel);

		let metaBox = new St.BoxLayout({ style: 'spacing: 6px;' });
		metaBox.add_child(new St.Label({ text: feedTitle, style_class: 'rss-source-tag' }));
		metaBox.add_child(new St.Label({ text: _relativeTime(item.PublishDate), style_class: 'rss-article-time' }));
		contentBox.add_child(metaBox);
		this.add_child(contentBox);

		this.connect('activate', (self, event) =>
		{
			if (event.type() == Clutter.EventType.BUTTON_RELEASE
				&& event.get_button() == Clutter.BUTTON_SECONDARY)
			{
				St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, item.HttpLink);
			}
			else
			{
				Misc.processLinkOpen(item.HttpLink, cacheObj);
				onRead();
			}
		});
	}
});

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
			this._notifCache = new Array();

			this._totalUnreadCount = 0;
			this._notifLimit = 10;

			let button = new St.BoxLayout(
			{
				vertical : false,
				style_class : 'panel-status-menu-box'
			});

			this._iconLabel = new St.Widget(
			{
				visible : false,
				y_align : Clutter.ActorAlign.CENTER,
				style_class : 'rss-icon-label',
			});

			let icon = new St.Icon(
			{
				icon_name : 'application-rss+xml-symbolic',
				style_class : 'system-status-icon'
			});

			button.add_child(this._iconLabel);
			button.add_child(icon);

			this.add_child(button);

			this.menu.actor.add_style_class_name('rss-menu');

			this._menuOpenId = this.menu.connect('open-state-changed', (self, open) =>
			{
				if (open && this._lastOpen)
				{
					this._lastOpen.open();
				}

				if (open == false && this._activeConfirm)
				{
					this._activeConfirm.exitConfirm();
					this._activeConfirm = null;
				}
			});

			this._activeConfirm = null;
			this._menuCapturedId = this.menu.actor.connect('captured-event', (_actor, event) =>
			{
				if (!this._activeConfirm)
					return Clutter.EVENT_PROPAGATE;

				let type = event.type();
				if (type === Clutter.EventType.BUTTON_PRESS)
				{
					let [ex, ey] = event.get_coords();
					let [bx, by] = this._activeConfirm.get_transformed_position();
					let [bw, bh] = this._activeConfirm.get_transformed_size();
					let inBadge = ex >= bx && ex < bx + bw
						&& ey >= by && ey < by + bh;
					if (!inBadge)
					{
						this._activeConfirm.exitConfirm();
						this._activeConfirm = null;
					}
				}
				else if (type === Clutter.EventType.KEY_PRESS
					&& event.get_key_symbol() === Clutter.KEY_Escape)
				{
					this._activeConfirm.exitConfirm();
					this._activeConfirm = null;
					return Clutter.EVENT_STOP;
				}

				return Clutter.EVENT_PROPAGATE;
			});

			this._pMaxMenuHeight = settings.get_int(GSKeys.MAX_HEIGHT);

			this._createHeader();

			this._feedsSection = new RssPopupMenuSection("max-height: " + this._pMaxMenuHeight + "px;");
			this._minimalSection = new RssPopupMenuSection("max-height: " + this._pMaxMenuHeight + "px;");
			this.menu.addMenuItem(this._feedsSection);
			this.menu.addMenuItem(this._minimalSection);

			this._layoutMode = settings.get_string(GSKeys.LAYOUT_MODE);
			this._applyLayoutMode();

			this._lcid = settings.connect('changed::' + GSKeys.LAYOUT_MODE, () =>
			{
				this._layoutMode = settings.get_string(GSKeys.LAYOUT_MODE);
				this._applyLayoutMode();
				if (this._layoutMode === 'minimal')
					this._rebuildMinimalSection();
			});
		}

		_createHeader()
		{
			this._buttonMenu = new PopupMenu.PopupBaseMenuItem({ reactive : false, style_class : 'rss-header' });

			let iconBox = new St.Button(
			{
				style_class : 'rss-header-icon',
				x_align : Clutter.ActorAlign.CENTER,
				y_align : Clutter.ActorAlign.CENTER,
				can_focus : false,
				child : new St.Icon({ icon_name : 'application-rss+xml-symbolic', icon_size : 20 }),
			});
			iconBox.connect('clicked', () =>
			{
				this.menu.close();
				Misc.processLinkOpen('https://github.com/todevelopers/gnome-shell-extension-rss-feed', null);
			});
			this._buttonMenu.add_child(iconBox);

			let titleBox = new St.BoxLayout({ vertical : true, x_expand : true });
			titleBox.add_child(new St.Label({ text : 'RSS Feed', style_class : 'rss-header-title' }));
			this._headerSubtitle = new St.Label({ text : '', style_class : 'rss-header-subtitle' });
			titleBox.add_child(this._headerSubtitle);
			this._buttonMenu.add_child(titleBox);

			this._unreadBadgeText = new St.Label(
			{
				text : '',
				x_align : Clutter.ActorAlign.CENTER,
				y_align : Clutter.ActorAlign.CENTER,
				style_class : 'rss-badge-text',
			});

			this._unreadBadge = new RssBadgeButton('rss-unread-badge', this._unreadBadgeText);
			this._unreadBadge.visible = false;
			this._unreadBadge.onConfirm = () =>
			{
				this._setAllFeedsAsSeen();
				this._totalUnreadCount = 0;
				this._updateUnreadCountLabel(0);
				if (this._layoutMode === 'minimal')
					this._rebuildMinimalSection();
			};
			this._unreadBadge.onEnterConfirm = (b) => this._activateConfirm(b);
			this._buttonMenu.add_child(this._unreadBadge);

			let reloadBtn = new St.Button(
			{
				style_class : 'rss-icon-btn',
				can_focus : true,
				child : new St.Icon({ icon_name : 'view-refresh-symbolic', style_class : 'popup-menu-icon' }),
			});
			reloadBtn.connect('clicked', this._pollFeeds.bind(this));

			let settingsBtn = new St.Button(
			{
				style_class : 'rss-icon-btn',
				can_focus : true,
				child : new St.Icon({ icon_name : 'applications-system-symbolic', style_class : 'popup-menu-icon' }),
			});
			settingsBtn.connect('clicked', this._onSettingsBtnClicked.bind(this));

			this._buttonMenu.add_child(reloadBtn);
			this._buttonMenu.add_child(settingsBtn);

			this.menu.addMenuItem(this._buttonMenu);
		}

		_applyLayoutMode()
		{
			let classic = this._layoutMode !== 'minimal';
			this._feedsSection.actor.visible = classic;
			this._minimalSection.actor.visible = !classic;
		}

		_rebuildMinimalSection()
		{
			this._minimalSection.removeAll();

			let allItems = [];
			let urls = this._rssFeedsSources || [];
			for (let i = 0; i < urls.length; i++)
			{
				let url = urls[i];
				let feedCache = this._feedsCache[url];
				if (!feedCache || !feedCache.Menu) continue;
				let feedTitle = feedCache.Menu._olabeltext;
				for (let j = 0; j < feedCache.Items.length; j++)
				{
					let id = feedCache.Items[j];
					let cacheObj = feedCache.Items[id];
					if (!cacheObj) continue;
					allItems.push({ cacheObj, feedTitle });
				}
			}


			allItems.sort((a, b) =>
			{
				if (!!a.cacheObj.Unread !== !!b.cacheObj.Unread)
					return a.cacheObj.Unread ? -1 : 1;
				let da = new Date(a.cacheObj.Item.PublishDate || 0).getTime();
				let db = new Date(b.cacheObj.Item.PublishDate || 0).getTime();
				return db - da;
			});

			if (!this._minimalCollapsed)
				this._minimalCollapsed = {};
			let collapsedState = this._minimalCollapsed;

			let lastSection = null;
			let currentHeader = null;
			for (let { cacheObj, feedTitle } of allItems)
			{
				let section = cacheObj.Unread ? 'unread' : 'read';
				if (section !== lastSection)
				{
					let sec = section;
					currentHeader = new RssMinimalSectionHeader(
						section.toUpperCase(),
						collapsedState[sec],
						(collapsed) => { collapsedState[sec] = collapsed; });
					this._minimalSection.addMenuItem(currentHeader);
					lastSection = section;
				}
				let mi = new RssMinimalMenuItem(cacheObj, feedTitle,
					() => this._rebuildMinimalSection());
				this._minimalSection.addMenuItem(mi);
				if (currentHeader)
					currentHeader.addItem(mi);
			}
		}

		_activateConfirm(badge)
		{
			if (this._activeConfirm && this._activeConfirm !== badge)
				this._activeConfirm.exitConfirm();
			this._activeConfirm = badge;
		}

		_markFeedAsSeen(feedCache)
		{
			if (!feedCache)
				return;

			let delta = feedCache.UnreadCount;

			for (let j = 0; j < feedCache.Items.length; j++)
			{
				let id = feedCache.Items[j];
				let cacheObj = feedCache.Items[id];
				if (!cacheObj)
					continue;
				if (cacheObj.Menu)
					cacheObj.Menu.setOrnament(PopupMenu.Ornament.NONE);
				cacheObj.Unread = null;
			}

			feedCache.UnreadCount = 0;
			feedCache.pUnreadCount = 0;
			if (feedCache.Menu)
				feedCache.Menu.setUnreadCount(0);

			if (feedCache._url)
				this._aSettings.set(feedCache._url, 'i', undefined);

			this._totalUnreadCount = Math.max(0, this._totalUnreadCount - delta);
			this._updateUnreadCountLabel(this._totalUnreadCount);

			if (this._layoutMode === 'minimal')
				this._rebuildMinimalSection();
		}

		_reorderClassicSection()
		{
			let pos = 0;
			for (let i = 0; i < this._rssFeedsSources.length; i++)
			{
				let feedCache = this._feedsCache[this._rssFeedsSources[i]];
				if (!feedCache || !feedCache.Menu)
					continue;
				this._feedsSection.box.set_child_at_index(feedCache.Menu, pos);
				pos++;
				this._feedsSection.box.set_child_at_index(feedCache.Menu.menu.actor, pos);
				pos++;
			}
		}

		destroy()
		{
			this._isDiscarded = true;

			this._httpSession.abort();
			this._cancellable.cancel();

			if (this._menuOpenId)
				this.menu.disconnect(this._menuOpenId);

			if (this._menuCapturedId)
				this.menu.actor.disconnect(this._menuCapturedId);

			if (this._scid)
				this._settings.disconnect(this._scid);

			if (this._lcid)
				this._settings.disconnect(this._lcid);

			if (this._timeout)
				GLib.source_remove(this._timeout);

			if (this._settingsCWId)
				GLib.source_remove(this._settingsCWId);

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

				feedCache.Menu.setUnreadCount(0);
				feedCache.Menu.setOrnament(PopupMenu.Ornament.NONE);
				this._feedsCache[url] = feedCache;
				this._aSettings.set(url, 'i', undefined);
			}
		}

		_updateUnreadCountLabel(count)
		{
			if (count > 0)
				this._iconLabel.show();
			else
				this._iconLabel.hide();

			if (this._unreadBadge)
			{
				if (count > 0)
				{
					this._unreadBadgeText.set_text(count > 99 ? '99+' : count.toString());
					this._unreadBadge.show();
				}
				else
				{
					this._unreadBadge.hide();
				}
			}
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
			this._enableNotifications = this._settings.get_boolean(GSKeys.ENABLE_NOTIFICATIONS);
			this._maxMenuHeight = this._settings.get_int(GSKeys.MAX_HEIGHT);
			this._notifLimit = this._settings.get_int(GSKeys.MAX_NOTIFICATIONS);
			this._notifOnLockScreen = this._settings.get_boolean(GSKeys.NOTIFICATIONS_ON_LOCKSCREEN);
			this._http_keepalive = this._settings.get_boolean(GSKeys.HTTP_KEEPALIVE);
			this._markInitialAsNew = this._settings.get_boolean(GSKeys.MARK_INITIAL_AS_NEW);

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

			if (this._layoutMode === 'minimal')
				this._rebuildMinimalSection();
		}

		_pollFeeds()
		{
			this._getSettings();

			if (this._maxMenuHeight != this._pMaxMenuHeight)
			{
				this._feedsSection.actor.set_style(this._generatePopupMenuCSS(this._maxMenuHeight));
				this._minimalSection.actor.set_style(this._generatePopupMenuCSS(this._maxMenuHeight));
			}

			this._pMaxMenuHeight = this._maxMenuHeight;

			console.debug("rss-feed: Reload RSS Feeds");

			if (this._timeout)
				GLib.source_remove(this._timeout);

			if (this._rssFeedsSources)
			{
				if ((this._pItemsVisible && this._itemsVisible > this._pItemsVisible))
				{
					this._feedsSection.removeAll();
					this._minimalSection.removeAll();
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

					this._httpGetRequestAsync(finalUrl, sourceURL, this._onDownload.bind(this));
				}

				this._reorderClassicSection();
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
				feedCache._url = sourceURL;
			}
			else
				feedCache = this._feedsCache[sourceURL];

			let itemCache = feedCache.Items;
			let subMenu;

			let gsData = this._aSettings._gsData[sourceURL];
			let muteNotifications;
			let disableUpdates;
			let customTitle;
			let customAvatar;

			if (gsData)
			{
				muteNotifications = gsData['n'];
				disableUpdates = gsData['u'];
				customTitle = gsData['t'];
				customAvatar = gsData['v'];
			}

			let persistedUnread = (gsData && Array.isArray(gsData['i'])) ? new Set(gsData['i']) : new Set();

			if (customTitle)
				rssParser.Publisher.Title = customTitle;

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

				subMenu._countBadge.onConfirm = () => this._markFeedAsSeen(feedCache);
				subMenu._countBadge.onEnterConfirm = (b) => this._activateConfirm(b);

				feedCache.Menu = subMenu;
				this._reorderClassicSection();
			}
			else
			{
				subMenu = feedCache.Menu;
				if (customTitle && subMenu._olabeltext !== customTitle)
				{
					subMenu.label.set_text(customTitle);
					subMenu._olabeltext = customTitle;
				}
			}

			if (customAvatar)
				subMenu._avatar.child.set_text(customAvatar);

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
						if (!disableUpdates
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
						if (itemDescription.length > 290)
							itemDescription = itemDescription.substr(0, 290) + "...";

						cacheObj._itemDescription = itemDescription;
					}
				}

				if (!feedCache._initialRefresh && !this._markInitialAsNew && !persistedUnread.has(itemID))
					continue;

				feedCache.UnreadCount++;
				this._totalUnreadCount++;

				cacheObj.Unread = true;
				menu.setOrnament(PopupMenu.Ornament.DOT);

				if (feedCache._initialRefresh
					&& this._enableNotifications && !muteNotifications)
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

			let unreadIds = [];
			for (let k = 0; k < itemCache.length; k++)
			{
				let id = itemCache[k];
				if (itemCache[id] && itemCache[id].Unread)
					unreadIds.push(id);
			}
			this._aSettings.set(sourceURL, 'i', unreadIds.length ? unreadIds : undefined);

			if (feedCache.UnreadCount != feedCache.pUnreadCount)
				subMenu.setUnreadCount(feedCache.UnreadCount);

			feedCache.pUnreadCount = feedCache.UnreadCount;
			this._updateUnreadCountLabel(this._totalUnreadCount);

			if (feedCache.UnreadCount)
				subMenu.setOrnament(PopupMenu.Ornament.DOT);
			else
				subMenu.setOrnament(PopupMenu.Ornament.NONE);

			if (this._headerSubtitle)
				this._headerSubtitle.set_text('Updated at ' + new Date().toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' }));

			if (this._layoutMode === 'minimal')
				this._rebuildMinimalSection();
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
