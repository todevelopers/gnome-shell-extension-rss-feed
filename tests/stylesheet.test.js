import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const dir = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(dir, '../stylesheet.css'), 'utf-8');

function readRule(selector) {
	const escaped = selector.replace(/[.]/g, '\\.');
	const match = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
	if (!match)
		throw new Error('rule not found: ' + selector);
	const props = {};
	for (const decl of match[1].split(';')) {
		const i = decl.indexOf(':');
		if (i > 0)
			props[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
	}
	return props;
}

function borderWidth(props) {
	return props.border ? parseFloat(props.border) : 0;
}

function boxWidth(props) {
	return parseFloat(props.width || props['min-width']) + 2 * borderWidth(props);
}

function boxHeight(props) {
	return parseFloat(props.height) + 2 * borderWidth(props);
}

const badge = readRule('.rss-unread-badge');
const iconBtn = readRule('.rss-icon-btn');
const feedCount = readRule('.rss-feed-count');

describe('header button sizing', () => {
	it('mark-all-read badge is the same width as the icon buttons', () => {
		expect(boxWidth(badge)).toBe(boxWidth(iconBtn));
	});

	it('mark-all-read badge is the same height as the icon buttons', () => {
		expect(boxHeight(badge)).toBe(boxHeight(iconBtn));
	});

	it('header badge matches the per-feed count badge', () => {
		expect(boxWidth(badge)).toBe(boxWidth(feedCount));
		expect(boxHeight(badge)).toBe(boxHeight(feedCount));
	});

	it('badge and icon buttons stay circular', () => {
		expect(boxWidth(badge)).toBe(boxHeight(badge));
		expect(boxWidth(iconBtn)).toBe(boxHeight(iconBtn));
	});
});
