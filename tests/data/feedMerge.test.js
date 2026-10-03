import { describe, it, expect } from 'vitest';
import { computeFeedDiff } from '../../data/feedMerge.js';

const item = (id, publishDate = '', updateTime = '') => ({ id, publishDate, updateTime, title: 't-' + id });
const opts = (over = {}) => ({ itemsRetained: 100, ...over });
const ids = list => list.map(x => x.id);

describe('computeFeedDiff', () => {

	describe('added', () => {
		it('reports a parsed item whose id is not in the cache', () => {
			const r = computeFeedDiff([item('a')], [item('a'), item('b')], opts());
			expect(ids(r.added)).toEqual(['b']);
			expect(r.removed).toEqual([]);
			expect(r.updated).toEqual([]);
		});

		it('reports every parsed item as added when the cache is empty, in feed order', () => {
			const r = computeFeedDiff([], [item('a'), item('b'), item('c')], opts());
			expect(ids(r.added)).toEqual(['a', 'b', 'c']);
		});

		it('keeps only the first of duplicate ids within one parse', () => {
			const parsed = [
				{ id: 'a', publishDate: '', updateTime: '', title: 'first' },
				{ id: 'a', publishDate: '', updateTime: '', title: 'second' }
			];
			const r = computeFeedDiff([], parsed, opts());
			expect(r.added).toHaveLength(1);
			expect(r.added[0].title).toBe('first');
		});
	});

	describe('history', () => {
		it('keeps a cached item whose id is gone from the parse', () => {
			const r = computeFeedDiff([item('a'), item('b')], [item('a')], opts());
			expect(r.removed).toEqual([]);
			expect(r.added).toEqual([]);
		});

		it('does not report a cached item that returns to the parse as added', () => {
			const r = computeFeedDiff([item('c'), item('a'), item('b')], [item('b'), item('c')], opts());
			expect(r.added).toEqual([]);
			expect(r.removed).toEqual([]);
			expect(r.updated).toEqual([]);
		});
	});

	describe('removed', () => {
		it('reports a cached item pushed out of the itemsRetained window', () => {
			const r = computeFeedDiff([item('c')], [item('a'), item('b'), item('c')], opts({ itemsRetained: 2 }));
			expect(ids(r.removed)).toEqual(['c']);
			expect(ids(r.added)).toEqual(['a', 'b']);
		});

		it('evicts from the end of the cache, only as many as the overflow', () => {
			const r = computeFeedDiff(
				[item('c'), item('b'), item('a')],
				[item('e'), item('d')],
				opts({ itemsRetained: 4 }));
			expect(ids(r.added)).toEqual(['e', 'd']);
			expect(ids(r.removed)).toEqual(['a']);
		});

		it('skips an item that is still in the parse even when it is the oldest', () => {
			const r = computeFeedDiff(
				[item('c'), item('b'), item('a')],
				[item('d'), item('a')],
				opts({ itemsRetained: 3 }));
			expect(ids(r.added)).toEqual(['d']);
			expect(ids(r.removed)).toEqual(['b']);
		});

		it('trims the cache when the limit was lowered', () => {
			const r = computeFeedDiff(
				[item('d'), item('c'), item('b'), item('a')],
				[item('d')],
				opts({ itemsRetained: 2 }));
			expect(r.added).toEqual([]);
			expect(ids(r.removed)).toEqual(['a', 'b']);
		});

		it('stays stable for a feed that carries more items than the limit', () => {
			const parsed = [item('a'), item('b'), item('c')];
			const r = computeFeedDiff([item('a'), item('b')], parsed, opts({ itemsRetained: 2 }));
			expect(r.added).toEqual([]);
			expect(r.removed).toEqual([]);
		});
	});

	describe('starred', () => {
		const starred = id => ({ ...item(id), starred: true });

		it('does not count a starred item towards the limit', () => {
			const r = computeFeedDiff(
				[item('c'), starred('b'), item('a')],
				[item('c')],
				opts({ itemsRetained: 2 }));
			expect(r.removed).toEqual([]);
			expect(r.added).toEqual([]);
		});

		it('never evicts a starred item, even the oldest one', () => {
			const r = computeFeedDiff(
				[item('c'), item('b'), starred('a')],
				[item('e'), item('d')],
				opts({ itemsRetained: 2 }));
			expect(ids(r.added)).toEqual(['e', 'd']);
			expect(ids(r.removed)).toEqual(['b', 'c']);
		});

		it('keeps every starred item when the limit is lower than their count', () => {
			const r = computeFeedDiff(
				[starred('d'), starred('c'), starred('b'), item('a')],
				[item('e')],
				opts({ itemsRetained: 1 }));
			expect(ids(r.added)).toEqual(['e']);
			expect(ids(r.removed)).toEqual(['a']);
		});

		it('evicts an item again once it is no longer starred', () => {
			const existing = [item('c'), item('b'), starred('a')];
			const parsed = [item('c'), item('b')];

			expect(computeFeedDiff(existing, parsed, opts({ itemsRetained: 2 })).removed).toEqual([]);

			existing[2].starred = false;
			expect(ids(computeFeedDiff(existing, parsed, opts({ itemsRetained: 2 })).removed)).toEqual(['a']);
		});

		it('still keeps an unstarred item that is in the parse', () => {
			const r = computeFeedDiff(
				[item('d'), starred('c'), item('b'), item('a')],
				[item('d'), item('a')],
				opts({ itemsRetained: 2 }));
			expect(r.added).toEqual([]);
			expect(ids(r.removed)).toEqual(['b']);
		});

		it('evicts only the items that are neither starred nor in the parse', () => {
			const r = computeFeedDiff(
				[item('f'), starred('e'), item('d'), starred('c'), item('b'), item('a')],
				[item('g'), item('f'), item('b')],
				opts({ itemsRetained: 3 }));
			expect(ids(r.added)).toEqual(['g']);
			expect(ids(r.removed)).toEqual(['a', 'd']);
		});

		it('does not report a starred item that is still in the parse as added', () => {
			const r = computeFeedDiff([starred('a')], [item('a'), item('b')], opts({ itemsRetained: 2 }));
			expect(ids(r.added)).toEqual(['b']);
			expect(r.removed).toEqual([]);
		});
	});

	describe('unchanged — no bucket', () => {
		it('ignores a matching id with identical dates', () => {
			const r = computeFeedDiff([item('a', '2024-01-01')], [item('a', '2024-01-01')], opts());
			expect(r.added).toEqual([]);
			expect(r.removed).toEqual([]);
			expect(r.updated).toEqual([]);
		});

		it('ignores dates that differ only in format for the same instant', () => {
			const r = computeFeedDiff(
				[item('a', '2024-01-01T00:00:00Z')],
				[item('a', '2024-01-01T00:00:00+00:00')],
				opts());
			expect(r.updated).toEqual([]);
			expect(r.added).toEqual([]);
		});
	});

	describe('updated', () => {
		it('reports a changed publishDate and carries the new data', () => {
			const r = computeFeedDiff([item('a', '2024-01-01')], [item('a', '2024-06-01')], opts());
			expect(ids(r.updated)).toEqual(['a']);
			expect(r.updated[0].publishDate).toBe('2024-06-01');
			expect(r.added).toEqual([]);
			expect(r.removed).toEqual([]);
		});

		it('reports a changed updateTime', () => {
			const r = computeFeedDiff([item('a', '', '2024-01-01')], [item('a', '', '2024-06-01')], opts());
			expect(ids(r.updated)).toEqual(['a']);
		});

		it('reports an updateTime that appears where there was none', () => {
			const r = computeFeedDiff([item('a', '', '')], [item('a', '', '2024-06-01')], opts());
			expect(ids(r.updated)).toEqual(['a']);
		});

		it('does not report a publishDate that disappears while updateTime stays equal', () => {
			const r = computeFeedDiff([item('a', '2024-01-01', '')], [item('a', '', '')], opts());
			expect(r.updated).toEqual([]);
			expect(r.added).toEqual([]);
			expect(r.removed).toEqual([]);
		});

		it('reports a publishDate that appears where there was none', () => {
			const r = computeFeedDiff([item('a', '', '')], [item('a', '2024-06-01', '')], opts());
			expect(ids(r.updated)).toEqual(['a']);
		});
	});

	describe('date normalization edges', () => {
		it('treats equal unparseable date strings as unchanged', () => {
			const r = computeFeedDiff([item('a', 'not-a-date')], [item('a', 'not-a-date')], opts());
			expect(r.updated).toEqual([]);
		});

		it('treats different unparseable date strings as an update', () => {
			const r = computeFeedDiff([item('a', 'garbage-1')], [item('a', 'garbage-2')], opts());
			expect(ids(r.updated)).toEqual(['a']);
		});
	});

	describe('itemsRetained capping', () => {
		it('classifies only the first itemsRetained parsed items as added', () => {
			const r = computeFeedDiff([], [item('a'), item('b'), item('c')], opts({ itemsRetained: 2 }));
			expect(ids(r.added)).toEqual(['a', 'b']);
		});
	});

	describe('empty parse — no-op (failed/empty fetch keeps the cache)', () => {
		it('removes nothing when the parse is empty', () => {
			const r = computeFeedDiff([item('a'), item('b'), item('c')], [], opts());
			expect(r.removed).toEqual([]);
			expect(r.added).toEqual([]);
			expect(r.updated).toEqual([]);
		});

		it('does nothing when itemsRetained is zero', () => {
			const r = computeFeedDiff([item('a')], [item('b')], opts({ itemsRetained: 0 }));
			expect(r.removed).toEqual([]);
			expect(r.added).toEqual([]);
			expect(r.updated).toEqual([]);
		});
	});

});
