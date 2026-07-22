import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parseOpml, buildOpml } from '../opml.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(dir, 'fixtures', name), 'utf-8');

describe('parseOpml', () => {
	it('parses a flat file with no folders', () => {
		expect(parseOpml(fixture('opml-flat.opml'))).toEqual([
			{ url: 'https://arstechnica.com/feed/', title: 'Ars Technica', folder: '' },
			{ url: 'https://www.theverge.com/rss/index.xml', title: 'The Verge', folder: '' },
			{ url: 'https://news.ycombinator.com/rss', title: 'Hacker News', folder: '' },
		]);
	});

	it('parses one-level folders', () => {
		expect(parseOpml(fixture('opml-folders.opml'))).toEqual([
			{ url: 'https://arstechnica.com/feed/', title: 'Ars Technica', folder: 'Tech' },
			{ url: 'https://www.theverge.com/rss/index.xml', title: 'The Verge', folder: 'Tech' },
			{ url: 'https://feeds.bbci.co.uk/news/rss.xml', title: 'BBC', folder: 'News' },
		]);
	});

	it('collapses two-level nesting to the top-level folder name', () => {
		expect(parseOpml(fixture('opml-nested.opml'))).toEqual([
			{ url: 'https://arstechnica.com/feed/', title: 'Ars Technica', folder: 'Tech' },
			{ url: 'https://www.theverge.com/rss/index.xml', title: 'The Verge', folder: 'Tech' },
		]);
	});

	it('preserves document order for mixed foldered and top-level feeds', () => {
		expect(parseOpml(fixture('opml-mixed.opml'))).toEqual([
			{ url: 'https://example.com/daily', title: 'Daily', folder: '' },
			{ url: 'https://arstechnica.com/feed/', title: 'Ars Technica', folder: 'Tech' },
			{ url: 'https://example.com/weekly', title: 'Weekly', folder: '' },
		]);
	});

	it('matches xmlUrl case-insensitively', () => {
		expect(parseOpml(
			'<opml version="2.0"><body>' +
			'<outline text="Foo" xmlurl="https://foo.example/rss"/>' +
			'</body></opml>')).toEqual([
			{ url: 'https://foo.example/rss', title: 'Foo', folder: '' },
		]);
	});

	it('handles both self-closed and paired outline forms', () => {
		expect(parseOpml(
			'<opml version="2.0"><body>' +
			'<outline text="A" type="rss" xmlUrl="https://a.example/rss"/>' +
			'<outline text="B" type="rss" xmlUrl="https://b.example/rss"></outline>' +
			'</body></opml>')).toEqual([
			{ url: 'https://a.example/rss', title: 'A', folder: '' },
			{ url: 'https://b.example/rss', title: 'B', folder: '' },
		]);
	});

	it('falls back to title when text is missing', () => {
		let feeds = parseOpml(
			'<opml version="2.0"><body>' +
			'<outline title="Only Title" xmlUrl="https://x.example/rss"/>' +
			'</body></opml>');
		expect(feeds[0].title).toBe('Only Title');
	});

	it('yields an empty title when neither text nor title is present', () => {
		let feeds = parseOpml(
			'<opml version="2.0"><body>' +
			'<outline xmlUrl="https://x.example/rss"/>' +
			'</body></opml>');
		expect(feeds[0].title).toBe('');
	});

	it('decodes entities in titles and URLs', () => {
		expect(parseOpml(
			'<opml version="2.0"><body>' +
			'<outline text="Tom &amp; Jerry" xmlUrl="https://x.example/rss?a=1&amp;b=2"/>' +
			'</body></opml>')).toEqual([
			{ url: 'https://x.example/rss?a=1&b=2', title: 'Tom & Jerry', folder: '' },
		]);
	});

	it('deduplicates repeated URLs, keeping the first occurrence', () => {
		expect(parseOpml(
			'<opml version="2.0"><body>' +
			'<outline text="First" xmlUrl="https://dup.example/rss"/>' +
			'<outline text="Second" xmlUrl="https://dup.example/rss"/>' +
			'</body></opml>')).toEqual([
			{ url: 'https://dup.example/rss', title: 'First', folder: '' },
		]);
	});

	it('keeps the folder of the first occurrence when a URL repeats', () => {
		expect(parseOpml(
			'<opml version="2.0"><body>' +
			'<outline text="Tech" title="Tech">' +
			'<outline text="First" xmlUrl="https://dup.example/rss"/>' +
			'</outline>' +
			'<outline text="Second" xmlUrl="https://dup.example/rss"/>' +
			'</body></opml>')).toEqual([
			{ url: 'https://dup.example/rss', title: 'First', folder: 'Tech' },
		]);
	});

	it('returns an empty array for a file without a body', () => {
		expect(parseOpml('<opml version="2.0"><head><title>x</title></head></opml>')).toEqual([]);
	});

	it('returns an empty array when there are no feeds', () => {
		expect(parseOpml('<opml version="2.0"><body></body></opml>')).toEqual([]);
	});

	it('returns an empty array when the root is not opml', () => {
		expect(parseOpml('<html><body></body></html>')).toEqual([]);
	});
});

describe('buildOpml', () => {
	it('escapes special characters in attribute values', () => {
		let opml = buildOpml([
			{ url: 'https://x.example/rss?a=1&b=2', title: 'A & B <"C">', folder: '' },
		]);
		expect(opml).toContain('text="A &amp; B &lt;&quot;C&quot;&gt;"');
		expect(opml).toContain('xmlUrl="https://x.example/rss?a=1&amp;b=2"');
	});

	it('groups feeds into folders by first occurrence', () => {
		let opml = buildOpml([
			{ url: 'https://a.example/rss', title: 'A', folder: 'Tech' },
			{ url: 'https://b.example/rss', title: 'B', folder: '' },
			{ url: 'https://c.example/rss', title: 'C', folder: 'Tech' },
		]);
		expect(parseOpml(opml)).toEqual([
			{ url: 'https://a.example/rss', title: 'A', folder: 'Tech' },
			{ url: 'https://c.example/rss', title: 'C', folder: 'Tech' },
			{ url: 'https://b.example/rss', title: 'B', folder: '' },
		]);
	});
});

describe('round-trip', () => {
	it('parseOpml(buildOpml(feeds)) preserves feeds with contiguous folders', () => {
		let feeds = [
			{ url: 'https://a.example/rss', title: 'Ars & Co', folder: 'Tech' },
			{ url: 'https://b.example/rss', title: 'The Verge', folder: 'Tech' },
			{ url: 'https://c.example/rss', title: 'BBC', folder: 'News' },
			{ url: 'https://d.example/rss', title: 'Daily', folder: '' },
		];
		expect(parseOpml(buildOpml(feeds))).toEqual(feeds);
	});
});
