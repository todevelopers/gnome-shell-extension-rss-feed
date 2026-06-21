import { describe, it, expect } from 'vitest';
import { planNotifications } from '../../data/notificationPolicy.js';

const item = (id, over = {}) => ({ id, title: 't-' + id, desc: '', link: 'http://x/' + id, ...over });
const added = (id, over = {}) => ({ item: item(id, over), update: false });
const updated = (id, over = {}) => ({ item: item(id, over), update: true });
const payload = (items, initial = false) => ({ items, initial });
const ctx = (over = {}) => ({ enabled: true, mute: false, locked: false, notifOnLockScreen: false, limit: 5, liveIds: [], ...over });
const ids = list => list.map(x => x.id);

describe('planNotifications', () => {

	describe('gates', () => {
		it('suppresses everything on the initial refresh', () => {
			const r = planNotifications(payload([added('a')], true), ctx());
			expect(r.toShow).toEqual([]);
			expect(r.toDismiss).toEqual([]);
		});

		it('shows nothing when notifications are disabled', () => {
			const r = planNotifications(payload([added('a')]), ctx({ enabled: false }));
			expect(r.toShow).toEqual([]);
		});

		it('shows nothing when the feed is muted', () => {
			const r = planNotifications(payload([added('a')]), ctx({ mute: true }));
			expect(r.toShow).toEqual([]);
		});

		it('shows nothing on the lock screen unless allowed', () => {
			const r = planNotifications(payload([added('a')]), ctx({ locked: true, notifOnLockScreen: false }));
			expect(r.toShow).toEqual([]);
		});

		it('shows on the lock screen when allowed', () => {
			const r = planNotifications(payload([added('a')]), ctx({ locked: true, notifOnLockScreen: true }));
			expect(ids(r.toShow)).toEqual(['a']);
		});
	});

	describe('formatting', () => {
		it('carries id, title, body and url through', () => {
			const r = planNotifications(payload([added('a', { title: 'Hello', desc: 'World', link: 'http://h' })]), ctx());
			expect(r.toShow[0]).toEqual({ id: 'a', title: 'Hello', body: 'World', url: 'http://h' });
		});

		it('prefixes updated items with UPDATE:', () => {
			const r = planNotifications(payload([updated('a', { title: 'Hello' })]), ctx());
			expect(r.toShow[0].title).toBe('UPDATE: Hello');
		});

		it('falls back to the title when there is no description', () => {
			const r = planNotifications(payload([added('a', { title: 'Hello', desc: '' })]), ctx());
			expect(r.toShow[0].body).toBe('Hello');
		});
	});

	describe('dedup', () => {
		it('replaces a notification for an item it already raised', () => {
			const r = planNotifications(payload([updated('a', { title: 'New' })]), ctx({ liveIds: ['a'] }));
			expect(ids(r.toShow)).toEqual(['a']);
			expect(r.toShow[0].title).toBe('UPDATE: New');
			expect(r.toDismiss).toEqual(['a']);
		});

		it('does not dismiss anything for a fresh item', () => {
			const r = planNotifications(payload([added('b')]), ctx({ liveIds: ['a'] }));
			expect(ids(r.toShow)).toEqual(['b']);
			expect(r.toDismiss).toEqual([]);
		});
	});

	describe('limit', () => {
		it('drops the oldest notification once the limit is exceeded', () => {
			const r = planNotifications(payload([added('d')]), ctx({ limit: 3, liveIds: ['a', 'b', 'c'] }));
			expect(ids(r.toShow)).toEqual(['d']);
			expect(r.toDismiss).toEqual(['a']);
		});

		it('keeps only the newest items when a batch overflows an empty tray', () => {
			const r = planNotifications(payload([added('p'), added('q'), added('r')]), ctx({ limit: 2 }));
			expect(ids(r.toShow)).toEqual(['q', 'r']);
			expect(r.toDismiss).toEqual([]);
		});

		it('shows every item when the batch fits', () => {
			const r = planNotifications(payload([added('p'), added('q')]), ctx({ limit: 5 }));
			expect(ids(r.toShow)).toEqual(['p', 'q']);
			expect(r.toDismiss).toEqual([]);
		});
	});
});
