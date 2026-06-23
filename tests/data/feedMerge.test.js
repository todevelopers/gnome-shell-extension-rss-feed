import { describe, it, expect } from 'vitest';
import { computeFeedDiff } from '../../data/feedMerge.js';

const item = (id, publishDate = '', updateTime = '') => ({ id, publishDate, updateTime, title: 't-' + id });
const opts = (over = {}) => ({ disableUpdates: false, itemsRetained: 100, ...over });
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

	describe('removed', () => {
		it('reports a cached item whose id is gone from the parse', () => {
			const r = computeFeedDiff([item('a'), item('b')], [item('a')], opts());
			expect(ids(r.removed)).toEqual(['b']);
			expect(r.added).toEqual([]);
		});

		it('reports a cached item pushed out of the itemsRetained window', () => {
			const r = computeFeedDiff([item('c')], [item('a'), item('b'), item('c')], opts({ itemsRetained: 2 }));
			expect(ids(r.removed)).toEqual(['c']);
			expect(ids(r.added)).toEqual(['a', 'b']);
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

		it('ignores a changed date when updates are disabled', () => {
			const r = computeFeedDiff([item('a', '2024-01-01')], [item('a', '2024-06-01')], opts({ disableUpdates: true }));
			expect(r.updated).toEqual([]);
			expect(r.added).toEqual([]);
			expect(r.removed).toEqual([]);
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
