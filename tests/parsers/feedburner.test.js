import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRssParser } from '../../parsers/factory.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(dir, '../fixtures', name), 'utf-8');

describe('FeedburnerParser', () => {
	let parser;

	beforeAll(() => {
		parser = createRssParser(fixture('feedburner.xml'));
		parser.parse();
	});

	describe('Publisher', () => {
		it('extracts Title', () => {
			expect(parser.Publisher.Title).toBe('Test Feedburner Feed');
		});

		it('extracts HttpLink', () => {
			expect(parser.Publisher.HttpLink).toBe('https://example.com');
		});

		it('extracts Description', () => {
			expect(parser.Publisher.Description).toBe('Test Feedburner feed description');
		});

		it('extracts PublishDate from lastBuildDate', () => {
			expect(parser.Publisher.PublishDate).toBe('Mon, 01 Jan 2024 00:00:00 +0000');
		});
	});

	describe('Items', () => {
		it('returns 1 item', () => {
			expect(parser.Items).toHaveLength(1);
		});

		describe('first item', () => {
			it('extracts Title', () => {
				expect(parser.Items[0].Title).toBe('Feedburner Item');
			});

			it('extracts HttpLink', () => {
				expect(parser.Items[0].HttpLink).toBe('https://example.com/fb/1');
			});

			it('extracts Description', () => {
				expect(parser.Items[0].Description).toBe('Feedburner item description');
			});

			it('extracts PublishDate', () => {
				expect(parser.Items[0].PublishDate).toBe('Mon, 01 Jan 2024 12:00:00 +0000');
			});

			it('extracts Author', () => {
				expect(parser.Items[0].Author).toBe('John Doe');
			});

			it('extracts ID from guid', () => {
				expect(parser.Items[0].ID).toBe('fb-guid-001');
			});
		});
	});
});
