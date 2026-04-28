import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRssParser } from '../../parsers/factory.js';

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
