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

import * as GSKeys from '../gskeys.js';
import * as Misc from '../misc.js';
import { ScrollSection } from './scrollSection.js';
import { RssHeader } from './header.js';
import { ClassicFeedGroup } from './classic/feedGroup.js';
import { MinimalSection } from './minimal/section.js';

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
			if (open && this._lastOpen)
			{
				this._lastOpen.open();
			}

			this._minimal.setMenuOpen(open);

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

		this._header = new RssHeader({
			onReload : () => this.onReload?.(),
			onMarkAllSeen : () => this._store.markAllSeen(),
			onActivateConfirm : (b) => this._activateConfirm(b),
			onOpenSettings : () => this._onSettingsBtnClicked(),
			onOpenLink : (url) => { this.menu.close(); Misc.processLinkOpen(url); },
		});
		this.menu.addMenuItem(this._header);

		let maxHeight = settings.get_int(GSKeys.MAX_HEIGHT);
		this._feedsSection = new ScrollSection(this._generatePopupMenuCSS(maxHeight));
		this._minimal = new MinimalSection(store, settings, this._generatePopupMenuCSS(maxHeight));
		this.menu.addMenuItem(this._feedsSection);
		this.menu.addMenuItem(this._minimal.section);

		this._applyLayout();

		settings.connectObject(
			'changed::' + GSKeys.LAYOUT_MODE, () => this._applyLayout(),
			'changed::' + GSKeys.MAX_HEIGHT, () =>
			{
				let h = settings.get_int(GSKeys.MAX_HEIGHT);
				this._feedsSection.actor.set_style(this._generatePopupMenuCSS(h));
				this._minimal.section.actor.set_style(this._generatePopupMenuCSS(h));
			},
			'changed::' + GSKeys.ITEMS_VISIBLE, () =>
			{
				this._minimal.markDirty();
				for (let group of this._groups.values())
					group.refreshVisibleLimit();
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

	_applyLayout()
	{
		this._minimalLayout = this._settings.get_string(GSKeys.LAYOUT_MODE) === 'minimal';
		this._feedsSection.actor.visible = !this._minimalLayout;
		this._minimal.section.actor.visible = this._minimalLayout;
		this._minimal.setActive(this._minimalLayout);
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
			'items-changed', () => this._minimal.markDirty(),
			'unread-changed', () => this._minimal.markDirty(),
			'meta-changed', () => this._minimal.markDirty(),
			this
		);

		this._sourceBindings.set(source, { group });

		this._reorderClassicSection();
		this._minimal.markDirty();
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

		this._minimal.markDirty();
	}

	markUpdated()
	{
		this._header?.markUpdated();
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

		this._header?.setUnreadCount(count);
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

		this._minimal.destroy();

		if (this._scrollIdleId)
		{
			GLib.source_remove(this._scrollIdleId);
			this._scrollIdleId = 0;
		}

		super.destroy();
	}
});
