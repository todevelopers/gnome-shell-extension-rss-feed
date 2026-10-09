import { describe, it, expect } from 'vitest';
import { relativeTime } from '../misc.js';

const ago = minutes => new Date(Date.now() - minutes * 60000).toISOString();

describe('relativeTime', () => {
	it('is empty without a date', () => {
		expect(relativeTime('')).toBe('');
		expect(relativeTime(undefined)).toBe('');
	});

	it('is empty for a date that cannot be parsed', () => {
		expect(relativeTime('not-a-date')).toBe('');
	});

	it('counts minutes, hours, days and weeks', () => {
		expect(relativeTime(ago(5))).toBe('5m');
		expect(relativeTime(ago(3 * 60))).toBe('3h');
		expect(relativeTime(ago(2 * 1440))).toBe('2d');
		expect(relativeTime(ago(21 * 1440))).toBe('3w');
	});

	it('shows at least one minute, also for a date in the future', () => {
		expect(relativeTime(ago(0))).toBe('1m');
		expect(relativeTime(ago(-30))).toBe('1m');
	});
});
