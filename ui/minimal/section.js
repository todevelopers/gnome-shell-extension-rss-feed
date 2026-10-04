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
import St from 'gi://St';

import * as GSKeys from '../../gskeys.js';
import { getInstance } from '../../encoder.js';
import { newestEntries, sectionOf } from '../../data/articleSections.js';
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
		// extra is the number of rows that Show more added on top of the visible limit
		this._state = {
			starred: { extra: 0, total: 0, shown: 0, header: null, showMore: null, rows: new Map() },
			unread: { extra: 0, total: 0, shown: 0, header: null, showMore: null, rows: new Map() },
			read: { extra: 0, total: 0, shown: 0, header: null, showMore: null, rows: new Map() },
		};
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
		{
			this._expanded = false;
			this._state.starred.extra = 0;
			this._state.unread.extra = 0;
			this._state.read.extra = 0;
			this.markDirty();
		}
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

		this._reconcile();
	}

	_sectionEntries(section, limit)
	{
		// the starred articles of a removed feed live in a source that getSources() does not list
		if (section === 'starred')
		{
			let entries = this._store.starredEntries();
			return { entries: limit > 0 ? entries.slice(0, limit) : entries, total: entries.length };
		}

		return newestEntries(this._store.getSources(), item => sectionOf(item) === section, limit);
	}

	// rows of articles that stay in their section are kept, only the difference is destroyed and created
	_reconcile()
	{
		this._cancelChunk();

		let cap = this._displayLimit();
		let plan = [];
		let gone = [];

		for (let section of ['starred', 'unread', 'read'])
		{
			let state = this._state[section];
			let list = this._sectionEntries(section, cap > 0 ? cap + state.extra : 0);
			let sources = new Map(list.entries.map(entry => [entry.item, entry.source]));

			for (let [item, row] of state.rows)
			{
				// a feed that was removed and added again hands its starred articles over to a new source
				if (sources.get(item) !== row.source)
				{
					state.rows.delete(item);
					state.header.removeItem(row);
					gone.push(row);
				}
			}

			state.total = list.total;
			state.shown = list.entries.length;

			if (state.showMore && state.shown >= state.total)
			{
				state.header.removeItem(state.showMore);
				gone.push(state.showMore);
				state.showMore = null;
			}

			if (state.total === 0)
			{
				if (state.header)
				{
					gone.push(state.header);
					state.header = null;
				}
				continue;
			}

			plan.push({ type: 'header', section });
			for (let entry of list.entries)
				plan.push({ type: 'item', section, entry });
			if (state.shown < state.total)
				plan.push({ type: 'showmore', section });
		}

		// a row destroyed while it holds the key focus stays the active item of the menu and logs "already disposed" warnings
		let focus = global.stage.get_key_focus();
		// since GNOME 48 the focus is null, not the stage, when nothing in the Shell has it; that is the case while the menu opens
		let focused = focus ? gone.find(row => row.contains(focus)) : null;
		for (let row of gone)
		{
			if (row !== focused)
				row.destroy();
		}
		if (focused)
		{
			this.section.actor.navigate_focus(focused, St.DirectionType.TAB_FORWARD, true);
			focused.destroy();
		}

		this._plan = plan;
		this._renderRange(0);
	}

	// the first chunk is not deferred, a row that changed its section must not leave a gap for a frame
	_renderRange(from)
	{
		this._cancelChunk();

		let idx = this._renderChunk(from);
		if (idx < 0)
			return;

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

	// building rows is the slow part, so a chunk ends after ten new ones; rows that already exist cost nothing
	_renderChunk(from)
	{
		if (!this._plan)
			return -1;

		let next = this.section.box.get_child_at_index(from);
		let created = 0;
		let i = from;

		for (; i < this._plan.length && created < 10; i++)
		{
			let step = this._plan[i];
			let state = this._state[step.section];
			let row;
			let fresh = false;

			if (step.type === 'header')
			{
				if (!state.header)
				{
					let sec = step.section;
					state.header = new MinimalSectionHeader(
						sec.toUpperCase(),
						this._collapsed[sec],
						(collapsed) => { this._collapsed[sec] = collapsed; });
					fresh = true;
				}
				row = state.header;
				// READ grows up to the retention limit, its count says nothing
				if (step.section !== 'read')
					row.setCount(state.total);
			}
			else if (step.type === 'item')
			{
				let feedTitle = Encoder.htmlDecode(step.entry.source.title);
				row = state.rows.get(step.entry.item);
				if (row)
					row.refresh(feedTitle);
				else
				{
					row = new MinimalArticleItem(step.entry.item, step.entry.source, this._runner, feedTitle);
					state.rows.set(step.entry.item, row);
					state.header.addItem(row);
					fresh = true;
				}
			}
			else
			{
				if (!state.showMore)
				{
					state.showMore = new ShowMoreRow(() => this._append(step.section));
					state.header.addItem(state.showMore);
					fresh = true;
				}
				row = state.showMore;
				row.setCounts(state.shown, state.total);
			}

			// everything before this index is already in its place, next is what the menu has here now
			if (fresh)
			{
				this.section.addMenuItem(row, next ? i : undefined);
				created++;
			}
			else if (row === next)
				next = next.get_next_sibling();
			else
				this.section.moveMenuItem(row, i);
		}

		return i < this._plan.length ? i : -1;
	}

	_append(section)
	{
		let state = this._state ? this._state[section] : null;
		if (!state || !state.showMore)
			return;

		let from = state.shown;
		state.extra += this._displayLimit();
		this._expanded = true;
		this._reconcile();

		let first = this._plan.filter(step => step.type === 'item' && step.section === section)[from];
		if (first)
			state.rows.get(first.entry.item)?.grab_key_focus();
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
