/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2015 - 2026
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
import St from 'gi://St';
import Clutter from 'gi://Clutter';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import * as GSKeys from '../gskeys.js';
import * as Misc from '../misc.js';
import { getInstance } from '../encoder.js';
import { ScrollSection } from './scrollSection.js';
import { ConfirmBadge } from './confirmBadge.js';
import { ClassicFeedGroup } from './classic/feedGroup.js';
import { MinimalArticleItem } from './minimal/articleItem.js';
import { MinimalSectionHeader } from './minimal/sectionHeader.js';

const Encoder = getInstance();
const MINIMAL_READ_INITIAL_LIMIT = 15;

export const RssIndicator = GObject.registerClass(
class RssIndicator extends PanelMenu.Button
{
	_init(settings, extension, store)
	{
		super._init(0.0, "RSS Feed");

		this._settings = settings;
		this._extension = extension;
		this._store = store;

		this._groups = new Map();
		this._sourceBindings = new Map();
		this._readShowAll = false;
		this.onReload = null;

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
			this._menuIsOpen = open;

			if (open && this._lastOpen)
			{
				this._lastOpen.open();
			}

			if (open && this._minimalDirty && this._layoutMode === 'minimal')
				this._flushMinimalRebuild();

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

		this._createHeader();

		let maxHeight = settings.get_int(GSKeys.MAX_HEIGHT);
		this._feedsSection = new ScrollSection(this._generatePopupMenuCSS(maxHeight));
		this._minimalSection = new ScrollSection(this._generatePopupMenuCSS(maxHeight));
		this.menu.addMenuItem(this._feedsSection);
		this.menu.addMenuItem(this._minimalSection);

		this._layoutMode = settings.get_string(GSKeys.LAYOUT_MODE);
		this._applyLayoutMode();

		this._lcid = settings.connect('changed::' + GSKeys.LAYOUT_MODE, () =>
		{
			this._layoutMode = settings.get_string(GSKeys.LAYOUT_MODE);
			this._applyLayoutMode();
			if (this._layoutMode === 'minimal')
				this._markMinimalDirty();
		});

		this._mhid = settings.connect('changed::' + GSKeys.MAX_HEIGHT, () =>
		{
			let h = settings.get_int(GSKeys.MAX_HEIGHT);
			this._feedsSection.actor.set_style(this._generatePopupMenuCSS(h));
			this._minimalSection.actor.set_style(this._generatePopupMenuCSS(h));
		});

		this._storeAddedId = store.connect('source-added', (_store, source) => this._addGroup(source));
		this._storeRemovedId = store.connect('source-removed', (_store, source) => this._removeGroup(source));
		this._storeChangedId = store.connect('changed', () => this._updateUnreadCountLabel(this._store.totalUnread));
		this._storeReorderedId = store.connect('reordered', () => this._reorderClassicSection());

		for (let source of store.getSources())
			this._addGroup(source);

		this._updateUnreadCountLabel(store.totalUnread);
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
			Misc.processLinkOpen('https://github.com/todevelopers/gnome-shell-extension-rss-feed');
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

		this._unreadBadge = new ConfirmBadge('rss-unread-badge', this._unreadBadgeText);
		this._unreadBadge.visible = false;
		this._unreadBadge.onConfirm = () => this._store.markAllSeen();
		this._unreadBadge.onEnterConfirm = (b) => this._activateConfirm(b);
		this._buttonMenu.add_child(this._unreadBadge);

		let reloadBtn = new St.Button(
		{
			style_class : 'rss-icon-btn',
			can_focus : true,
			child : new St.Icon({ icon_name : 'view-refresh-symbolic', style_class : 'popup-menu-icon' }),
		});
		reloadBtn.connect('clicked', () =>
		{
			if (this.onReload)
				this.onReload();
		});

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

	_addGroup(source)
	{
		let group = new ClassicFeedGroup(source, this._store);
		group.onActivateConfirm = (b) => this._activateConfirm(b);
		this._feedsSection.addMenuItem(group);
		this._groups.set(source.url, group);

		let openId = group.menu.connect('open-state-changed', (self, open) =>
		{
			if (open)
			{
				this._lastOpen = self;
				if (this._scrollIdleId)
					GLib.source_remove(this._scrollIdleId);
				this._scrollIdleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () =>
				{
					this._scrollIdleId = 0;
					this._scrollFeedSectionTo(group);
					return GLib.SOURCE_REMOVE;
				});
			}
			else if (this.menu.isOpen && this._lastOpen === self)
				this._lastOpen = undefined;
		});

		let destroyId = group.menu.connect('destroy', (self) =>
		{
			if (this._lastOpen === self)
				this._lastOpen = undefined;
		});

		let icId = source.connect('items-changed', () => this._onSourceItemsChanged());
		let ucId = source.connect('unread-changed', () => this._markMinimalDirty());
		let mcId = source.connect('meta-changed', () => this._markMinimalDirty());

		this._sourceBindings.set(source, { group, openId, destroyId, icId, ucId, mcId });

		this._reorderClassicSection();
		this._markMinimalDirty();
	}

	_removeGroup(source)
	{
		let binding = this._sourceBindings.get(source);
		if (!binding)
			return;

		source.disconnect(binding.icId);
		source.disconnect(binding.ucId);
		source.disconnect(binding.mcId);

		if (this._lastOpen === binding.group.menu)
			this._lastOpen = undefined;

		binding.group.destroy();
		this._groups.delete(source.url);
		this._sourceBindings.delete(source);

		this._markMinimalDirty();
	}

	_onSourceItemsChanged()
	{
		if (this._headerSubtitle)
			this._headerSubtitle.set_text('Updated at ' + new Date().toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' }));

		this._markMinimalDirty();
	}

	_reorderClassicSection()
	{
		let pos = 0;
		for (let source of this._store.getSources())
		{
			let group = this._groups.get(source.url);
			if (!group)
				continue;
			this._feedsSection.box.set_child_at_index(group, pos);
			pos++;
			let subActor = group.menu.actor;
			if (subActor.get_parent() !== this._feedsSection.box)
			{
				let p = subActor.get_parent();
				if (p)
					p.remove_child(subActor);
				this._feedsSection.box.insert_child_at_index(subActor, pos);
			}
			else
				this._feedsSection.box.set_child_at_index(subActor, pos);
			pos++;
		}
	}

	_computeMinimalList()
	{
		let out = [];
		for (let source of this._store.getSources())
		{
			let feedTitle = Encoder.htmlDecode(source.title);
			for (let item of source.items)
			{
				out.push({
					item,
					source,
					feedTitle,
					section: item.read ? 'read' : 'unread',
					ts: new Date(item.publishDate || 0).getTime(),
				});
			}
		}

		out.sort((a, b) =>
		{
			if (a.section !== b.section)
				return a.section === 'unread' ? -1 : 1;
			return b.ts - a.ts;
		});

		return out;
	}

	_rebuildMinimalSection()
	{
		this._minimalSection.removeAll();

		let items = this._computeMinimalList();

		if (!this._minimalCollapsed)
			this._minimalCollapsed = {};
		let collapsedState = this._minimalCollapsed;

		let readTotal = 0;
		for (let i = 0; i < items.length; i++)
			if (items[i].section === 'read') readTotal++;

		let readLimit = this._readShowAll ? readTotal : MINIMAL_READ_INITIAL_LIMIT;
		let readRendered = 0;
		let lastSection = null;
		let currentHeader = null;
		let readHeader = null;
		for (let entry of items)
		{
			let { item, source, feedTitle, section } = entry;
			if (section !== lastSection)
			{
				let sec = section;
				currentHeader = new MinimalSectionHeader(
					section.toUpperCase(),
					collapsedState[sec],
					(collapsed) => { collapsedState[sec] = collapsed; });
				this._minimalSection.addMenuItem(currentHeader);
				if (sec === 'read') readHeader = currentHeader;
				lastSection = section;
			}
			if (section === 'read')
			{
				if (readRendered >= readLimit)
					continue;
				readRendered++;
			}
			let mi = new MinimalArticleItem(item, source, this._store, feedTitle);
			this._minimalSection.addMenuItem(mi);
			if (currentHeader)
				currentHeader.addItem(mi);
		}

		let hidden = readTotal - readRendered;
		if (hidden > 0)
		{
			let showAll = new PopupMenu.PopupBaseMenuItem(
				{ style_class: 'popup-menu-item rss-minimal-section-header' });
			let showAllLabel = new St.Label(
			{
				text: "Show all (" + hidden + " more)",
				x_expand: true,
				y_align: Clutter.ActorAlign.CENTER,
				style_class: 'rss-minimal-section-label',
			});
			showAll.add_child(showAllLabel);
			showAll.activate = () =>
			{
				this._readShowAll = true;
				this._markMinimalDirty();
			};
			this._minimalSection.addMenuItem(showAll);
			if (readHeader)
				readHeader.addItem(showAll);
		}
	}

	_markMinimalDirty()
	{
		this._minimalDirty = true;
		if (this._layoutMode !== 'minimal' || !this._menuIsOpen)
			return;
		if (this._minimalRebuildId)
			GLib.source_remove(this._minimalRebuildId);
		this._minimalRebuildId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () =>
		{
			this._minimalRebuildId = 0;
			this._flushMinimalRebuild();
			return GLib.SOURCE_REMOVE;
		});
	}

	_flushMinimalRebuild()
	{
		if (this._minimalRebuildId)
		{
			GLib.source_remove(this._minimalRebuildId);
			this._minimalRebuildId = 0;
		}
		if (!this._minimalDirty)
			return;
		this._minimalDirty = false;

		this._rebuildMinimalSection();
	}

	_activateConfirm(badge)
	{
		if (this._activeConfirm && this._activeConfirm !== badge)
			this._activeConfirm.exitConfirm();
		this._activeConfirm = badge;
	}

	_scrollFeedSectionTo(menuItem)
	{
		let scrollView = this._feedsSection.actor;
		let adj = scrollView.vadjustment;
		if (!adj) return;
		let [, itemGlobalY] = menuItem.get_transformed_position();
		let [, scrollGlobalY] = scrollView.get_transformed_position();
		let targetY = itemGlobalY - scrollGlobalY + adj.value;
		adj.value = Math.max(0, Math.min(targetY, adj.upper - adj.page_size));
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

	_onSettingsBtnClicked()
	{
		if (Misc.isScreenLocked())
			return;

		this.menu.close();
		this._extension.openPreferences();
	}

	destroy()
	{
		if (this._menuOpenId)
			this.menu.disconnect(this._menuOpenId);

		if (this._menuCapturedId)
			this.menu.actor.disconnect(this._menuCapturedId);

		if (this._lcid)
			this._settings.disconnect(this._lcid);

		if (this._mhid)
			this._settings.disconnect(this._mhid);

		if (this._storeAddedId)
			this._store.disconnect(this._storeAddedId);

		if (this._storeRemovedId)
			this._store.disconnect(this._storeRemovedId);

		if (this._storeChangedId)
			this._store.disconnect(this._storeChangedId);

		if (this._storeReorderedId)
			this._store.disconnect(this._storeReorderedId);

		for (let [source, binding] of this._sourceBindings)
		{
			source.disconnect(binding.icId);
			source.disconnect(binding.ucId);
			source.disconnect(binding.mcId);
		}
		this._sourceBindings.clear();

		if (this._minimalRebuildId)
		{
			GLib.source_remove(this._minimalRebuildId);
			this._minimalRebuildId = 0;
		}

		if (this._scrollIdleId)
		{
			GLib.source_remove(this._scrollIdleId);
			this._scrollIdleId = 0;
		}

		super.destroy();
	}
});
