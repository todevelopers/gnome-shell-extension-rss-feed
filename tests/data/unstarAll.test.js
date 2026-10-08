import { describe, it, expect } from 'vitest';
import { FeedSource } from '../../data/feedSource.js';
import { FeedStore } from '../../data/feedStore.js';
import { FeedItem } from '../../data/feedItem.js';

const item = (id, over = {}) => FeedItem.restore({ id, link: 'https://x.com/' + id, title: id, read: true, ...over });

function makeSource(url, items, archived = false) {
	let source = new FeedSource(url);
	source.items = items;
	source.archived = archived;
	return source;
}

function track(target, name) {
	let state = { count: 0 };
	target.connectObject(name, () => state.count++, state);
	return state;
}

describe('FeedSource.unstarAll', () => {
	it('unstars every starred article and returns how many it was', () => {
		let source = makeSource('a', [item('1', { starred: true }), item('2'), item('3', { starred: true })]);

		expect(source.unstarAll()).toBe(2);
		expect(source.items.map(i => i.starred)).toEqual([false, false, false]);
	});

	it('returns 0 and emits nothing when no article is starred', () => {
		let source = makeSource('a', [item('1')]);
		let changed = track(source, 'starred-changed');

		expect(source.unstarAll()).toBe(0);
		expect(changed.count).toBe(0);
	});

	it('emits starred-changed', () => {
		let source = makeSource('a', [item('1', { starred: true })]);
		let changed = track(source, 'starred-changed');

		source.unstarAll();

		expect(changed.count).toBeGreaterThan(0);
	});

	it('empties an archived source, which has no feed to return the articles to', () => {
		let source = makeSource('a', [item('1', { starred: true }), item('2', { starred: true }), item('3', { starred: true })], true);

		expect(source.unstarAll()).toBe(3);
		expect(source.items).toEqual([]);
	});

	it('keeps the unread count of an archived source in line', () => {
		let source = makeSource('a', [item('1', { starred: true, read: false })], true);
		source.unreadCount = 1;

		source.unstarAll();

		expect(source.unreadCount).toBe(0);
	});
});

describe('FeedStore starred', () => {
	function makeStore() {
		let store = new FeedStore();
		let live = makeSource('live', [item('1', { starred: true }), item('2')]);
		let archived = makeSource('gone', [item('3', { starred: true })], true);
		store.addSource(live);
		store.addArchived(archived);
		return { store, live, archived };
	}

	it('counts the starred articles of feeds and archives', () => {
		expect(makeStore().store.starredCount()).toBe(2);
	});

	it('unstarAll clears both and reports the total', () => {
		let { store, live, archived } = makeStore();

		expect(store.unstarAll()).toBe(2);
		expect(store.starredCount()).toBe(0);
		expect(live.items.map(i => i.id)).toEqual(['1', '2']);
		expect(archived.items).toEqual([]);
	});

	it('unstarAll is 0 on an empty store', () => {
		expect(new FeedStore().unstarAll()).toBe(0);
	});
});
