import { describe, it, expect } from 'vitest';
import { FeedSource } from '../../data/feedSource.js';
import { FeedStore } from '../../data/feedStore.js';
import { FeedItem } from '../../data/feedItem.js';

const item = (id, over = {}) => FeedItem.restore({ id, link: 'https://x.com/' + id, title: id, read: true, publishDate: '2026-01-01T00:00:00Z', ...over });

function makeSource(url, items = []) {
	let source = new FeedSource(url);
	source.items = items;
	source.unreadCount = items.filter(i => !i.read && !i.dismissed).length;
	return source;
}

function track(store, name) {
	let state = { count: 0 };
	store.connectObject(name, () => state.count++, state);
	return state;
}

describe('FeedStore sources', () => {
	it('sums the unread count of feeds and archives', () => {
		let store = new FeedStore();
		let live = makeSource('live', [item('a', { read: false }), item('b', { read: false })]);
		let archived = makeSource('gone', [item('c', { read: false, starred: true })]);
		archived.archived = true;

		store.addSource(live);
		store.addArchived(archived);

		expect(store.totalUnread).toBe(3);

		live.markRead(live.items[0]);
		expect(store.totalUnread).toBe(2);

		store.removeSource('live');
		expect(store.totalUnread).toBe(1);
	});

	it('counts the feeds that failed', () => {
		let store = new FeedStore();
		let a = makeSource('a');
		let b = makeSource('b');
		store.addSource(a);
		store.addSource(b);

		a.setError('x');
		expect(store.failedCount).toBe(1);

		b.setError('y');
		a.setError(null);
		expect(store.failedCount).toBe(1);
	});

	it('stops listening to a removed source', () => {
		let store = new FeedStore();
		let source = makeSource('a', [item('x', { read: false })]);
		store.addSource(source);
		store.removeSource('a');
		let changes = track(store, 'changed');

		source.markRead(source.items[0]);

		expect(changes.count).toBe(0);
		expect(store.getSource('a')).toBeUndefined();
	});

	it('forwards starred-changed from a feed', () => {
		let store = new FeedStore();
		let source = makeSource('a', [item('x')]);
		store.addSource(source);
		let starred = track(store, 'starred-changed');

		store.toggleStar(source, source.items[0]);

		expect(starred.count).toBe(1);
		expect(store.starredEntries()).toHaveLength(1);
	});

	it('announces a removed feed that still had starred articles', () => {
		let store = new FeedStore();
		store.addSource(makeSource('a', [item('x', { starred: true })]));
		let starred = track(store, 'starred-changed');

		store.removeSource('a');

		expect(starred.count).toBe(1);
	});

	it('reorder puts the listed feeds first and keeps the others at the end', () => {
		let store = new FeedStore();
		for (let url of ['a', 'b', 'c'])
			store.addSource(makeSource(url));
		let reordered = track(store, 'reordered');

		store.reorder(['c', 'zzz', 'a']);
		expect(store.getSources().map(s => s.url)).toEqual(['c', 'a', 'b']);

		store.reorder(['c', 'a', 'b']);
		expect(reordered.count).toBe(1);
	});
});

describe('FeedStore article operations', () => {
	function setup() {
		let store = new FeedStore();
		let a = makeSource('a', [item('a1', { read: false }), item('a2', { read: false, dismissed: true })]);
		let b = makeSource('b', [item('b1', { read: false }), item('b2', { dismissed: true })]);
		store.addSource(a);
		store.addSource(b);
		return { store, a, b };
	}

	it('toggleRead flips the state both ways', () => {
		let { store, a } = setup();

		store.toggleRead(a, a.items[0]);
		expect(a.items[0].read).toBe(true);

		store.toggleRead(a, a.items[0]);
		expect(a.items[0].read).toBe(false);
		expect(store.totalUnread).toBe(2);
	});

	it('markAllSeen clears the unread count of every feed', () => {
		let { store } = setup();

		store.markAllSeen();

		expect(store.totalUnread).toBe(0);
	});

	it('dismissedCount and restoreDismissed cover every feed', () => {
		let { store } = setup();

		expect(store.dismissedCount()).toBe(2);
		expect(store.restoreDismissed()).toBe(2);
		expect(store.dismissedCount()).toBe(0);
		expect(store.totalUnread).toBe(3);
	});

	it('dismiss hides the article from the unread count', () => {
		let { store, a } = setup();

		store.dismiss(a, a.items[0]);

		expect(store.totalUnread).toBe(1);
	});

	it('starredEntries are sorted by the newest first', () => {
		let store = new FeedStore();
		store.addSource(makeSource('a', [item('old', { starred: true, publishDate: '2026-01-01T00:00:00Z' })]));
		store.addSource(makeSource('b', [item('new', { starred: true, publishDate: '2026-02-01T00:00:00Z' })]));

		expect(store.starredEntries().map(e => e.item.id)).toEqual(['new', 'old']);
	});
});
