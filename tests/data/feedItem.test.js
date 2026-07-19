import { describe, it, expect } from 'vitest';
import { FeedItem } from '../../data/feedItem.js';

const data = (over = {}) => ({
	id: 'id-1',
	link: 'http://x/1',
	title: 'Title',
	desc: 'Desc',
	publishDate: '2024-01-01',
	updateTime: '',
	...over,
});

describe('FeedItem', () => {

	describe('constructor', () => {
		it('starts read (unread marking is owned by FeedSource)', () => {
			expect(new FeedItem(data()).read).toBe(true);
		});

		it('passes id and link through unchanged', () => {
			const i = new FeedItem(data({ id: 'guid-9', link: 'http://x/9' }));
			expect(i.id).toBe('guid-9');
			expect(i.link).toBe('http://x/9');
		});

		it('strips html tags from the title', () => {
			expect(new FeedItem(data({ title: '<b>Bold</b> Title' })).title).toBe('Bold Title');
		});

		it('decodes html entities in the title', () => {
			expect(new FeedItem(data({ title: 'Tom &amp; Jerry' })).title).toBe('Tom & Jerry');
		});

		it('trims surrounding whitespace from the title', () => {
			expect(new FeedItem(data({ title: '   spaced   ' })).title).toBe('spaced');
		});

		it('keeps a provided publishDate', () => {
			expect(new FeedItem(data({ publishDate: '2024-06-01' })).publishDate).toBe('2024-06-01');
		});

		it('defaults publishDate to the current time when missing', () => {
			const before = Date.now();
			const i = new FeedItem(data({ publishDate: '' }));
			const t = new Date(i.publishDate).getTime();
			expect(t).toBeGreaterThanOrEqual(before);
			expect(t).toBeLessThanOrEqual(Date.now());
		});

		it('keeps a provided updateTime and defaults it to empty', () => {
			expect(new FeedItem(data({ updateTime: '2024-06-01' })).updateTime).toBe('2024-06-01');
			expect(new FeedItem(data({ updateTime: undefined })).updateTime).toBe('');
		});
	});

	describe('description', () => {
		it('strips CDATA markers', () => {
			expect(new FeedItem(data({ desc: '<![CDATA[hello]]>' })).desc).toBe('hello');
		});

		it('strips tags and trims', () => {
			expect(new FeedItem(data({ desc: '<p>hi <b>there</b></p>' })).desc).toBe('hi there');
		});

		it('returns empty string for empty or missing description', () => {
			expect(new FeedItem(data({ desc: '' })).desc).toBe('');
			expect(new FeedItem(data({ desc: undefined })).desc).toBe('');
		});

		it('keeps a description of 290 characters unchanged', () => {
			const exact = 'a'.repeat(290);
			expect(new FeedItem(data({ desc: exact })).desc).toBe(exact);
		});

		it('truncates a longer description to 290 characters plus an ellipsis', () => {
			const i = new FeedItem(data({ desc: 'a'.repeat(300) }));
			expect(i.desc).toHaveLength(293);
			expect(i.desc.endsWith('...')).toBe(true);
			expect(i.desc.startsWith('a'.repeat(290))).toBe(true);
		});
	});

	describe('update', () => {
		it('replaces link, title, updateTime and description', () => {
			const i = new FeedItem(data());
			i.update(data({ link: 'http://x/new', title: '<i>New</i>', updateTime: '2024-07-01', desc: 'fresh' }));
			expect(i.link).toBe('http://x/new');
			expect(i.title).toBe('New');
			expect(i.updateTime).toBe('2024-07-01');
			expect(i.desc).toBe('fresh');
		});

		it('replaces publishDate when a new one is provided', () => {
			const i = new FeedItem(data({ publishDate: '2024-01-01' }));
			i.update(data({ publishDate: '2024-06-01' }));
			expect(i.publishDate).toBe('2024-06-01');
		});

		it('keeps the old publishDate when the new one is empty', () => {
			const i = new FeedItem(data({ publishDate: '2024-01-01' }));
			i.update(data({ publishDate: '' }));
			expect(i.publishDate).toBe('2024-01-01');
		});

		it('does not touch id or read', () => {
			const i = new FeedItem(data({ id: 'keep' }));
			i.read = false;
			i.update(data({ id: 'ignored', title: 'X' }));
			expect(i.id).toBe('keep');
			expect(i.read).toBe(false);
		});
	});

	describe('restore', () => {
		const persisted = (over = {}) => ({
			id: 'id-1',
			read: false,
			link: 'http://x/1',
			title: 'Title',
			desc: 'Desc',
			publishDate: '2024-01-01',
			updateTime: '',
			...over,
		});

		it('keeps persisted fields verbatim without decoding or stripping them again', () => {
			const i = FeedItem.restore(persisted({ title: '5 < 6 and 7 > 3', desc: 'a &amp; b' }));
			expect(i.title).toBe('5 < 6 and 7 > 3');
			expect(i.desc).toBe('a &amp; b');
		});

		it('restores the read flag', () => {
			expect(FeedItem.restore(persisted({ read: false })).read).toBe(false);
			expect(FeedItem.restore(persisted({ read: true })).read).toBe(true);
		});

		it('returns a FeedItem a later feed merge can update', () => {
			const i = FeedItem.restore(persisted());
			expect(i).toBeInstanceOf(FeedItem);
			i.update(data({ title: '<b>New</b>' }));
			expect(i.title).toBe('New');
		});
	});
});
