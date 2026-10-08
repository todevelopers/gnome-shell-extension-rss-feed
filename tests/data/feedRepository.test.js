import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import * as GSKeys from '../../gskeys.js';
import { FeedRepository } from '../../data/feedRepository.js';
import { FeedStore } from '../../data/feedStore.js';
import { timeouts, runTimeouts, resetTimeouts, files, resetFiles } from '../gi/GLib.js';

const UUID = 'rss-feed@test';
const A = 'https://a.example/rss';
const B = 'https://b.example/rss';
const GONE = 'https://gone.example/rss';
const FLUSH_DELAY = 2;

const opts = { itemsRetained: 10, markInitialAsNew: false };
const parsedItem = id => ({ ID: id, Title: id, HttpLink: 'https://x.com/' + id, Description: 'd', PublishDate: '2026-01-01T00:00:00Z', UpdateTime: '' });
const feed = (...ids) => ({ Publisher: { Title: 'Pub' }, Items: ids.map(parsedItem) });

const storedItem = (id, over = {}) => ({ id, read: true, link: 'https://x.com/' + id, title: id, desc: 'd', publishDate: '2026-01-01T00:00:00Z', updateTime: '', ...over });
// indented, so a file the repository wrote again is told apart from the one the test stored
const stored = (url, items, over = {}) => JSON.stringify({ version: 2, url, publisherTitle: 'Pub', items, ...over }, null, 2);

const pathOf = url => '/data/' + UUID + '/items/' + createHash('sha256').update(url).digest('hex') + '.json';
const readFile = url => JSON.parse(files.get(pathOf(url)));

function makeSettings(urls, config) {
	let values = {
		[GSKeys.RSS_FEEDS_LIST]: urls,
		[GSKeys.RSS_FEEDS_SETTINGS]: JSON.stringify(config),
	};

	return {
		values,
		get_strv: key => values[key],
		get_string: key => values[key],
		set_string: (key, value) => {
			values[key] = value;
		},
	};
}

async function setup(urls = [A], config = {}) {
	let settings = makeSettings(urls, config);
	let store = new FeedStore();
	let repository = new FeedRepository(settings, UUID);
	await repository.load(store);

	return { settings, store, repository };
}

function setFeeds(settings, urls, config = {}) {
	settings.values[GSKeys.RSS_FEEDS_LIST] = urls;
	settings.values[GSKeys.RSS_FEEDS_SETTINGS] = JSON.stringify(config);
}

beforeEach(() => {
	resetTimeouts();
	resetFiles();
});

describe('FeedRepository saving', () => {
	it('writes a changed feed after the flush delay', async () => {
		let { store } = await setup();

		store.getSource(A).merge(feed('a'), opts);
		expect(files.has(pathOf(A))).toBe(false);

		runTimeouts(FLUSH_DELAY);

		expect(readFile(A)).toEqual({ version: 2, url: A, publisherTitle: 'Pub', items: [storedItem('a')] });
		expect(timeouts.size).toBe(0);
	});

	it('schedules one flush for several changes', async () => {
		let { store } = await setup();
		let source = store.getSource(A);

		source.merge(feed('a'), opts);
		source.markUnread(source.items[0]);

		expect(timeouts.size).toBe(1);
	});

	it('stores the starred and dismissed flags only where they are set', async () => {
		let { store, repository } = await setup();
		let source = store.getSource(A);
		source.merge(feed('a', 'b', 'c'), opts);

		store.toggleStar(source, source.items[0]);
		store.dismiss(source, source.items[1]);
		repository.flushItems();

		let items = readFile(A).items;
		expect(items[0].starred).toBe(true);
		expect(items[1].dismissed).toBe(true);
		expect(items[0]).not.toHaveProperty('dismissed');
		expect(items[2]).not.toHaveProperty('starred');
		expect(items[2]).not.toHaveProperty('dismissed');
		expect(readFile(A)).not.toHaveProperty('archived');
	});

	it('flushItems writes only the changed feeds and drops the scheduled flush', async () => {
		let { store, repository } = await setup([A, B]);

		store.getSource(A).merge(feed('a'), opts);
		repository.flushItems();

		expect(files.has(pathOf(A))).toBe(true);
		expect(files.has(pathOf(B))).toBe(false);
		expect(timeouts.size).toBe(0);
	});

	it('destroy writes the pending changes at once', async () => {
		let { store, repository } = await setup();
		let source = store.getSource(A);
		source.merge(feed('a'), opts);

		repository.destroy();

		expect(readFile(A).items).toHaveLength(1);
		expect(timeouts.size).toBe(0);

		source.markUnread(source.items[0]);
		expect(timeouts.size).toBe(0);
	});
});

describe('FeedRepository loading', () => {
	it('restores the articles with their state', async () => {
		files.set(pathOf(A), stored(A, [storedItem('a', { read: false }), storedItem('b', { starred: true })]));

		let { store } = await setup();
		let source = store.getSource(A);

		expect(source.items.map(i => i.id)).toEqual(['a', 'b']);
		expect(source.items[1].starred).toBe(true);
		expect(source.unreadCount).toBe(1);
		expect(source.publisherTitle).toBe('Pub');
		expect(store.totalUnread).toBe(1);
	});

	it('does not write back a file it has just read', async () => {
		let text = stored(A, [storedItem('a', { read: false })]);
		files.set(pathOf(A), text);

		await setup();
		runTimeouts(FLUSH_DELAY);

		expect(files.get(pathOf(A))).toBe(text);
	});

	it('takes the config of a feed from the settings', async () => {
		let { store } = await setup([A], { [A]: { t: 'Mine', v: 'avatar.png', n: true } });
		let source = store.getSource(A);

		expect(source.customTitle).toBe('Mine');
		expect(source.customAvatar).toBe('avatar.png');
		expect(source.mute).toBe(true);
	});

	it.each(['{oops', 'null', '{"items":"none"}'])('starts a feed empty when its file holds %s', async text => {
		files.set(pathOf(A), text);

		let { store } = await setup();

		expect(store.getSource(A).items).toEqual([]);
	});
});

describe('FeedRepository migration of the legacy unread ids', () => {
	it('keeps an article unread that was unread in the settings', async () => {
		let { store } = await setup([A], { [A]: { t: 'Mine', i: ['b'] } });
		let source = store.getSource(A);

		source.merge(feed('a', 'b'), opts);

		expect(source.items.map(i => i.read)).toEqual([true, false]);
		expect(source.unreadCount).toBe(1);
	});

	it('drops the ids from the settings once the file is written', async () => {
		let { store, repository, settings } = await setup([A], { [A]: { t: 'Mine', i: ['b'] } });
		store.getSource(A).merge(feed('a', 'b'), opts);

		repository.flushItems();

		expect(JSON.parse(settings.values[GSKeys.RSS_FEEDS_SETTINGS])).toEqual({ [A]: { t: 'Mine' } });
		expect(readFile(A).items.map(i => i.read)).toEqual([true, false]);
	});

	it('leaves the ids of a feed that was not written yet', async () => {
		let { store, repository, settings } = await setup([A, B], { [A]: { i: ['a'] }, [B]: { i: ['b'] } });
		store.getSource(A).merge(feed('a'), opts);

		repository.flushItems();

		expect(JSON.parse(settings.values[GSKeys.RSS_FEEDS_SETTINGS])).toEqual({ [A]: {}, [B]: { i: ['b'] } });
	});
});

describe('FeedRepository files without a feed', () => {
	it('deletes the file of a feed that is gone', async () => {
		files.set(pathOf(GONE), stored(GONE, [storedItem('a', { read: false })]));

		let { store } = await setup();

		expect(files.has(pathOf(GONE))).toBe(false);
		expect(store.getArchived()).toEqual([]);
	});

	it('deletes a damaged file', async () => {
		files.set(pathOf(GONE), '{oops');

		await setup();

		expect(files.has(pathOf(GONE))).toBe(false);
	});

	it('keeps the starred articles as an archive', async () => {
		files.set(pathOf(GONE), stored(GONE, [storedItem('a', { read: false }), storedItem('b', { read: false, starred: true })]));

		let { store } = await setup();
		let [archived] = store.getArchived();

		expect(archived.url).toBe(GONE);
		expect(archived.archived).toBe(true);
		expect(archived.items.map(i => i.id)).toEqual(['b']);
		expect(store.getSource(GONE)).toBeUndefined();
		expect(store.totalUnread).toBe(1);

		runTimeouts(FLUSH_DELAY);

		expect(readFile(GONE).archived).toBe(true);
		expect(readFile(GONE).items.map(i => i.id)).toEqual(['b']);
	});

	it('reads an archive back without writing it again', async () => {
		let text = stored(GONE, [storedItem('b', { starred: true })], { archived: true });
		files.set(pathOf(GONE), text);

		let { store } = await setup();
		runTimeouts(FLUSH_DELAY);

		expect(store.getArchived()).toHaveLength(1);
		expect(files.get(pathOf(GONE))).toBe(text);
	});
});

describe('FeedRepository sync', () => {
	it('adds a feed that appeared in the settings', async () => {
		let { store, repository, settings } = await setup();

		setFeeds(settings, [A, B]);

		expect(repository.sync(store)).toBe(true);
		expect(store.getSources().map(s => s.url)).toEqual([A, B]);
		expect(repository.sync(store)).toBe(false);
	});

	it('applies a changed order and config', async () => {
		let { store, repository, settings } = await setup([A, B]);

		setFeeds(settings, [B, A], { [A]: { t: 'Mine' } });
		repository.sync(store);

		expect(store.getSources().map(s => s.url)).toEqual([B, A]);
		expect(store.getSource(A).title).toBe('Mine');
	});

	it('saves the changes of a feed that was added later', async () => {
		let { store, repository, settings } = await setup([]);
		setFeeds(settings, [A]);
		repository.sync(store);

		store.getSource(A).merge(feed('a'), opts);
		runTimeouts(FLUSH_DELAY);

		expect(readFile(A).items).toHaveLength(1);
	});

	it('deletes the file of a removed feed', async () => {
		let { store, repository, settings } = await setup();
		store.getSource(A).merge(feed('a'), opts);
		repository.flushItems();

		setFeeds(settings, []);
		repository.sync(store);

		expect(store.getSources()).toEqual([]);
		expect(store.getArchived()).toEqual([]);
		expect(files.has(pathOf(A))).toBe(false);
	});

	it('archives a removed feed that has starred articles', async () => {
		let { store, repository, settings } = await setup();
		let source = store.getSource(A);
		source.merge(feed('a', 'b'), opts);
		store.toggleStar(source, source.items[1]);
		repository.flushItems();

		setFeeds(settings, []);
		repository.sync(store);

		expect(store.getSources()).toEqual([]);
		expect(store.getArchived()).toEqual([source]);
		expect(source.items.map(i => i.id)).toEqual(['b']);
		expect(files.has(pathOf(A))).toBe(true);

		runTimeouts(FLUSH_DELAY);

		expect(readFile(A).archived).toBe(true);
		expect(readFile(A).items.map(i => i.id)).toEqual(['b']);
	});

	it('gives the archive back to a feed that is added again', async () => {
		files.set(pathOf(A), stored(A, [storedItem('b', { starred: true })], { archived: true }));
		let { store, repository, settings } = await setup([]);

		setFeeds(settings, [A]);
		expect(repository.sync(store)).toBe(true);

		let source = store.getSource(A);
		expect(store.getArchived()).toEqual([]);
		expect(source.archived).toBe(false);
		expect(source.items.map(i => i.id)).toEqual(['b']);
		expect(files.has(pathOf(A))).toBe(true);

		source.merge(feed('c', 'b'), opts);
		repository.flushItems();

		expect(readFile(A)).not.toHaveProperty('archived');
		expect(readFile(A).items.map(i => i.id)).toEqual(['c', 'b']);
	});
});

describe('FeedRepository unstarring an archive', () => {
	async function setupArchive() {
		files.set(pathOf(GONE), stored(GONE, [storedItem('a', { starred: true }), storedItem('b', { starred: true })], { archived: true }));

		let context = await setup();
		return { ...context, archived: context.store.getArchived()[0] };
	}

	it('saves the archive while it still holds a starred article', async () => {
		let { store, archived } = await setupArchive();

		store.toggleStar(archived, archived.items[0]);
		runTimeouts(FLUSH_DELAY);

		expect(store.getArchived()).toEqual([archived]);
		expect(readFile(GONE).items.map(i => i.id)).toEqual(['b']);
	});

	it('deletes the file with the last starred article', async () => {
		let { store, archived } = await setupArchive();

		store.toggleStar(archived, archived.items[0]);
		store.toggleStar(archived, archived.items[0]);

		expect(store.getArchived()).toEqual([]);
		expect(files.has(pathOf(GONE))).toBe(false);
	});

	it('does not write the file back with the flush that was already scheduled', async () => {
		let { store, repository, archived } = await setupArchive();

		store.toggleStar(archived, archived.items[0]);
		store.toggleStar(archived, archived.items[0]);
		runTimeouts(FLUSH_DELAY);
		repository.destroy();

		expect(files.has(pathOf(GONE))).toBe(false);
	});

	it('unstarAll deletes the archive files and keeps the files of the feeds', async () => {
		files.set(pathOf(A), stored(A, [storedItem('x', { starred: true })]));
		let { store, repository } = await setupArchive();

		expect(store.unstarAll()).toBe(3);
		repository.flushItems();

		expect(store.getArchived()).toEqual([]);
		expect(files.has(pathOf(GONE))).toBe(false);
		expect(readFile(A).items[0]).not.toHaveProperty('starred');
	});
});
