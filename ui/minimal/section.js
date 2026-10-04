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

import * as GSKeys from '../../gskeys.js';
import { getInstance } from '../../encoder.js';
import { ScrollSection } from '../scrollSection.js';
import { MinimalSectionHeader } from './sectionHeader.js';
import { MinimalArticleItem } from './articleItem.js';
import { ShowMoreRow } from '../showMoreRow.js';

const Encoder = getInstance();

export class MinimalSection
{
	constructor(store, settings, style, runner)
	{
		this._store = store;
		this._settings = settings;
		this._runner = runner;

		this.section = new ScrollSection(style);

		this._plan = null;
		this._state = null;
		this._collapsed = {};
		this._chunkId = 0;
		this._rebuildId = 0;
		this._dirty = false;
		this._active = false;
		this._menuOpen = false;
		this._expanded = false;
	}

	setActive(active)
	{
		this._active = active;
		if (active)
			this.markDirty();
	}

	setMenuOpen(open)
	{
		this._menuOpen = open;
		if (open)
		{
			if (this._active && this._dirty)
				this._flush();
		}
		else if (this._expanded)
			this.markDirty();
	}

	markDirty()
	{
		this._dirty = true;
		if (!this._active || !this._menuOpen)
			return;
		if (this._rebuildId)
			GLib.source_remove(this._rebuildId);
		this._rebuildId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () =>
		{
			this._rebuildId = 0;
			this._flush();
			return GLib.SOURCE_REMOVE;
		});
	}

	_flush()
	{
		if (this._rebuildId)
		{
			GLib.source_remove(this._rebuildId);
			this._rebuildId = 0;
		}
		if (!this._dirty)
			return;
		this._dirty = false;

		this._rebuild();
	}

	// every stored article is visited, but only the newest ones up to the limit are kept and sorted
	_newestItems(read, limit)
	{
		let entries = [];
		let total = 0;
		let floor = -Infinity;
		let seq = 0;
		// scan order breaks ties, so a longer list always starts with the shorter one
		let newestFirst = (a, b) => b.ts - a.ts || a.seq - b.seq;

		for (let source of this._store.getSources())
		{
			let feedTitle = Encoder.htmlDecode(source.title);
			for (let item of source.items)
			{
				if (item.dismissed || item.read !== read)
					continue;

				total++;

				let ts = item.timestamp;
				if (ts <= floor)
					continue;

				entries.push({ item, source, feedTitle, ts, seq: seq++ });

				if (limit > 0 && entries.length >= limit * 2)
				{
					entries.sort(newestFirst);
					entries.length = limit;
					floor = entries[limit - 1].ts;
				}
			}
		}

		entries.sort(newestFirst);
		if (limit > 0 && entries.length > limit)
			entries.length = limit;

		return { entries, total };
	}

	_rebuild()
	{
		this._cancelChunk();
		this._expanded = false;

		this._state = {
			unread: { total: 0, header: null, showMore: null, rendered: 0 },
			read: { total: 0, header: null, showMore: null, rendered: 0 },
		};

		let cap = this._displayLimit();
		let plan = [];
		for (let section of ['unread', 'read'])
		{
			let state = this._state[section];
			let list = this._newestItems(section === 'read', cap);
			if (list.total === 0)
				continue;

			plan.push({ type: 'header', section });
			for (let entry of list.entries)
				plan.push({ type: 'item', section, entry });
			state.total = list.total;
			state.rendered = list.entries.length;
			if (state.rendered < state.total)
				plan.push({ type: 'showmore', section });
		}

		this._plan = plan;
		this.section.removeAll();

		if (plan.length === 0)
			return;

		this._renderRange(0);
	}

	_renderRange(from)
	{
		this._cancelChunk();

		let idx = from;
		this._chunkId = GLib.idle_add(GLib.PRIORITY_LOW, () =>
		{
			idx = this._renderChunk(idx);
			if (idx < 0)
			{
				this._chunkId = 0;
				return GLib.SOURCE_REMOVE;
			}
			return GLib.SOURCE_CONTINUE;
		});
	}

	_renderChunk(from)
	{
		if (!this._plan)
			return -1;

		let end = Math.min(from + 10, this._plan.length);
		for (let i = from; i < end; i++)
		{
			let step = this._plan[i];
			let state = this._state[step.section];
			if (step.type === 'header')
			{
				let sec = step.section;
				let h = new MinimalSectionHeader(
					sec.toUpperCase(),
					this._collapsed[sec],
					(collapsed) => { this._collapsed[sec] = collapsed; });
				this.section.addMenuItem(h);
				state.header = h;
			}
			else if (step.type === 'item')
			{
				let mi = new MinimalArticleItem(step.entry.item, step.entry.source, this._runner, step.entry.feedTitle);
				this.section.addMenuItem(mi);
				if (state.header)
					state.header.addItem(mi);
			}
			else
			{
				let row = new ShowMoreRow(() => this._append(step.section));
				row.setCounts(state.rendered, state.total);
				this.section.addMenuItem(row);
				if (state.header)
					state.header.addItem(row);
				state.showMore = row;
			}
		}
		return end >= this._plan.length ? -1 : end;
	}

	_append(section)
	{
		let state = this._state ? this._state[section] : null;
		if (!state || !state.showMore)
			return;

		let from = state.rendered;
		let list = this._newestItems(section === 'read', from + this._displayLimit());
		// a change that landed since the last rebuild can leave fewer articles than are already shown
		let to = Math.max(from, list.entries.length);
		state.total = list.total;

		let items = this.section._getMenuItems();
		let base = items.indexOf(state.showMore);
		if (base < 0)
			base = items.length;

		let firstNew = null;
		for (let i = from; i < list.entries.length; i++)
		{
			let entry = list.entries[i];
			let mi = new MinimalArticleItem(entry.item, entry.source, this._runner, entry.feedTitle);
			this.section.addMenuItem(mi, base + (i - from));
			if (state.header)
				state.header.addItem(mi);
			if (!firstNew)
				firstNew = mi;
		}

		state.rendered = to;
		this._expanded = true;

		if (to >= state.total)
		{
			state.showMore.destroy();
			state.showMore = null;
		}
		else
			state.showMore.setCounts(to, state.total);

		firstNew?.grab_key_focus();
	}

	_displayLimit()
	{
		return this._settings.get_int(GSKeys.ITEMS_VISIBLE);
	}

	_cancelChunk()
	{
		if (this._chunkId)
		{
			GLib.source_remove(this._chunkId);
			this._chunkId = 0;
		}
	}

	destroy()
	{
		if (this._rebuildId)
		{
			GLib.source_remove(this._rebuildId);
			this._rebuildId = 0;
		}

		this._cancelChunk();

		this._plan = null;
		this._state = null;
	}
}
