/* global imports, Main */

// Loaded into the test Shell through org.gnome.Shell.Eval, so it is a plain script: no import statements, Main comes from the scope of the Eval call.
globalThis.e2e = (() =>
{
	const { Clutter, Gio, GLib, St } = imports.gi;

	const scenarios = {};
	let cfg = null;
	let pointer = null;
	let keyboard = null;
	let current = null;
	let failShots = 0;
	const failureNotes = [];

	function init(config)
	{
		cfg = config;

		let backend = Clutter.get_default_backend ? Clutter.get_default_backend() : global.stage.context.get_backend();
		let seat = backend.get_default_seat();
		pointer = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
		keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);

		return true;
	}

	function sleep(ms)
	{
		return new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () =>
		{
			resolve();
			return GLib.SOURCE_REMOVE;
		}));
	}

	async function waitFor(what, test, timeout = 5000)
	{
		let deadline = Date.now() + timeout;
		let last = '';

		for (;;)
		{
			try
			{
				let value = await test();
				if (value)
					return value;
				last = '';
			}
			catch (e)
			{
				last = ' (' + e + ')';
			}

			if (Date.now() >= deadline)
				throw new Error('timed out after ' + timeout + ' ms waiting for ' + what + last);

			await sleep(50);
		}
	}

	function check(condition, message)
	{
		if (!condition)
			throw new Error(message);
	}

	function same(actual, expected, what)
	{
		let a = JSON.stringify(actual);
		let b = JSON.stringify(expected);
		if (a !== b)
			throw new Error(what + ': expected ' + b + ', got ' + a);
	}

	// same() for a value that needs a moment to arrive; when the time is up the message names the value it got instead
	async function eventually(read, expected, what, timeout = 5000)
	{
		let actual;

		await waitFor(what, async () =>
		{
			actual = await read();
			return JSON.stringify(actual) === JSON.stringify(expected);
		}, timeout).catch(() => same(actual, expected, what + ' after ' + timeout + ' ms'));
	}

	const ext = () => Main.extensionManager.lookup(cfg.uuid);
	const obj = () => ext().stateObj;
	const ind = () => Main.panel.statusArea.rssFeedMenu;
	const header = () => ind()._header;
	const store = () => obj()._store;
	const settings = () => obj()._settings;
	const status = () => header()._subtitle.text;
	const feedUrl = name => cfg.base + '/' + name + '.xml';
	const source = name => store().getSource(feedUrl(name));
	const group = name => ind()._groups.get(feedUrl(name));
	const named = (actor, name) => actor.constructor.name === name;
	const titleOf = row => (row._titleLabel || row.label).text;
	const classicRows = feedGroup => feedGroup.menu.box.get_children().filter(c => named(c, 'ClassicArticleItem') || named(c, 'TaggedArticleRow'));
	const minimalRows = () => ind()._minimal.section.box.get_children().filter(c => named(c, 'TaggedArticleRow') && c.visible);

	function setValue(key, value)
	{
		if (typeof value === 'boolean')
			settings().set_boolean(key, value);
		else if (typeof value === 'number')
			settings().set_int(key, value);
		else if (Array.isArray(value))
			settings().set_strv(key, value);
		else
			settings().set_string(key, value);
	}

	// only a feed that is new to the list starts an update, removing feeds does not
	async function setFeeds(names)
	{
		let poller = obj()._poller;
		let before = poller.lastUpdated;
		let known = new Set(store().getSources().map(s => s.url));
		let added = names.some(name => !known.has(feedUrl(name)));

		setValue('rss-feeds-list', names.map(feedUrl));

		if (added)
			await waitFor('the update of ' + names.length + ' feeds to finish', () => poller.lastUpdated && poller.lastUpdated !== before, 30000);
	}

	async function setup(names, values = {})
	{
		let all = { 'mark-initial-as-new': true, 'display-mode': 'widget-only', ...values };
		for (let key of Object.keys(all))
			setValue(key, all[key]);

		await setFeeds(names);
	}

	async function refresh()
	{
		let poller = obj()._poller;
		let before = poller.lastUpdated;

		poller.refresh();
		await waitFor('the refresh to finish', () => poller.lastUpdated !== before, 30000);
	}

	function setFeedState(state)
	{
		GLib.file_set_contents(cfg.feedState, JSON.stringify(state));
	}

	function bounds(actor)
	{
		let [x, y] = actor.get_transformed_position();
		let [w, h] = actor.get_transformed_size();
		return { x, y, w, h };
	}

	function area(...actors)
	{
		let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;

		for (let actor of actors)
		{
			if (!actor || !actor.mapped)
				continue;

			let b = bounds(actor);
			x1 = Math.min(x1, b.x);
			y1 = Math.min(y1, b.y);
			x2 = Math.max(x2, b.x + b.w);
			y2 = Math.max(y2, b.y + b.h);
		}

		if (x1 === Infinity)
			return null;

		return { x: x1 - 12, y: y1 - 12, w: x2 - x1 + 24, h: y2 - y1 + 24 };
	}

	function panelStrip()
	{
		let indicator = ind();
		let right = indicator ? bounds(indicator).x + 260 : global.screen_width;
		return { x: right - 520, y: 0, w: 520, h: 48 };
	}

	function popupArea()
	{
		let indicator = ind();
		if (!indicator || !indicator.menu.isOpen)
			return panelStrip();

		let overflow = indicator._header._menu;
		return area(indicator, indicator.menu.actor, overflow.isOpen ? overflow.actor : null);
	}

	const now = () => GLib.get_monotonic_time();

	// on GNOME 49 and 50 the first motion of the virtual pointer can lose one axis (1814,16 arrives as 0,16 or as 1814,0) and a click
	// there would test something else, so the motion is repeated until the pointer says it arrived
	async function moveTo(x, y)
	{
		let px, py;

		for (let motions = 1; motions <= 5; motions++)
		{
			pointer.notify_absolute_motion(now(), x, y);
			await sleep(120);

			[px, py] = global.get_pointer();
			if (Math.abs(px - x) <= 1 && Math.abs(py - y) <= 1)
			{
				if (motions > 1)
					console.log('e2e: the pointer needed ' + motions + ' motions to reach ' + Math.round(x) + ',' + Math.round(y));
				return;
			}
		}

		throw new Error('the pointer was sent to ' + Math.round(x) + ',' + Math.round(y) + ' and is at ' + px + ',' + py);
	}

	async function hover(actor, fx = 0.5, fy = 0.5)
	{
		let b = bounds(actor);
		await moveTo(b.x + b.w * fx, b.y + b.h * fy);
	}

	async function clickAt(x, y, button = Clutter.BUTTON_PRIMARY)
	{
		await moveTo(x, y);
		pointer.notify_button(now(), button, Clutter.ButtonState.PRESSED);
		await sleep(40);
		pointer.notify_button(now(), button, Clutter.ButtonState.RELEASED);
		await sleep(150);
	}

	async function click(actor, button = Clutter.BUTTON_PRIMARY, fx = 0.5, fy = 0.5)
	{
		let b = bounds(actor);
		await clickAt(b.x + b.w * fx, b.y + b.h * fy, button);
	}

	async function key(keyval)
	{
		keyboard.notify_keyval(now(), keyval, Clutter.KeyState.PRESSED);
		await sleep(30);
		keyboard.notify_keyval(now(), keyval, Clutter.KeyState.RELEASED);
		await sleep(150);
	}

	// keys reach the focused window of another process as well; the keyboard layout of the test profile is us
	async function type(text)
	{
		for (let ch of text)
		{
			let keyval = Clutter.unicode_to_keysym(ch.codePointAt(0));
			keyboard.notify_keyval(now(), keyval, Clutter.KeyState.PRESSED);
			await sleep(12);
			keyboard.notify_keyval(now(), keyval, Clutter.KeyState.RELEASED);
			await sleep(25);
		}

		await sleep(150);
	}

	async function chord(modifier, keyval)
	{
		keyboard.notify_keyval(now(), modifier, Clutter.KeyState.PRESSED);
		await sleep(30);
		keyboard.notify_keyval(now(), keyval, Clutter.KeyState.PRESSED);
		await sleep(30);
		keyboard.notify_keyval(now(), keyval, Clutter.KeyState.RELEASED);
		await sleep(30);
		keyboard.notify_keyval(now(), modifier, Clutter.KeyState.RELEASED);
		await sleep(150);
	}

	async function drag(from, to)
	{
		await moveTo(from.x, from.y);
		pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
		await sleep(200);

		for (let i = 1; i <= 20; i++)
		{
			pointer.notify_absolute_motion(now(), from.x + (to.x - from.x) * i / 20, from.y + (to.y - from.y) * i / 20);
			await sleep(40);
		}

		await sleep(300);
		pointer.notify_button(now(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
		await sleep(400);
	}

	// positive clicks scroll down
	async function wheel(clicks)
	{
		let direction = clicks > 0 ? Clutter.ScrollDirection.DOWN : Clutter.ScrollDirection.UP;

		for (let i = 0; i < Math.abs(clicks); i++)
		{
			pointer.notify_discrete_scroll(now(), direction, Clutter.ScrollSource.WHEEL);
			await sleep(80);
		}

		await sleep(250);
	}

	async function openPopup()
	{
		if (ind().menu.isOpen)
			return;

		// an indicator that was just added to the panel has no position before the next layout
		await waitFor('the panel icon to get its place', () => ind().mapped && bounds(ind()).x > 0 && bounds(ind()).w > 0);
		await sleep(150);
		await click(ind());
		await waitFor('the popup to open', () => ind().menu.isOpen);
		await sleep(200);
	}

	async function closePopup()
	{
		if (!ind().menu.isOpen)
			return;

		ind().menu.close();
		await waitFor('the popup to close', () => !ind().menu.isOpen);
	}

	async function expand(feedGroup, count)
	{
		if (!feedGroup.menu.isOpen)
		{
			await click(feedGroup, Clutter.BUTTON_PRIMARY, 0.4, 0.5);
			await waitFor('the feed group to open', () => feedGroup.menu.isOpen);
		}

		await waitFor(count + ' article rows', () => classicRows(feedGroup).length >= count, 10000);
		await sleep(200);
	}

	async function hoverRow(row)
	{
		await hover(row, 0.35, 0.5);
		return waitFor('the hover buttons of the row', () => row._hoverButtons.visible && row._hoverButtons);
	}

	async function pressButton(row, id)
	{
		let buttons = await hoverRow(row);
		let slot = await waitFor('the hover button "' + id + '"', () => buttons._slots.find(s => s.id === id));
		await click(slot.button);
	}

	function clipboard()
	{
		return new Promise(resolve => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => resolve(text)));
	}

	function setClipboard(text)
	{
		St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
	}

	function readText(path)
	{
		try
		{
			return new TextDecoder().decode(GLib.file_get_contents(path)[1]);
		}
		catch
		{
			return '';
		}
	}

	const openedUrls = () => readText(cfg.profile + '/opened-urls').split('\n').filter(Boolean);
	const logCount = needle => readText(cfg.out + '/full.log').split(needle).length - 1;

	function append(path, line)
	{
		let stream = Gio.File.new_for_path(path).append_to(Gio.FileCreateFlags.NONE, null);
		stream.write_bytes(new GLib.Bytes(new TextEncoder().encode(line + '\n')), null);
		stream.close(null);
	}

	// the Shell's own screenshot service, the same one the smoke run reached from outside with gdbus
	function screenshotCall(method, signature, args)
	{
		return new Promise((resolve, reject) =>
		{
			Gio.DBus.session.call('org.gnome.Shell', '/org/gnome/Shell/Screenshot', 'org.gnome.Shell.Screenshot', method,
				new GLib.Variant(signature, args), null, Gio.DBusCallFlags.NONE, 15000, null, (connection, result) =>
				{
					try
					{
						resolve(connection.call_finish(result).deepUnpack()[0]);
					}
					catch (e)
					{
						reject(e);
					}
				});
		});
	}

	async function capture(file, target)
	{
		let path = cfg.out + '/' + file;

		// a menu opened by the step is laid out on the next frame
		await sleep(250);

		if (target)
		{
			let x = Math.max(0, Math.floor(target.x));
			let y = Math.max(0, Math.floor(target.y));
			let w = Math.min(global.screen_width - x, Math.ceil(target.w));
			let h = Math.min(global.screen_height - y, Math.ceil(target.h));

			if (w > 0 && h > 0 && await screenshotCall('ScreenshotArea', '(iiiibs)', [x, y, w, h, false, path]).catch(() => false))
				return;
		}

		if (!await screenshotCall('Screenshot', '(bbs)', [false, false, path]))
			throw new Error('screenshot failed: ' + file);
	}

	// target: undefined for the popup with the panel above it, null for the whole screen, or an area()
	async function shot(slug, look, target)
	{
		let file = 'g' + cfg.major + '_' + cfg.theme + '_' + current.id + '_' + slug + '.png';

		await capture(file, target === undefined ? popupArea() : target);
		current.shots.push({ file, look });
	}

	function record(id, text, result, message, shots)
	{
		let clean = value => String(value).replace(/[\t\r\n]+/g, ' ');

		append(cfg.out + '/results.tsv', [cfg.theme, cfg.scenario, id, result, clean(text), clean(message)].join('\t'));

		for (let entry of shots)
		{
			append(cfg.out + '/manifest.jsonl', JSON.stringify({
				file: entry.file,
				shell: cfg.major,
				theme: cfg.theme,
				scenario: cfg.scenario,
				section: id.split('-')[0],
				step: id,
				item: text,
				look: entry.look,
				result,
				message,
			}));
		}
	}

	// a failing step never stops the scenario: it is recorded with a screenshot of the state it failed in
	async function step(id, text, run, timeout = 30000)
	{
		let result = 'PASS';
		let message = '';
		let timer = 0;

		current = { id, shots: [] };

		try
		{
			let note = await Promise.race([
				run(),
				new Promise((_resolve, reject) =>
				{
					timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, timeout, () =>
					{
						timer = 0;
						reject(new Error('step timed out after ' + timeout + ' ms'));
						return GLib.SOURCE_REMOVE;
					});
				}),
			]);

			if (typeof note === 'string')
				message = note;
		}
		catch (e)
		{
			result = 'FAIL';
			message = e instanceof Error ? e.message : String(e);

			if (failShots < 25)
			{
				failShots++;
				let file = 'g' + cfg.major + '_' + cfg.theme + '_' + id + '_FAILED.png';
				await capture(file, null).then(() => current.shots.push({ file, look: 'Whole screen at the moment the step failed.' })).catch(() => {});
			}

			for (let note of failureNotes)
				message += await note(id).catch(() => '');
		}

		if (timer)
			GLib.source_remove(timer);

		record(id, text, result, message, current.shots);

		return result === 'PASS';
	}

	async function run(name)
	{
		if (!scenarios[name])
			throw new Error('unknown scenario: ' + name);

		await scenarios[name]();
		return true;
	}

	return {
		scenarios, init, run, step, shot, sleep, waitFor, check, same, eventually,
		config: () => cfg,
		onFailure: note => failureNotes.push(note),
		ext, obj, ind, header, store, status, source, group, titleOf, classicRows, minimalRows,
		setValue, setFeeds, setup, refresh, setFeedState, feedUrl,
		bounds, area, panelStrip,
		moveTo, hover, clickAt, click, key, type, chord, drag, wheel,
		openPopup, closePopup, expand, hoverRow, pressButton,
		clipboard, setClipboard, readText, openedUrls, logCount,
	};
})();
