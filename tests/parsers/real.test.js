import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRssParser } from '../../parsers/factory.js';

const dir = dirname(fileURLToPath(import.meta.url));
const realDir = join(dir, '../fixtures/real');

const files = existsSync(realDir)
	? readdirSync(realDir).filter(f => f.endsWith('.xml'))
	: [];

if (files.length === 0) {
	describe('real feeds', () => {
		it.todo('add XML snapshots to tests/fixtures/real/ to enable these tests');
	});
}

describe.each(files)('real feed: %s', (filename) => {
	let parser;

	beforeAll(() => {
		const xml = readFileSync(join(realDir, filename), 'utf-8');
		parser = createRssParser(xml);
		parser?.parse();
	});

	it('recognized by factory', () => {
		expect(parser).not.toBeNull();
	});

	it('Publisher.Title is non-empty', () => {
		expect(parser.Publisher.Title).toBeTruthy();
	});

	it('Publisher.HttpLink is non-empty', () => {
		expect(parser.Publisher.HttpLink).toBeTruthy();
	});

	it('all items have non-empty ID', () => {
		for (const item of parser.Items) {
			expect(item.ID, `item "${item.Title}" missing ID`).toBeTruthy();
		}
	});

	it('all items have non-empty HttpLink', () => {
		for (const item of parser.Items) {
			expect(item.HttpLink, `item "${item.Title}" missing HttpLink`).toBeTruthy();
		}
	});
});
