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
const MINIMAL_INITIAL_RENDER = 50;
const MINIMAL_RENDER_PAGE = 25;

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
		this._minimalPlan = null;
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

		this.menu.connectObject('open-state-changed', (self, open) =>
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
		}, this);

		this._activeConfirm = null;
		this.menu.actor.connectObject('captured-event', (_actor, event) =>
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
		}, this);

		this._createHeader();

		let maxHeight = settings.get_int(GSKeys.MAX_HEIGHT);
		this._feedsSection = new ScrollSection(this._generatePopupMenuCSS(maxHeight));
		this._minimalSection = new ScrollSection(this._generatePopupMenuCSS(maxHeight));
		this.menu.addMenuItem(this._feedsSection);
		this.menu.addMenuItem(this._minimalSection);

		let minimalAdj = this._minimalSection.actor.vadjustment;
		if (minimalAdj)
			minimalAdj.connectObject('notify::value', () => this._maybeLoadMoreMinimal(), this);

		this._layoutMode = settings.get_string(GSKeys.LAYOUT_MODE);
		this._applyLayoutMode();

		settings.connectObject(
			'changed::' + GSKeys.LAYOUT_MODE, () =>
			{
				this._layoutMode = settings.get_string(GSKeys.LAYOUT_MODE);
				this._applyLayoutMode();
				if (this._layoutMode === 'minimal')
					this._markMinimalDirty();
			},
			'changed::' + GSKeys.MAX_HEIGHT, () =>
			{
				let h = settings.get_int(GSKeys.MAX_HEIGHT);
				this._feedsSection.actor.set_style(this._generatePopupMenuCSS(h));
				this._minimalSection.actor.set_style(this._generatePopupMenuCSS(h));
			},
			this
		);

		store.connectObject(
			'source-added', (_store, source) => this._addGroup(source),
			'source-removed', (_store, source) => this._removeGroup(source),
			'changed', () => this._updateUnreadCountLabel(this._store.totalUnread),
			'reordered', () => this._reorderClassicSection(),
			this
		);

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
		let group = new ClassicFeedGroup(source, this._store, this._settings);
		group.onActivateConfirm = (b) => this._activateConfirm(b);
		this._feedsSection.addMenuItem(group);
		this._groups.set(source.url, group);

		group.menu.connectObject('open-state-changed', (self, open) =>
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
		}, this);

		source.connectObject(
			'items-changed', () => this._markMinimalDirty(),
			'unread-changed', () => this._markMinimalDirty(),
			'meta-changed', () => this._markMinimalDirty(),
			this
		);

		this._sourceBindings.set(source, { group });

		this._reorderClassicSection();
		this._markMinimalDirty();
	}

	_removeGroup(source)
	{
		let binding = this._sourceBindings.get(source);
		if (!binding)
			return;

		source.disconnectObject(this);

		if (this._lastOpen === binding.group.menu)
			this._lastOpen = undefined;

		binding.group.destroy();
		this._groups.delete(source.url);
		this._sourceBindings.delete(source);

		this._markMinimalDirty();
	}

	markUpdated()
	{
		if (this._headerSubtitle)
			this._headerSubtitle.set_text('Updated at ' + new Date().toLocaleTimeString('default', { hour: '2-digit', minute: '2-digit' }));
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
		this._cancelMinimalChunk();

		let items = this._computeMinimalList();

		if (!this._minimalCollapsed)
			this._minimalCollapsed = {};

		let plan = [];
		let lastSection = null;
		for (let entry of items)
		{
			if (entry.section !== lastSection)
			{
				plan.push({ type: 'header', section: entry.section });
				lastSection = entry.section;
			}
			plan.push({ type: 'item', item: entry.item, source: entry.source, feedTitle: entry.feedTitle, section: entry.section });
		}

		this._minimalPlan = plan;
		this._minimalHeaders = {};
		this._minimalRenderLimit = Math.min(MINIMAL_INITIAL_RENDER, plan.length);

		this._minimalSection.removeAll();

		if (plan.length === 0)
			return;

		this._renderMinimalRange(0);
	}

	_renderMinimalRange(from)
	{
		this._cancelMinimalChunk();

		let idx = from;
		this._minimalChunkId = GLib.idle_add(GLib.PRIORITY_LOW, () =>
		{
			if (!this._minimalPlan)
			{
				this._minimalChunkId = 0;
				return GLib.SOURCE_REMOVE;
			}

			let end = Math.min(idx + 10, this._minimalRenderLimit);
			for (let i = idx; i < end; i++)
			{
				let step = this._minimalPlan[i];
				if (step.type === 'header')
				{
					let sec = step.section;
					let h = new MinimalSectionHeader(
						sec.toUpperCase(),
						this._minimalCollapsed[sec],
						(collapsed) => { this._minimalCollapsed[sec] = collapsed; });
					this._minimalSection.addMenuItem(h);
					this._minimalHeaders[sec] = h;
				}
				else
				{
					let mi = new MinimalArticleItem(step.item, step.source, this._store, step.feedTitle);
					this._minimalSection.addMenuItem(mi);
					let h = this._minimalHeaders[step.section];
					if (h)
						h.addItem(mi);
				}
			}
			idx = end;

			if (idx >= this._minimalRenderLimit)
			{
				this._minimalChunkId = 0;
				return GLib.SOURCE_REMOVE;
			}
			return GLib.SOURCE_CONTINUE;
		});
	}

	_appendMinimalMore()
	{
		if (this._minimalChunkId || !this._minimalPlan)
			return;
		if (this._minimalRenderLimit >= this._minimalPlan.length)
			return;

		let from = this._minimalRenderLimit;
		this._minimalRenderLimit = Math.min(this._minimalRenderLimit + MINIMAL_RENDER_PAGE, this._minimalPlan.length);
		this._renderMinimalRange(from);
	}

	_maybeLoadMoreMinimal()
	{
		if (this._minimalChunkId || !this._minimalPlan)
			return;
		if (this._minimalRenderLimit >= this._minimalPlan.length)
			return;

		let adj = this._minimalSection.actor.vadjustment;
		if (!adj)
			return;

		if (adj.value + adj.page_size >= adj.upper - adj.page_size)
			this._appendMinimalMore();
	}

	_cancelMinimalChunk()
	{
		if (this._minimalChunkId)
		{
			GLib.source_remove(this._minimalChunkId);
			this._minimalChunkId = 0;
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
		this.menu.disconnectObject(this);
		this.menu.actor.disconnectObject(this);
		this._settings.disconnectObject(this);
		this._store.disconnectObject(this);

		for (let [source] of this._sourceBindings)
			source.disconnectObject(this);
		this._sourceBindings.clear();

		if (this._minimalRebuildId)
		{
			GLib.source_remove(this._minimalRebuildId);
			this._minimalRebuildId = 0;
		}

		if (this._minimalChunkId)
		{
			GLib.source_remove(this._minimalChunkId);
			this._minimalChunkId = 0;
		}

		this._minimalPlan = null;

		if (this._scrollIdleId)
		{
			GLib.source_remove(this._scrollIdleId);
			this._scrollIdleId = 0;
		}

		super.destroy();
	}
});
