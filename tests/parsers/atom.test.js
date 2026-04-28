import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRssParser } from '../../parsers/factory.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(dir, '../fixtures', name), 'utf-8');

describe('AtomParser', () => {
	let parser;

	beforeAll(() => {
		parser = createRssParser(fixture('atom.xml'));
		parser.parse();
	});

	describe('Publisher', () => {
		it('extracts Title', () => {
			expect(parser.Publisher.Title).toBe('Test Atom Feed');
		});

		it('extracts HttpLink from rel=alternate link', () => {
			expect(parser.Publisher.HttpLink).toBe('https://example.com');
		});

		it('ignores rel=self link for HttpLink', () => {
			expect(parser.Publisher.HttpLink).not.toContain('feed.atom');
		});

		it('extracts PublishDate from updated', () => {
			expect(parser.Publisher.PublishDate).toBe('2024-01-01T00:00:00Z');
		});

		it('has empty Description when no description element', () => {
			expect(parser.Publisher.Description).toBe('');
		});
	});

	describe('Items', () => {
		it('returns 2 entries', () => {
			expect(parser.Items).toHaveLength(2);
		});

		describe('first entry', () => {
			it('extracts Title', () => {
				expect(parser.Items[0].Title).toBe('First Entry');
			});

			it('extracts HttpLink from link href', () => {
				expect(parser.Items[0].HttpLink).toBe('https://example.com/entry/1');
			});

			it('extracts PublishDate from published', () => {
				expect(parser.Items[0].PublishDate).toBe('2024-01-01T12:00:00Z');
			});

			it('extracts UpdateTime from updated', () => {
				expect(parser.Items[0].UpdateTime).toBe('2024-01-02T10:00:00Z');
			});

			it('extracts Author from author/name', () => {
				expect(parser.Items[0].Author).toBe('John Doe');
			});

			it('extracts ID from id element', () => {
				expect(parser.Items[0].ID).toBe('urn:uuid:entry-001');
			});
		});

		describe('second entry', () => {
			it('extracts Author', () => {
				expect(parser.Items[1].Author).toBe('Jane Smith');
			});

			it('extracts ID', () => {
				expect(parser.Items[1].ID).toBe('urn:uuid:entry-002');
			});
		});
	});
});
