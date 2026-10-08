import { describe, it, expect } from 'vitest';
import { FeedSource } from '../../data/feedSource.js';
import { FeedItem } from '../../data/feedItem.js';

const item = (id, over = {}) => FeedItem.restore({ id, link: 'https://x.com/' + id, title: id, read: true, publishDate: '2026-01-01T00:00:00Z', ...over });
const parsedItem = (id, over = {}) => ({ ID: id, Title: id, HttpLink: 'https://x.com/' + id, Description: 'd', PublishDate: '2026-01-01T00:00:00Z', UpdateTime: '', ...over });
const feed = (...items) => ({ Publisher: { Title: 'Pub' }, Items: items });

function makeSource(items = [], config = {}) {
	let source = new FeedSource('https://x.com/feed', config);
	source.items = items;
	source.unreadCount = items.filter(i => !i.read && !i.dismissed).length;
	return source;
}

function track(source, ...names) {
	let counts = {};
	let owner = {};
	for (let name of names) {
		counts[name] = 0;
		source.connectObject(name, () => counts[name]++, owner);
	}
	return counts;
}

describe('FeedSource read state', () => {
	it('markRead and markUnread move the unread count and emit once', () => {
		let a = item('a', { read: false });
		let source = makeSource([a, item('b')]);
		let signals = track(source, 'unread-changed');

		source.markRead(a);
		source.markRead(a);
		expect(source.unreadCount).toBe(0);

		source.markUnread(a);
		source.markUnread(a);
		expect(source.unreadCount).toBe(1);
		expect(signals['unread-changed']).toBe(2);
	});

	it('markAllSeen leaves dismissed articles unread', () => {
		let dismissed = item('d', { read: false, dismissed: true });
		let source = makeSource([item('a', { read: false }), dismissed]);
		source.unreadCount = 1;

		source.markAllSeen();

		expect(source.unreadCount).toBe(0);
		expect(dismissed.read).toBe(false);
	});

	it('markOlderRead marks the older and the same-age articles only', () => {
		let items = [
			item('new', { read: false, publishDate: '2026-03-01T00:00:00Z' }),
			item('mid', { read: false, publishDate: '2026-02-01T00:00:00Z' }),
			item('old', { read: false, publishDate: '2026-01-01T00:00:00Z' }),
		];
		let source = makeSource(items);

		source.markOlderRead(items[1]);

		expect(items.map(i => i.read)).toEqual([false, true, true]);
		expect(source.unreadCount).toBe(1);
	});

	it('markStarredRead reads the starred articles only', () => {
		let starred = item('s', { read: false, starred: true });
		let plain = item('p', { read: false });
		let source = makeSource([starred, plain]);

		source.markStarredRead();

		expect(starred.read).toBe(true);
		expect(plain.read).toBe(false);
		expect(source.unreadCount).toBe(1);
	});
});

describe('FeedSource dismiss and restore', () => {
	it('dismissing an unread article takes it out of the unread count', () => {
		let a = item('a', { read: false });
		let source = makeSource([a]);
		let signals = track(source, 'unread-changed', 'items-changed');

		source.dismiss(a);

		expect(a.dismissed).toBe(true);
		expect(source.unreadCount).toBe(0);
		expect(signals['unread-changed']).toBe(1);
		expect(signals['items-changed']).toBe(1);
	});

	it('dismissing a starred article unstars it', () => {
		let a = item('a', { starred: true });
		let source = makeSource([a]);

		source.dismiss(a);

		expect(a.starred).toBe(false);
		expect(a.dismissed).toBe(true);
	});

	it('dismissing in an archive drops the article instead of marking it', () => {
		let a = item('a', { starred: true });
		let source = makeSource([a]);
		source.archived = true;

		source.dismiss(a);

		expect(source.items).toEqual([]);
		expect(a.dismissed).toBe(false);
	});

	it('restoreDismissed brings the articles back with their unread state', () => {
		let unread = item('u', { read: false, dismissed: true });
		let read = item('r', { dismissed: true });
		let source = makeSource([unread, read, item('x')]);

		expect(source.restoreDismissed()).toBe(2);
		expect(source.items.some(i => i.dismissed)).toBe(false);
		expect(source.unreadCount).toBe(1);
	});

	it('restoreDismissed does nothing and emits nothing without dismissed articles', () => {
		let source = makeSource([item('a')]);
		let signals = track(source, 'items-changed');

		expect(source.restoreDismissed()).toBe(0);
		expect(signals['items-changed']).toBe(0);
	});
});

describe('FeedSource archive', () => {
	it('keeps only the starred articles and reports the removed ones', () => {
		let source = makeSource([item('a', { read: false }), item('b', { starred: true, read: false })]);
		let signals = track(source, 'items-removed');

		source.archive();

		expect(source.archived).toBe(true);
		expect(source.items.map(i => i.id)).toEqual(['b']);
		expect(source.unreadCount).toBe(1);
		expect(signals['items-removed']).toBe(1);
	});

	it('adopt takes over the content of an archive', () => {
		let archived = makeSource([item('a', { starred: true, read: false })]);
		archived.publisherTitle = 'Old';
		let source = makeSource();

		source.adopt(archived);

		expect(source.items).toBe(archived.items);
		expect(source.unreadCount).toBe(1);
		expect(source.publisherTitle).toBe('Old');
	});

	it('ignores a merge that arrives after the archiving', () => {
		let source = makeSource();
		source.archived = true;

		source.merge(feed(parsedItem('a')), { itemsRetained: 10 });

		expect(source.items).toEqual([]);
	});
});

describe('FeedSource merge', () => {
	const opts = { itemsRetained: 10, markInitialAsNew: false };

	it('takes the first merge as read when the initial articles are not new', () => {
		let source = makeSource();
		let signals = track(source, 'items-added', 'unread-changed');

		source.merge(feed(parsedItem('a'), parsedItem('b')), opts);

		expect(source.items).toHaveLength(2);
		expect(source.unreadCount).toBe(0);
		expect(signals['items-added']).toBe(0);
		expect(signals['unread-changed']).toBe(0);
	});

	it('takes the first merge as unread when markInitialAsNew is set', () => {
		let source = makeSource();

		source.merge(feed(parsedItem('a'), parsedItem('b')), { ...opts, markInitialAsNew: true });

		expect(source.unreadCount).toBe(2);
	});

	it('keeps an article unread that was unread before the restart', () => {
		let source = makeSource([], { persistedUnread: ['b'] });

		source.merge(feed(parsedItem('a'), parsedItem('b')), opts);

		expect(source.items.find(i => i.id === 'b').read).toBe(false);
		expect(source.unreadCount).toBe(1);
	});

	it('counts an article added later as unread and announces it', () => {
		let source = makeSource();
		source.merge(feed(parsedItem('a')), opts);
		let events = [];
		source.connectObject('items-added', (_source, data) => events.push(data), {});

		source.merge(feed(parsedItem('b'), parsedItem('a')), opts);

		expect(source.items.map(i => i.id)).toEqual(['b', 'a']);
		expect(source.unreadCount).toBe(1);
		expect(events).toHaveLength(1);
		expect(events[0].initial).toBe(false);
		expect(events[0].items[0].item.id).toBe('b');
	});

	it('does not emit anything when the feed did not change', () => {
		let source = makeSource();
		source.merge(feed(parsedItem('a')), opts);
		let signals = track(source, 'items-changed', 'unread-changed');

		source.merge(feed(parsedItem('a')), opts);

		expect(signals['items-changed']).toBe(0);
	});

	it('takes the publisher title and signals it unless a custom title is set', () => {
		let plain = makeSource();
		let custom = makeSource([], { customTitle: 'Mine' });
		let plainSignals = track(plain, 'meta-changed');
		let customSignals = track(custom, 'meta-changed');

		plain.merge(feed(parsedItem('a')), opts);
		custom.merge(feed(parsedItem('a')), opts);

		expect(plain.publisherTitle).toBe('Pub');
		expect(plainSignals['meta-changed']).toBe(1);
		expect(custom.title).toBe('Mine');
		expect(customSignals['meta-changed']).toBe(0);
	});
});

describe('FeedSource meta', () => {
	it('setError signals only a changed error', () => {
		let source = makeSource();
		let signals = track(source, 'status-changed');

		source.setError('boom');
		source.setError('boom');
		source.setError(null);

		expect(signals['status-changed']).toBe(2);
	});

	it('applyConfig signals a changed title or avatar only', () => {
		let source = makeSource([], { customTitle: 'A' });
		let signals = track(source, 'meta-changed');

		source.applyConfig({ customTitle: 'A', mute: true });
		expect(signals['meta-changed']).toBe(0);

		source.applyConfig({ customTitle: 'B' });
		expect(signals['meta-changed']).toBe(1);
		expect(source.mute).toBe(false);
	});
});
