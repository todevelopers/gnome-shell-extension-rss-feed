import { describe, it, expect } from 'vitest';
import { getParametersAsJson, buildUrl } from '../http.js';

describe('getParametersAsJson', () => {
	it('returns an empty object when there is no query string', () => {
		expect(getParametersAsJson('http://example.com/feed')).toBe('{}');
	});

	it('reads a single query parameter', () => {
		expect(getParametersAsJson('http://example.com/feed?format=xml')).toBe('{"format":"xml"}');
	});

	it('reads several query parameters in order', () => {
		expect(getParametersAsJson('http://example.com/feed?a=1&b=2')).toBe('{"a":"1","b":"2"}');
	});
});

describe('buildUrl', () => {
	it('leaves the url untouched for an empty parameter object', () => {
		expect(buildUrl('http://example.com/feed', '{}')).toBe('http://example.com/feed');
	});

	it('appends a single parameter', () => {
		expect(buildUrl('http://example.com/feed', '{"format":"xml"}')).toBe('http://example.com/feed?format=xml');
	});

	it('appends several parameters joined with &', () => {
		expect(buildUrl('http://example.com/feed', '{"a":"1","b":"2"}')).toBe('http://example.com/feed?a=1&b=2');
	});

	it('percent-encodes keys and values', () => {
		expect(buildUrl('http://example.com/feed', '{"q":"a b"}')).toBe('http://example.com/feed?q=a%20b');
	});
});

describe('strip query then rebuild', () => {
	it('reconstructs the request url the way the poller does', () => {
		const url = 'http://example.com/feed?a=1&b=2';
		const params = getParametersAsJson(url);
		const base = url.substr(0, url.indexOf('?'));
		expect(buildUrl(base, params)).toBe('http://example.com/feed?a=1&b=2');
	});
});
