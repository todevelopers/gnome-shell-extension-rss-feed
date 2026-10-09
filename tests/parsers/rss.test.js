import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRssParser } from '../../parsers/factory.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(dir, '../fixtures', name), 'utf-8');

describe('RssParser', () => {
	describe('full feed', () => {
		let parser;

		beforeAll(() => {
			parser = createRssParser(fixture('rss2.xml'));
			parser.parse();
		});

		describe('Publisher', () => {
			it('extracts Title', () => {
				expect(parser.Publisher.Title).toBe('Test RSS Feed');
			});

			it('extracts HttpLink', () => {
				expect(parser.Publisher.HttpLink).toBe('https://example.com');
			});

			it('extracts Description', () => {
				expect(parser.Publisher.Description).toBe('Test RSS feed description');
			});

			it('extracts PublishDate', () => {
				expect(parser.Publisher.PublishDate).toBe('Mon, 01 Jan 2024 00:00:00 +0000');
			});
		});

		describe('Items', () => {
			it('returns 2 items', () => {
				expect(parser.Items).toHaveLength(2);
			});

			describe('first item', () => {
				it('extracts Title', () => {
					expect(parser.Items[0].Title).toBe('First Item');
				});

				it('extracts HttpLink', () => {
					expect(parser.Items[0].HttpLink).toBe('https://example.com/item/1');
				});

				it('extracts Description from CDATA', () => {
					expect(parser.Items[0].Description).toBe('First item body');
				});

				it('extracts PublishDate', () => {
					expect(parser.Items[0].PublishDate).toBe('Mon, 01 Jan 2024 12:00:00 +0000');
				});

				it('extracts Author', () => {
					expect(parser.Items[0].Author).toBe('John Doe');
				});

				it('uses guid as ID', () => {
					expect(parser.Items[0].ID).toBe('guid-001');
				});
			});

			describe('second item (no guid)', () => {
				it('falls back to HttpLink for ID', () => {
					expect(parser.Items[1].ID).toBe('https://example.com/item/2');
				});

				it('extracts Author', () => {
					expect(parser.Items[1].Author).toBe('Jane Smith');
				});
			});
		});
	});

	describe('minimal feed', () => {
		let parser;

		beforeAll(() => {
			parser = createRssParser(fixture('rss2-minimal.xml'));
			parser.parse();
		});

		it('parses single item', () => {
			expect(parser.Items).toHaveLength(1);
		});

		it('Publisher has empty PublishDate when omitted', () => {
			expect(parser.Publisher.PublishDate).toBe('');
		});

		it('item has empty Author when omitted', () => {
			expect(parser.Items[0].Author).toBe('');
		});

		it('item has empty PublishDate when omitted', () => {
			expect(parser.Items[0].PublishDate).toBe('');
		});
	});

	describe('item without a link', () => {
		const item = inner => {
			const parser = createRssParser('<rss version="2.0"><channel><title>Chan</title><item><title>Item</title>' + inner + '</item></channel></rss>');
			parser.parse();
			return parser.Items[0];
		};

		it('takes a guid that is an address as the link', () => {
			expect(item('<guid>https://x.com/post</guid>').HttpLink).toBe('https://x.com/post');
		});

		it('stays without a link when the guid is no address', () => {
			expect(item('<guid>post-1</guid>').HttpLink).toBe('');
		});

		it('keeps its own link when it has one besides the guid', () => {
			expect(item('<guid>https://x.com/?p=1</guid><link>https://x.com/post</link>').HttpLink).toBe('https://x.com/post');
		});
	});
});
