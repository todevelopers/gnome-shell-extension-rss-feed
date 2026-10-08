import { describe, it, expect } from 'vitest';
import { decodeBody } from '../http.js';

const LATIN2 = { 'č': 0xE8, 'š': 0xB9, 'ž': 0xBE };
const latin2 = text => Uint8Array.from(text, c => LATIN2[c] ?? c.charCodeAt(0));
const utf8 = text => new TextEncoder().encode(text);

const LATIN2_PROLOG = '<?xml version="1.0" encoding="iso-8859-2"?>';

describe('decodeBody', () => {
	it('decodes utf-8 when nothing names an encoding', () => {
		expect(decodeBody(utf8('<rss>čšž</rss>'), null)).toBe('<rss>čšž</rss>');
		expect(decodeBody(utf8('<rss>čšž</rss>'), 'application/rss+xml')).toBe('<rss>čšž</rss>');
	});

	it('takes the charset from the content-type header', () => {
		expect(decodeBody(latin2('<rss>čšž</rss>'), 'text/xml; charset=iso-8859-2')).toBe('<rss>čšž</rss>');
		expect(decodeBody(latin2('<rss>čšž</rss>'), 'text/xml;CHARSET=ISO-8859-2; q=1')).toBe('<rss>čšž</rss>');
	});

	it('takes the encoding from the xml prolog when the header names none', () => {
		const body = LATIN2_PROLOG + '<rss>čšž</rss>';
		expect(decodeBody(latin2(body), null)).toBe(body);
		expect(decodeBody(latin2(body), 'text/xml')).toBe(body);
	});

	it('accepts a prolog with single quotes', () => {
		const body = "<?xml version='1.0' encoding='iso-8859-2'?><rss>čšž</rss>";
		expect(decodeBody(latin2(body), null)).toBe(body);
	});

	it('lets the header win over the prolog', () => {
		const body = '<?xml version="1.0" encoding="utf-8"?><rss>čšž</rss>';
		expect(decodeBody(latin2(body), 'text/xml; charset=iso-8859-2')).toBe(body);
	});

	it('lets the prolog correct a header that says utf-8', () => {
		const body = LATIN2_PROLOG + '<rss>čšž</rss>';
		expect(decodeBody(latin2(body), 'text/xml; charset=utf-8')).toBe(body);
	});

	it('only looks for the prolog at the start of the body', () => {
		const body = '<rss>' + ' '.repeat(200) + 'encoding="iso-8859-2" čšž</rss>';
		expect(decodeBody(utf8(body), null)).toBe(body);
	});

	it('throws for an encoding it does not know', () => {
		expect(() => decodeBody(utf8('<rss/>'), 'text/xml; charset=no-such-charset')).toThrow(RangeError);
	});
});
