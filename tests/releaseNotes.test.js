import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { RELEASE_NOTES, RELEASE_NOTES_VERSION } from '../prefs/releaseNotes.js';

const dir = dirname(fileURLToPath(import.meta.url));
const metadata = JSON.parse(readFileSync(join(dir, '../metadata.json'), 'utf-8'));

const TOP_LEVEL = ['p', 'ul', 'ol'];
const INLINE = ['em', 'code'];

// returns an error message, or null when libadwaita would accept the markup
function checkMarkup(markup) {
	if (/&(?!(amp|lt|gt|quot|apos);)/.test(markup))
		return 'bare ampersand';

	const stack = [];
	const tag = /<(\/?)([^\s>/]*)([^>]*)>/g;
	let match;
	while ((match = tag.exec(markup)) !== null) {
		const [, closing, name, rest] = match;

		if (closing) {
			if (rest.trim() !== '')
				return 'malformed closing tag: ' + name;
			if (stack.pop() !== name)
				return 'wrong closing order at: ' + name;
			continue;
		}

		if (rest.trim() !== '')
			return 'attributes or self-closing on: ' + name;

		const parent = stack[stack.length - 1];
		let allowed;
		if (parent === undefined)
			allowed = TOP_LEVEL.includes(name);
		else if (parent === 'ul' || parent === 'ol')
			allowed = name === 'li';
		else if (parent === 'p' || parent === 'li')
			allowed = INLINE.includes(name);
		else
			allowed = false;

		if (!allowed)
			return 'element not allowed here: ' + name + (parent ? ' in ' + parent : ' at top level');
		stack.push(name);
	}

	if (stack.length)
		return 'unclosed element: ' + stack[stack.length - 1];
	if (/<(?![/a-z])/.test(markup.replace(tag, '')))
		return 'bare less-than sign';
	return null;
}

describe('release notes', () => {
	it('matches the version in metadata.json', () => {
		expect(RELEASE_NOTES_VERSION).toBe(metadata['version-name']);
	});

	it('is markup the About dialog accepts', () => {
		expect(checkMarkup(RELEASE_NOTES)).toBeNull();
	});
});

describe('release notes checker', () => {
	it('accepts valid samples', () => {
		expect(checkMarkup('<p>a <em>b</em> &amp; <code>c</code></p>\n<ul>\n<li>x</li>\n</ul>')).toBeNull();
		expect(checkMarkup('<ol><li>x</li></ol>')).toBeNull();
	});

	it('rejects an unknown element', () => {
		expect(checkMarkup('<p><b>x</b></p>')).not.toBeNull();
		expect(checkMarkup('<div>x</div>')).not.toBeNull();
	});

	it('rejects an attribute', () => {
		expect(checkMarkup('<p class="a">x</p>')).not.toBeNull();
	});

	it('rejects a nested list', () => {
		expect(checkMarkup('<ul><li>x<ul><li>y</li></ul></li></ul>')).not.toBeNull();
	});

	it('rejects a misplaced element', () => {
		expect(checkMarkup('<li>x</li>')).not.toBeNull();
		expect(checkMarkup('<ul><p>x</p></ul>')).not.toBeNull();
		expect(checkMarkup('<em>x</em>')).not.toBeNull();
	});

	it('rejects a bare ampersand', () => {
		expect(checkMarkup('<p>a & b</p>')).not.toBeNull();
		expect(checkMarkup('<p>a &copy; b</p>')).not.toBeNull();
	});

	it('rejects an unclosed element', () => {
		expect(checkMarkup('<p>x')).not.toBeNull();
		expect(checkMarkup('<ul><li>x</ul>')).not.toBeNull();
	});
});
