import { describe, it, expect } from 'vitest';
import { getInstance } from '../encoder.js';

const Encoder = getInstance();

describe('Encoder.htmlDecode', () => {

	describe('empty / falsy input', () => {
		it('returns empty string for empty string', () => {
			expect(Encoder.htmlDecode('')).toBe('');
		});

		it('returns empty string for null', () => {
			expect(Encoder.htmlDecode(null)).toBe('');
		});

		it('returns empty string for whitespace-only string', () => {
			expect(Encoder.htmlDecode('   ')).toBe('');
		});
	});

	describe('pass-through — no entities', () => {
		it('leaves plain ASCII unchanged', () => {
			expect(Encoder.htmlDecode('Hello World')).toBe('Hello World');
		});

		it('leaves already-decoded unicode unchanged', () => {
			expect(Encoder.htmlDecode('Ján Novák')).toBe('Ján Novák');
		});
	});

	describe('basic named entities', () => {
		it('decodes &amp;', () => {
			expect(Encoder.htmlDecode('AT&amp;T')).toBe('AT&T');
		});

		it('decodes &lt; and &gt;', () => {
			expect(Encoder.htmlDecode('&lt;p&gt;text&lt;/p&gt;')).toBe('<p>text</p>');
		});

		it('decodes &quot;', () => {
			expect(Encoder.htmlDecode('&quot;quoted&quot;')).toBe('"quoted"');
		});

		it('decodes &nbsp;', () => {
			expect(Encoder.htmlDecode('foo&nbsp;bar')).toBe('foo bar');
		});

		it('decodes &copy;', () => {
			expect(Encoder.htmlDecode('&copy; 2024')).toBe('© 2024');
		});

		it('decodes &reg;', () => {
			expect(Encoder.htmlDecode('Brand&reg;')).toBe('Brand®');
		});
	});

	describe('typographic named entities — common in RSS feeds', () => {
		it('decodes &hellip;', () => {
			expect(Encoder.htmlDecode('more&hellip;')).toBe('more…');
		});

		it('decodes &ndash;', () => {
			expect(Encoder.htmlDecode('Jan&ndash;Feb')).toBe('Jan–Feb');
		});

		it('decodes &mdash;', () => {
			expect(Encoder.htmlDecode('yes&mdash;no')).toBe('yes—no');
		});

		it('decodes &lsquo; and &rsquo;', () => {
			expect(Encoder.htmlDecode('&lsquo;text&rsquo;')).toBe('‘text’');
		});

		it('decodes &ldquo; and &rdquo;', () => {
			expect(Encoder.htmlDecode('&ldquo;text&rdquo;')).toBe('“text”');
		});

		it('decodes &euro;', () => {
			expect(Encoder.htmlDecode('100&euro;')).toBe('100€');
		});

		it('decodes &bull;', () => {
			expect(Encoder.htmlDecode('item&bull;point')).toBe('item•point');
		});

		it('decodes &trade;', () => {
			expect(Encoder.htmlDecode('Brand&trade;')).toBe('Brand™');
		});
	});

	describe('decimal numeric entities', () => {
		it('decodes &#233; (é)', () => {
			expect(Encoder.htmlDecode('caf&#233;')).toBe('café');
		});

		it('decodes &#160; (non-breaking space)', () => {
			expect(Encoder.htmlDecode('a&#160;b')).toBe('a b');
		});

		it('decodes &#8230; (ellipsis)', () => {
			expect(Encoder.htmlDecode('wait&#8230;')).toBe('wait…');
		});

		it('decodes &#8364; (euro sign)', () => {
			expect(Encoder.htmlDecode('&#8364;99')).toBe('€99');
		});

		it('decodes Slovak/Czech characters by code point', () => {
			expect(Encoder.htmlDecode('&#353;um')).toBe('šum');
			expect(Encoder.htmlDecode('&#269;as')).toBe('čas');
			expect(Encoder.htmlDecode('&#382;aba')).toBe('žaba');
		});
	});

	describe('hex numeric entities', () => {
		it('decodes &#xE9; (é)', () => {
			expect(Encoder.htmlDecode('caf&#xE9;')).toBe('café');
		});

		it('decodes &#xe9; (lowercase hex)', () => {
			expect(Encoder.htmlDecode('caf&#xe9;')).toBe('café');
		});

		it('decodes &#x2026; (ellipsis)', () => {
			expect(Encoder.htmlDecode('wait&#x2026;')).toBe('wait…');
		});

		it('decodes &#x20AC; (euro sign)', () => {
			expect(Encoder.htmlDecode('&#x20AC;99')).toBe('€99');
		});
	});

	describe('double-encoded entities', () => {
		it('decodes &amp;amp; in one pass', () => {
			expect(Encoder.htmlDecode('AT&amp;amp;T')).toBe('AT&amp;T');
		});

		it('decodes &amp;amp; in two passes (like extension.js line 944)', () => {
			const once = Encoder.htmlDecode('AT&amp;amp;T');
			const twice = Encoder.htmlDecode(once);
			expect(twice).toBe('AT&T');
		});

		it('decodes &amp;lt; in two passes', () => {
			const once = Encoder.htmlDecode('&amp;lt;br&amp;gt;');
			const twice = Encoder.htmlDecode(once);
			expect(twice).toBe('<br>');
		});
	});

	describe('mixed content', () => {
		it('decodes entities within a longer string', () => {
			expect(Encoder.htmlDecode('Title: Foo &amp; Bar &mdash; today'))
				.toBe('Title: Foo & Bar — today');
		});

		it('decodes multiple different entity types in one string', () => {
			expect(Encoder.htmlDecode('&lt;b&gt;Hello&lt;/b&gt; &amp; &quot;world&quot;'))
				.toBe('<b>Hello</b> & "world"');
		});

		it('decodes numeric and named entities together', () => {
			expect(Encoder.htmlDecode('caf&#233; &amp; th&#233;'))
				.toBe('café & thé');
		});
	});

});
