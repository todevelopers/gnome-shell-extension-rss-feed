import { describe, it, expect } from 'vitest';
import { sectionOf, newestEntries } from '../../data/articleSections.js';

const item = (id, over = {}) => ({ id, read: true, starred: false, dismissed: false, timestamp: 0, ...over });
const source = (url, items) => ({ url, items });
const ids = list => list.map(e => e.item.id);
const all = () => true;

describe('sectionOf', () => {
	it('puts an unread article into unread', () => {
		expect(sectionOf(item('a', { read: false }))).toBe('unread');
	});

	it('puts a read article into read', () => {
		expect(sectionOf(item('a'))).toBe('read');
	});

	it('puts a starred article into starred whatever its read state', () => {
		expect(sectionOf(item('a', { starred: true }))).toBe('starred');
		expect(sectionOf(item('b', { starred: true, read: false }))).toBe('starred');
	});

	it('has no section for a dismissed article', () => {
		expect(sectionOf(item('a', { dismissed: true }))).toBeNull();
		expect(sectionOf(item('b', { dismissed: true, read: false }))).toBeNull();
	});
});

describe('newestEntries', () => {
	it('returns nothing for no sources or no items', () => {
		expect(newestEntries([], all, 10)).toEqual({ entries: [], total: 0 });
		expect(newestEntries([source('a', [])], all, 10)).toEqual({ entries: [], total: 0 });
	});

	it('sorts newest first across sources', () => {
		const a = source('a', [item('1', { timestamp: 100 }), item('2', { timestamp: 400 })]);
		const b = source('b', [item('3', { timestamp: 300 }), item('4', { timestamp: 200 })]);

		expect(ids(newestEntries([a, b], all, 0).entries)).toEqual(['2', '3', '4', '1']);
	});

	it('pairs each item with its source', () => {
		const a = source('a', [item('1', { timestamp: 100 })]);
		const b = source('b', [item('2', { timestamp: 200 })]);
		const { entries } = newestEntries([a, b], all, 0);

		expect(entries[0].source).toBe(b);
		expect(entries[1].source).toBe(a);
	});

	it('caps the entries at the limit but counts every match', () => {
		const a = source('a', [1, 2, 3, 4, 5].map(n => item('' + n, { timestamp: n })));
		const list = newestEntries([a], all, 2);

		expect(ids(list.entries)).toEqual(['5', '4']);
		expect(list.total).toBe(5);
	});

	it('returns everything when the limit is zero', () => {
		const a = source('a', [1, 2, 3, 4, 5].map(n => item('' + n, { timestamp: n })));
		const list = newestEntries([a], all, 0);

		expect(list.entries).toHaveLength(5);
		expect(list.total).toBe(5);
	});

	it('keeps only the items that match', () => {
		const a = source('a', [item('1', { timestamp: 3, read: false }), item('2', { timestamp: 2 }), item('3', { timestamp: 1, read: false })]);
		const list = newestEntries([a], i => !i.read, 10);

		expect(ids(list.entries)).toEqual(['1', '3']);
		expect(list.total).toBe(2);
	});

	it('hands the source to the predicate', () => {
		const a = source('a', [item('1', { timestamp: 2 })]);
		const b = source('b', [item('2', { timestamp: 1 })]);

		expect(ids(newestEntries([a, b], (_i, s) => s.url === 'b', 10).entries)).toEqual(['2']);
	});

	it('keeps the scan order for equal timestamps', () => {
		const a = source('a', [item('1', { timestamp: 5 }), item('2', { timestamp: 5 })]);
		const b = source('b', [item('3', { timestamp: 5 })]);

		expect(ids(newestEntries([a, b], all, 0).entries)).toEqual(['1', '2', '3']);
	});

	it('finds the newest items wherever they are in a long scan', () => {
		const stamps = [7, 3, 19, 1, 12, 20, 5, 16, 2, 11, 9, 18, 4, 15, 8, 13, 6, 17, 10, 14];
		const a = source('a', stamps.slice(0, 10).map(n => item('' + n, { timestamp: n })));
		const b = source('b', stamps.slice(10).map(n => item('' + n, { timestamp: n })));
		const list = newestEntries([a, b], all, 3);

		expect(ids(list.entries)).toEqual(['20', '19', '18']);
		expect(list.total).toBe(20);
	});

	it('starts a longer list with the shorter one', () => {
		const stamps = [4, 9, 4, 7, 9, 1, 7, 4, 9, 2, 7, 4];
		const a = source('a', stamps.map((n, i) => item('i' + i, { timestamp: n })));
		const short = ids(newestEntries([a], all, 3).entries);
		const long = ids(newestEntries([a], all, 6).entries);

		expect(long.slice(0, 3)).toEqual(short);
	});

	it('treats items without a usable date as the oldest', () => {
		const a = source('a', [item('undated'), item('dated', { timestamp: 100 })]);

		expect(ids(newestEntries([a], all, 0).entries)).toEqual(['dated', 'undated']);
	});
});

describe('sections of one list', () => {
	const a = source('a', [
		item('unread', { timestamp: 6, read: false }),
		item('read', { timestamp: 5 }),
		item('star', { timestamp: 4, starred: true }),
		item('star-unread', { timestamp: 3, starred: true, read: false }),
		item('gone', { timestamp: 2, dismissed: true }),
		item('gone-unread', { timestamp: 1, dismissed: true, read: false }),
	]);
	const section = name => ids(newestEntries([a], i => sectionOf(i) === name, 0).entries);

	it('shows a starred article only among the starred ones', () => {
		expect(section('starred')).toEqual(['star', 'star-unread']);
		expect(section('unread')).toEqual(['unread']);
		expect(section('read')).toEqual(['read']);
	});

	it('shows a dismissed article nowhere', () => {
		const shown = [...section('starred'), ...section('unread'), ...section('read')];

		expect(shown).not.toContain('gone');
		expect(shown).not.toContain('gone-unread');
		expect(shown).toHaveLength(4);
	});
});
