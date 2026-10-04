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

const rss = desc => '<rss version="2.0"><channel><title>Chan</title><link>https://x.com</link><description>d</description><item><guid>g1</guid><title>Item</title><link>https://x.com/1</link><description>' + desc + '</description></item></channel></rss>';
const atom = (tag, desc) => '<feed xmlns="http://www.w3.org/2005/Atom"><title>Chan</title><link href="https://x.com"/><entry><id>g1</id><title>Item</title><link href="https://x.com/1"/><' + tag + '>' + desc + '</' + tag + '></entry></feed>';
const parsed = xml => {
	let parser = createRssParser(xml);
	parser.parse();
	return parser;
};

describe('createRssParser with unclosed void tags', () => {
	it.each([
		['<br>', 'one<br>two', 'onetwo'],
		['<img>', 'one<img src="https://x.com/a.png">two', 'onetwo'],
		['<hr>', 'one<hr>two', 'onetwo']
	])('reads an RSS description with an unclosed %s', (name, desc, text) => {
		let parser = parsed(rss(desc));
		expect(parser.Items).toHaveLength(1);
		expect(parser.Items[0].ID).toBe('g1');
		expect(parser.Items[0].Title).toBe('Item');
		expect(parser.Items[0].HttpLink).toBe('https://x.com/1');
		expect(parser.Items[0].Description).toBe(text);
	});

	it.each(['summary', 'content'])('reads an Atom %s with an unclosed tag', tag => {
		let parser = parsed(atom(tag, 'one<br>two<img src="https://x.com/a.png">three<hr>four'));
		expect(parser.Items).toHaveLength(1);
		expect(parser.Items[0].ID).toBe('g1');
		expect(parser.Items[0].Title).toBe('Item');
		expect(parser.Items[0].HttpLink).toBe('https://x.com/1');
		expect(parser.Items[0].Description).toBe('onetwothreefour');
	});

	it('still resolves RSS links after the second attempt', () => {
		let parser = parsed(rss('one<br>two'));
		expect(parser.Publisher.HttpLink).toBe('https://x.com');
		expect(parser.Items[0].HttpLink).toBe('https://x.com/1');
	});

	it('still resolves Atom links after the second attempt', () => {
		let parser = parsed(atom('summary', 'one<br>two'));
		expect(parser.Publisher.HttpLink).toBe('https://x.com');
		expect(parser.Items[0].HttpLink).toBe('https://x.com/1');
	});

	it('keeps reading explicitly closed void tags in RSS', () => {
		let parser = parsed(rss('one<br></br>two<img src="https://x.com/a.png"></img>three<hr></hr>four'));
		expect(parser.Items[0].Description).toBe('onetwothreefour');
		expect(parser.Items[0].HttpLink).toBe('https://x.com/1');
	});

	it('keeps reading explicitly closed void tags in Atom xhtml content', () => {
		let xml = '<feed xmlns="http://www.w3.org/2005/Atom"><title>Chan</title><link href="https://x.com"/><entry><id>g1</id><title>Item</title><link href="https://x.com/1"/>'
			+ '<content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml">one<br></br>two<img src="https://x.com/a.png"></img>three<hr></hr></div></content></entry></feed>';
		let parser = parsed(xml);
		expect(parser.Items).toHaveLength(1);
		expect(parser.Items[0].HttpLink).toBe('https://x.com/1');
	});

	it('does not read an unclosed p', () => {
		expect(createRssParser(rss('one<p>two'))).toBeNull();
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

	it('reports a document that is not a feed and holds an unclosed br', () => {
		expect(describeParseFailure('<urlset><url><loc>https://x.com</loc>one<br>two</url></urlset>')).toBe('Not a feed');
	});

	it('does not report a feed with an unclosed br as malformed', () => {
		expect(describeParseFailure(rss('one<br>two'))).not.toBe('Malformed XML');
	});
});
