import { describe, it, expect } from 'vitest';
import { countUnread, olderItems, countDismissed, collectStarred, classifyOrphan } from '../../data/articleState.js';

const item = (id, over = {}) => ({ id, read: true, starred: false, dismissed: false, timestamp: 0, ...over });
const ids = list => list.map(x => x.id);

describe('countUnread', () => {
	it('counts the items that are not read', () => {
		expect(countUnread([item('a', { read: false }), item('b'), item('c', { read: false })])).toBe(2);
	});

	it('leaves out a dismissed item even when it is unread', () => {
		expect(countUnread([item('a', { read: false, dismissed: true }), item('b', { read: false })])).toBe(1);
	});

	it('counts an unread starred item', () => {
		expect(countUnread([item('a', { read: false, starred: true })])).toBe(1);
	});

	it('is zero for an empty list', () => {
		expect(countUnread([])).toBe(0);
	});
});

describe('olderItems', () => {
	const items = [
		item('new', { timestamp: 300 }),
		item('mid', { timestamp: 200 }),
		item('old', { timestamp: 100 }),
	];

	it('returns the item itself and everything older', () => {
		expect(ids(olderItems(items, items[1]))).toEqual(['mid', 'old']);
	});

	it('returns only the item when nothing is older', () => {
		expect(ids(olderItems(items, items[2]))).toEqual(['old']);
	});

	it('includes an item with the same timestamp', () => {
		const twin = item('twin', { timestamp: 200 });
		expect(ids(olderItems([...items, twin], items[1]))).toEqual(['mid', 'old', 'twin']);
	});

	it('does not depend on the order of the list', () => {
		const shuffled = [items[2], items[0], items[1]];
		expect(ids(olderItems(shuffled, items[1]))).toEqual(['old', 'mid']);
	});

	it('treats items without a usable date as the oldest', () => {
		const undated = item('undated', { timestamp: 0 });
		expect(ids(olderItems([...items, undated], items[2]))).toEqual(['old', 'undated']);
		expect(ids(olderItems([...items, undated], undated))).toEqual(['undated']);
	});

	it('leaves out a dismissed item', () => {
		const hidden = item('hidden', { timestamp: 150, dismissed: true });
		expect(ids(olderItems([...items, hidden], items[1]))).toEqual(['mid', 'old']);
	});
});

describe('countDismissed', () => {
	it('counts the dismissed items whatever their read state', () => {
		expect(countDismissed([item('a', { dismissed: true }), item('b', { read: false, dismissed: true }), item('c')])).toBe(2);
	});

	it('is zero when nothing is dismissed', () => {
		expect(countDismissed([item('a'), item('b', { read: false })])).toBe(0);
		expect(countDismissed([])).toBe(0);
	});
});

describe('collectStarred', () => {
	const source = (url, items) => ({ url, items });

	it('returns nothing when no item is starred', () => {
		expect(collectStarred([source('a', [item('1'), item('2')])])).toEqual([]);
		expect(collectStarred([])).toEqual([]);
	});

	it('pairs each starred item with its source', () => {
		const a = source('a', [item('1', { starred: true }), item('2')]);
		const b = source('b', [item('3'), item('4', { starred: true })]);
		const entries = collectStarred([a, b]);

		expect(entries).toHaveLength(2);
		expect(entries.find(e => e.item.id === '1').source).toBe(a);
		expect(entries.find(e => e.item.id === '4').source).toBe(b);
	});

	it('sorts the entries newest first across sources', () => {
		const a = source('a', [item('1', { starred: true, timestamp: 100 }), item('2', { starred: true, timestamp: 400 })]);
		const b = source('b', [item('3', { starred: true, timestamp: 300 }), item('4', { starred: true, timestamp: 200 })]);

		expect(ids(collectStarred([a, b]).map(e => e.item))).toEqual(['2', '3', '4', '1']);
	});

	it('keeps the same id from two feeds apart', () => {
		const a = source('a', [item('x', { starred: true, timestamp: 200 })]);
		const b = source('b', [item('x', { starred: true, timestamp: 100 })]);

		expect(collectStarred([a, b]).map(e => e.source.url)).toEqual(['a', 'b']);
	});

	it('skips the items that are not starred, whatever their other flags', () => {
		const a = source('a', [item('1', { starred: true, read: false }), item('2', { dismissed: true })]);
		expect(ids(collectStarred([a]).map(e => e.item))).toEqual(['1']);
	});
});

describe('classifyOrphan', () => {
	const file = (over = {}) => ({ version: 2, url: 'http://x/feed', publisherTitle: 'X', items: [], ...over });

	it('archives a file that holds a starred item', () => {
		expect(classifyOrphan(file({ items: [{ id: 'a' }, { id: 'b', starred: true }] }))).toBe('archive');
	});

	it('deletes a file without starred items', () => {
		expect(classifyOrphan(file({ items: [{ id: 'a' }, { id: 'b', starred: false }] }))).toBe('delete');
		expect(classifyOrphan(file())).toBe('delete');
	});

	it('deletes a file written before the flag existed', () => {
		expect(classifyOrphan({ version: 1, url: 'http://x/feed', items: [{ id: 'a', read: false }] })).toBe('delete');
	});

	it('deletes content that is not an item file', () => {
		expect(classifyOrphan(null)).toBe('delete');
		expect(classifyOrphan(undefined)).toBe('delete');
		expect(classifyOrphan('text')).toBe('delete');
		expect(classifyOrphan([])).toBe('delete');
		expect(classifyOrphan({})).toBe('delete');
	});

	it('deletes a file whose items are not a list', () => {
		expect(classifyOrphan(file({ items: { starred: true } }))).toBe('delete');
	});

	it('deletes a file that does not name its feed', () => {
		expect(classifyOrphan({ items: [{ id: 'a', starred: true }] })).toBe('delete');
		expect(classifyOrphan(file({ url: 42, items: [{ id: 'a', starred: true }] }))).toBe('delete');
	});

	it('survives broken entries in the item list', () => {
		expect(classifyOrphan(file({ items: [null, 'x', { id: 'a', starred: true }] }))).toBe('archive');
		expect(classifyOrphan(file({ items: [null, 'x'] }))).toBe('delete');
	});

	it('ignores top-level keys it does not know', () => {
		expect(classifyOrphan(file({ stats: { opened: 3 }, items: [{ id: 'a', starred: true }] }))).toBe('archive');
	});
});
