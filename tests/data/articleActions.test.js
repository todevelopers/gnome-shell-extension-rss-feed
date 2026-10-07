import { describe, it, expect } from 'vitest';
import * as GSKeys from '../../gskeys.js';
import {
	ACTIONS, HOVER_ACTIONS, LEFT_CLICK_ACTIONS, CLICK_ACTIONS, DEFAULT_CONFIG, EXTERNAL_LINK_ICON,
	resolveAction, resolveConfig, hoverSlots, chooseSlotAction, isDefaultConfig, buttonIcon, buttonTitle,
} from '../../data/articleActions.js';

describe('action lists', () => {
	it('only name known actions', () => {
		for (const list of [HOVER_ACTIONS, LEFT_CLICK_ACTIONS, CLICK_ACTIONS]) {
			for (const id of list)
				expect(ACTIONS[id]).toBeDefined();
		}
	});

	it('keep openread out of the hover buttons', () => {
		expect(HOVER_ACTIONS).not.toContain('openread');
	});

	it('limit the left click to the two open actions', () => {
		expect(LEFT_CLICK_ACTIONS).toEqual(['openread', 'open']);
	});

	it('give every action a label', () => {
		expect(Object.keys(ACTIONS).length).toBe(8);
		for (const id of Object.keys(ACTIONS))
			expect(ACTIONS[id].label).toBeTruthy();
	});

	it('allow every default in its own list', () => {
		expect(HOVER_ACTIONS).toContain(DEFAULT_CONFIG[GSKeys.HOVER_ACTION_1]);
		expect(HOVER_ACTIONS).toContain(DEFAULT_CONFIG[GSKeys.HOVER_ACTION_2]);
		expect(HOVER_ACTIONS).toContain(DEFAULT_CONFIG[GSKeys.HOVER_ACTION_3]);
		expect(LEFT_CLICK_ACTIONS).toContain(DEFAULT_CONFIG[GSKeys.CLICK_ACTION_LEFT]);
		expect(CLICK_ACTIONS).toContain(DEFAULT_CONFIG[GSKeys.CLICK_ACTION_MIDDLE]);
		expect(CLICK_ACTIONS).toContain(DEFAULT_CONFIG[GSKeys.CLICK_ACTION_RIGHT]);
	});
});

describe('resolveAction', () => {
	it('keeps an allowed value', () => {
		expect(resolveAction('dismiss', HOVER_ACTIONS, 'read')).toBe('dismiss');
	});

	it('falls back for an unknown value', () => {
		expect(resolveAction('explode', HOVER_ACTIONS, 'read')).toBe('read');
	});

	it('falls back for a known value the list does not allow', () => {
		expect(resolveAction('openread', HOVER_ACTIONS, 'read')).toBe('read');
		expect(resolveAction('star', LEFT_CLICK_ACTIONS, 'openread')).toBe('openread');
		expect(resolveAction('none', LEFT_CLICK_ACTIONS, 'openread')).toBe('openread');
	});

	it('falls back for a missing value', () => {
		expect(resolveAction(undefined, CLICK_ACTIONS, 'copy')).toBe('copy');
	});
});

describe('resolveConfig', () => {
	it('keeps a valid config as it is', () => {
		const config = {
			[GSKeys.HOVER_ACTION_1]: 'dismiss',
			[GSKeys.HOVER_ACTION_2]: 'none',
			[GSKeys.HOVER_ACTION_3]: 'copy',
			[GSKeys.CLICK_ACTION_LEFT]: 'open',
			[GSKeys.CLICK_ACTION_MIDDLE]: 'star',
			[GSKeys.CLICK_ACTION_RIGHT]: 'none',
		};
		expect(resolveConfig(config)).toEqual(config);
	});

	it('replaces each invalid value with the default of its own key', () => {
		const resolved = resolveConfig({
			[GSKeys.HOVER_ACTION_1]: 'openread',
			[GSKeys.HOVER_ACTION_2]: 'nonsense',
			[GSKeys.HOVER_ACTION_3]: 'openread',
			[GSKeys.CLICK_ACTION_LEFT]: 'copy',
			[GSKeys.CLICK_ACTION_MIDDLE]: '',
			[GSKeys.CLICK_ACTION_RIGHT]: 'star',
		});
		expect(resolved).toEqual({ ...DEFAULT_CONFIG, [GSKeys.CLICK_ACTION_RIGHT]: 'star' });
	});

	it('resolves an empty config to the defaults', () => {
		expect(resolveConfig({})).toEqual(DEFAULT_CONFIG);
	});
});

describe('hoverSlots', () => {
	it('returns both slots in order', () => {
		expect(hoverSlots(DEFAULT_CONFIG)).toEqual(['read', 'star']);
	});

	it('adds the third slot after the other two', () => {
		expect(hoverSlots({ ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_3]: 'dismiss' })).toEqual(['read', 'star', 'dismiss']);
	});

	it('leaves out a slot that is none', () => {
		expect(hoverSlots({ ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_1]: 'none' })).toEqual(['star']);
		expect(hoverSlots({ ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_2]: 'none' })).toEqual(['read']);
	});

	it('is empty when both slots are none', () => {
		expect(hoverSlots({ ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_1]: 'none', [GSKeys.HOVER_ACTION_2]: 'none' })).toEqual([]);
	});

	it('shows one button when both slots hold the same action', () => {
		expect(hoverSlots({ ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_2]: 'read' })).toEqual(['read']);
	});
});

describe('chooseSlotAction', () => {
	it('sets the chosen slot', () => {
		const next = chooseSlotAction(DEFAULT_CONFIG, GSKeys.HOVER_ACTION_1, 'dismiss');
		expect(next[GSKeys.HOVER_ACTION_1]).toBe('dismiss');
		expect(next[GSKeys.HOVER_ACTION_2]).toBe('star');
	});

	it('swaps the slots when the other one already has the action', () => {
		const next = chooseSlotAction(DEFAULT_CONFIG, GSKeys.HOVER_ACTION_1, 'star');
		expect(next[GSKeys.HOVER_ACTION_1]).toBe('star');
		expect(next[GSKeys.HOVER_ACTION_2]).toBe('read');
	});

	it('swaps from the second slot too', () => {
		const next = chooseSlotAction(DEFAULT_CONFIG, GSKeys.HOVER_ACTION_2, 'read');
		expect(next[GSKeys.HOVER_ACTION_1]).toBe('star');
		expect(next[GSKeys.HOVER_ACTION_2]).toBe('read');
	});

	it('swaps with the third slot', () => {
		const config = { ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_3]: 'copy' };
		const next = chooseSlotAction(config, GSKeys.HOVER_ACTION_1, 'copy');
		expect(next[GSKeys.HOVER_ACTION_1]).toBe('copy');
		expect(next[GSKeys.HOVER_ACTION_2]).toBe('star');
		expect(next[GSKeys.HOVER_ACTION_3]).toBe('read');
	});

	it('moves a none into the other slot on a swap', () => {
		const config = { ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_1]: 'none' };
		const next = chooseSlotAction(config, GSKeys.HOVER_ACTION_1, 'star');
		expect(next[GSKeys.HOVER_ACTION_1]).toBe('star');
		expect(next[GSKeys.HOVER_ACTION_2]).toBe('none');
	});

	it('never swaps for none', () => {
		const config = { ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_2]: 'none' };
		const next = chooseSlotAction(config, GSKeys.HOVER_ACTION_1, 'none');
		expect(next[GSKeys.HOVER_ACTION_1]).toBe('none');
		expect(next[GSKeys.HOVER_ACTION_2]).toBe('none');
	});

	it('changes nothing when the slot already has the action', () => {
		expect(chooseSlotAction(DEFAULT_CONFIG, GSKeys.HOVER_ACTION_1, 'read')).toEqual(DEFAULT_CONFIG);
	});

	it('leaves the click actions and the given config alone', () => {
		const next = chooseSlotAction(DEFAULT_CONFIG, GSKeys.HOVER_ACTION_1, 'star');
		expect(next[GSKeys.CLICK_ACTION_LEFT]).toBe('openread');
		expect(next[GSKeys.CLICK_ACTION_MIDDLE]).toBe('open');
		expect(next[GSKeys.CLICK_ACTION_RIGHT]).toBe('copy');
		expect(DEFAULT_CONFIG[GSKeys.HOVER_ACTION_1]).toBe('read');
	});
});

describe('isDefaultConfig', () => {
	it('is true for the defaults', () => {
		expect(isDefaultConfig(DEFAULT_CONFIG)).toBe(true);
	});

	it('is false when any key differs', () => {
		expect(isDefaultConfig({ ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_1]: 'none' })).toBe(false);
		expect(isDefaultConfig({ ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_2]: 'none' })).toBe(false);
		expect(isDefaultConfig({ ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_3]: 'copy' })).toBe(false);
		expect(isDefaultConfig({ ...DEFAULT_CONFIG, [GSKeys.CLICK_ACTION_LEFT]: 'open' })).toBe(false);
		expect(isDefaultConfig({ ...DEFAULT_CONFIG, [GSKeys.CLICK_ACTION_MIDDLE]: 'none' })).toBe(false);
		expect(isDefaultConfig({ ...DEFAULT_CONFIG, [GSKeys.CLICK_ACTION_RIGHT]: 'star' })).toBe(false);
	});

	it('is true when an invalid value reads as the default', () => {
		expect(isDefaultConfig({ ...DEFAULT_CONFIG, [GSKeys.HOVER_ACTION_1]: 'bogus' })).toBe(true);
	});

	it('is true for an empty config', () => {
		expect(isDefaultConfig({})).toBe(true);
	});
});

describe('buttonIcon and buttonTitle', () => {
	it('follow the read state', () => {
		expect(buttonIcon('read', { read: false })).toBe('mail-read-symbolic');
		expect(buttonTitle('read', { read: false })).toBe('Mark as read');
		expect(buttonIcon('read', { read: true })).toBe('mail-unread-symbolic');
		expect(buttonTitle('read', { read: true })).toBe('Mark as unread');
	});

	it('follow the starred state', () => {
		expect(buttonIcon('star', { starred: false })).toBe('non-starred-symbolic');
		expect(buttonTitle('star', { starred: false })).toBe('Star');
		expect(buttonIcon('star', { starred: true })).toBe('starred-symbolic');
		expect(buttonTitle('star', { starred: true })).toBe('Unstar');
	});

	it('are fixed for the other actions', () => {
		const item = { read: false, starred: false };
		expect([buttonIcon('dismiss', item), buttonTitle('dismiss', item)]).toEqual(['window-close-symbolic', 'Dismiss']);
		expect([buttonIcon('older', item), buttonTitle('older', item)]).toEqual(['go-bottom-symbolic', 'Mark this and older as read']);
		expect([buttonIcon('copy', item), buttonTitle('copy', item)]).toEqual(['edit-copy-symbolic', 'Copy link']);
		expect([buttonIcon('open', item), buttonTitle('open', item)]).toEqual([EXTERNAL_LINK_ICON, 'Open without marking as read']);
	});

	it('cover every action a hover button can show', () => {
		const item = { read: false, starred: false };
		for (const id of HOVER_ACTIONS.filter(id => id !== 'none')) {
			expect(buttonIcon(id, item)).toMatch(/-symbolic$/);
			expect(buttonTitle(id, item)).toBeTruthy();
		}
	});
});
