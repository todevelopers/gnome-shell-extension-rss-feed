import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRssParser } from '../../parsers/factory.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(dir, '../fixtures', name), 'utf-8');

describe('RdfParser', () => {
	let parser;

	beforeAll(() => {
		parser = createRssParser(fixture('rdf.xml'));
		parser.parse();
	});

	describe('Publisher', () => {
		it('extracts Title', () => {
			expect(parser.Publisher.Title).toBe('Test RDF Feed');
		});

		it('extracts HttpLink', () => {
			expect(parser.Publisher.HttpLink).toBe('https://example.com');
		});

		it('extracts Description', () => {
			expect(parser.Publisher.Description).toBe('Test RDF feed description');
		});

		it('extracts PublishDate from dc:date', () => {
			expect(parser.Publisher.PublishDate).toBe('2024-01-01T00:00:00Z');
		});
	});

	describe('Items', () => {
		it('returns 2 items', () => {
			expect(parser.Items).toHaveLength(2);
		});

		describe('first item', () => {
			it('extracts Title', () => {
				expect(parser.Items[0].Title).toBe('RDF Item One');
			});

			it('extracts HttpLink', () => {
				expect(parser.Items[0].HttpLink).toBe('https://example.com/rdf/1');
			});

			it('extracts Description', () => {
				expect(parser.Items[0].Description).toBe('RDF item one description');
			});

			it('extracts PublishDate from dc:date', () => {
				expect(parser.Items[0].PublishDate).toBe('2024-01-01T12:00:00Z');
			});

			it('extracts Author from dc:creator', () => {
				expect(parser.Items[0].Author).toBe('John Doe');
			});

			it('falls back to HttpLink for ID when no guid', () => {
				expect(parser.Items[0].ID).toBe('https://example.com/rdf/1');
			});
		});

		describe('second item', () => {
			it('extracts Author from dc:creator', () => {
				expect(parser.Items[1].Author).toBe('Jane Smith');
			});

			it('falls back to HttpLink for ID', () => {
				expect(parser.Items[1].ID).toBe('https://example.com/rdf/2');
			});
		});
	});
});
