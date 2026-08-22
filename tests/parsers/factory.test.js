import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRssParser, describeParseFailure } from '../../parsers/factory.js';

const dir = dirname(fileURLToPath(import.meta.url));
const fixture = name => readFileSync(join(dir, '../fixtures', name), 'utf-8');

describe('createRssParser', () => {
	it('returns a parser for RSS 2.0', () => {
		expect(createRssParser(fixture('rss2.xml'))).not.toBeNull();
	});

	it('returns a parser for Atom', () => {
		expect(createRssParser(fixture('atom.xml'))).not.toBeNull();
	});

	it('returns a parser for RDF', () => {
		expect(createRssParser(fixture('rdf.xml'))).not.toBeNull();
	});

	it('returns a parser for Feedburner', () => {
		expect(createRssParser(fixture('feedburner.xml'))).not.toBeNull();
	});

	it('returns null for unrecognized XML', () => {
		expect(createRssParser('<unknown/>')).toBeNull();
	});

	it('strips XML declaration before parsing', () => {
		const xml = '<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>X</title><link>https://x.com</link><description>x</description><item><guid>g</guid><title>t</title><link>https://x.com/1</link><description>d</description></item></channel></rss>';
		expect(createRssParser(xml)).not.toBeNull();
	});
});

describe('describeParseFailure', () => {
	it('reports an empty body', () => {
		expect(describeParseFailure('   ')).toBe('Empty response');
	});

	it('reports a web page served in place of a feed', () => {
		expect(describeParseFailure('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head><body>gone</body></html>')).toBe('Not a feed');
	});

	it('reports JSON served in place of a feed', () => {
		expect(describeParseFailure('{"version":"https://jsonfeed.org/version/1","items":[]}')).toBe('Not a feed');
	});

	it('reports XML that is not a feed', () => {
		expect(describeParseFailure('<urlset><url><loc>https://x.com</loc></url></urlset>')).toBe('Not a feed');
	});

	it('reports broken XML', () => {
		expect(describeParseFailure('<rss><channel><title>x</title></item></rss>')).toBe('Malformed XML');
	});
});
