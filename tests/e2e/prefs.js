/* global imports, Main */

// The preferences window is a separate GTK process. Its widgets are found through the accessibility tree (AT-SPI), read here from inside the Shell.
// A widget with an accessible action is operated through that action: GTK 4.14 reports wrong positions for the widgets of the header bar.
// Rows, text entries and drag handles get real pointer and key events, their reported positions are right.
(() =>
{
	const { Atspi, Clutter, Gio, GLib, Meta } = imports.gi;

	const t = globalThis.e2e;
	const { sleep, waitFor, check } = t;

	const WM_CLASS = 'org.gnome.Shell.Extensions';
	const TOPLEVELS = [Meta.WindowType.NORMAL, Meta.WindowType.DIALOG, Meta.WindowType.MODAL_DIALOG];
	const ACTIONS = ['click', 'toggle', 'activate', 'press'];
	const WIDTH = 760;

	const SWITCH = ['check box', 'switch', 'toggle button'];
	const RADIO = ['check box', 'radio button'];
	const BUTTON = ['push button', 'button'];

	let app = null;
	let pid = 0;

	const ours = w => w.get_wm_class() === WM_CLASS || (pid !== 0 && w.get_pid() === pid);
	const all = () => global.get_window_actors().map(a => a.meta_window).filter(ours);
	const toplevels = () => all().filter(w => TOPLEVELS.includes(w.get_window_type())).sort((a, b) => a.get_stable_sequence() - b.get_stable_sequence());
	const win = () => toplevels()[0] ?? null;
	const chooser = () => toplevels()[1] ?? null;
	const popup = () => all().find(w => !TOPLEVELS.includes(w.get_window_type())) ?? null;

	function attach()
	{
		Atspi.init();
		pid = win().get_pid();
		app = null;

		let desktop = Atspi.get_desktop(0);
		for (let i = 0; i < desktop.get_child_count(); i++)
		{
			let child = desktop.get_child_at_index(i);

			// the Shell is on this list as well and a question to itself would block until it times out; the process id is answered by the bus
			if (child.get_process_id() !== pid)
				continue;

			// the cache of libatspi lags behind a window that changes under the tests
			child.set_cache_mask(Atspi.Cache.NONE);
			app = child;
		}

		return app;
	}

	function matcher(role, name)
	{
		let roles = role === null ? null : [].concat(role);

		return node =>
		{
			if (roles && !roles.includes(node.get_role_name()))
				return false;
			if (name === undefined)
				return true;

			let actual = node.get_name();
			return name instanceof RegExp ? name.test(actual) : actual === name;
		};
	}

	// parents come before their children, so the first node with the title of a row is the row itself;
	// libadwaita 1.5 lists the visible page under every page before it as well, so a node can be reached more than once
	function collect(node, test, found, limit, seen = new Set())
	{
		if (seen.has(node))
			return found;
		seen.add(node);

		try
		{
			if (test(node))
				found.push(node);

			let count = node.get_child_count();
			for (let i = 0; i < count && found.length < limit; i++)
			{
				let child = node.get_child_at_index(i);
				if (child)
					collect(child, test, found, limit, seen);
			}
		}
		catch
		{
			// a widget that goes away while the tree is read
		}

		return found;
	}

	const findAll = (role, name, root = app) => root ? collect(root, matcher(role, name), [], 5000) : [];
	const find = (role, name, root = app) => (root ? collect(root, matcher(role, name), [], 1)[0] : null) ?? null;

	function label(role, name)
	{
		let what = role === null ? 'widget' : [].concat(role)[0];
		return name === undefined ? what : what + ' "' + name + '"';
	}

	const get = (role, name, root, timeout = 5000) => waitFor('the ' + label(role, name) + ' in the preferences window', () => find(role, name, root ?? app), timeout);

	// since libadwaita 1.6 a spin row is a presentational widget, and GTK leaves such a widget out of the tree together with everything
	// inside it; a hit test still answers with what lies under a point, so the lists are searched for the title label of the row
	function hitRow(title, root)
	{
		for (let list of findAll('list', undefined, root))
		{
			let e = list.get_extents(Atspi.CoordType.WINDOW);

			for (let y = e.y + 6; y < e.y + e.height; y += 8)
			{
				let node = Atspi.Component.prototype.get_accessible_at_point.call(list, e.x + 24, y, Atspi.CoordType.WINDOW);
				if (node?.get_name() !== title)
					continue;

				// the widget right below the list holds the whole row
				for (let parent = node.get_parent(); parent && parent.get_role_name() !== 'list'; parent = node.get_parent())
					node = parent;

				return node;
			}
		}

		return null;
	}

	const row = (title, root) => waitFor('the widget "' + title + '" in the preferences window', () => find(null, title, root ?? app) ?? hitRow(title, root ?? app));
	const has = (node, state) => node.get_state_set().contains(Atspi.StateType[state]);
	const read = node => Atspi.Text.prototype.get_text.call(node, 0, -1);
	const value = node => Atspi.Value.prototype.get_current_value.call(node);

	// an insensitive group does not mark its rows, so the answer is in the chain of parents
	function enabled(node)
	{
		for (let n = node; n && n.get_role_name() !== 'application'; n = n.get_parent())
		{
			if (!has(n, 'SENSITIVE'))
				return false;
		}

		return true;
	}

	function rect(node)
	{
		let extents = node.get_extents(Atspi.CoordType.WINDOW);
		let frame = win().get_frame_rect();
		return { x: frame.x + extents.x, y: frame.y + extents.y, w: extents.width, h: extents.height };
	}

	async function focus(window = win())
	{
		if (!window.has_focus())
			Main.activateWindow(window);

		await waitFor('the window "' + window.get_title() + '" to get the keyboard focus', () => window.has_focus(), 5000);
	}

	// away from the window: a pointer that rests on a button opens its tooltip, which is one more popup window
	const park = () => t.moveTo(200, 700);

	async function clickOn(node, fx = 0.5, fy = 0.5)
	{
		await focus();

		let r = rect(node);
		let frame = win().get_frame_rect();
		let x = r.x + r.w * fx;
		let y = r.y + r.h * fy;
		let what = 'the ' + node.get_role_name() + ' "' + node.get_name() + '"';
		check(r.w > 0 && r.h > 0, what + ' has no size');
		check(x > frame.x && x < frame.x + frame.width && y > frame.y && y < frame.y + frame.height, what + ' is outside the visible part of the window');
		// the pointer comes from its parking place outside the window; it moves inside the window once before the motion that ends in the click
		await t.moveTo(x - 4, y - 4);
		global.stage.queue_redraw();
		await sleep(100);
		await t.clickAt(x, y);
	}

	function action(node)
	{
		let count = node.get_n_actions();
		for (let i = 0; i < count; i++)
		{
			if (ACTIONS.includes(node.get_action_name(i)))
				return i;
		}

		return -1;
	}

	async function press(node)
	{
		let index = action(node);

		if (index === -1)
			await clickOn(node);
		else
			node.do_action(index);

		await sleep(300);
	}

	async function page(name)
	{
		let tab = await get('page tab', name);
		let selected = () => ['SELECTED', 'CHECKED', 'PRESSED'].some(state => has(tab, state));

		if (!selected())
			await press(tab);

		await waitFor('the page ' + name + ' to be selected', selected);
		await sleep(300);

		// the first widget with the name of the page that is neither its tab nor a label is the page itself
		return waitFor('the content of the page ' + name, () =>
			findAll(null, name).find(n => !['page tab', 'label'].includes(n.get_role_name()) && n.get_child_count() > 0) ?? null);
	}

	const pages = () => findAll('page tab').map(tab => tab.get_name());
	const current = () => findAll('page tab').find(tab => ['SELECTED', 'CHECKED', 'PRESSED'].some(state => has(tab, state)))?.get_name() ?? '';

	// verify is off for spin buttons, their text is not readable through the tree
	async function fill(node, text, verify = true)
	{
		await clickOn(node, 0.2, 0.5);
		await t.chord(Clutter.KEY_Control_L, Clutter.KEY_a);
		await t.type(text);

		if (verify)
			await t.eventually(() => read(node), text, 'text of the entry', 3000);
	}

	async function spin(title, number, root)
	{
		let button = await get('spin button', undefined, await row(title, root));
		await fill(button, String(number), false);
		await t.key(Clutter.KEY_Return);
		await sleep(200);
		return button;
	}

	const toggle = async (title, root) => press(await get(SWITCH, title, await row(title, root)));
	const radio = async (title, root) => get(RADIO, title, await row(title, root));

	function options(combo)
	{
		let pane = find('scroll pane', undefined, combo);
		return pane ? findAll('list item', undefined, pane) : [];
	}

	const optionName = item => find('label', undefined, item)?.get_name() ?? item.get_name();

	async function openCombo(title, root)
	{
		let combo = await row(title, root);

		await park();
		await waitFor('no popup to be left open', () => !popup(), 3000);
		await clickOn(combo, 0.3, 0.5);
		await waitFor('the list of "' + title + '" to open', () => popup() && options(combo).length > 0, 4000);
		await sleep(250);

		return combo;
	}

	async function listOptions(title, root)
	{
		let combo = await openCombo(title, root);
		let names = options(combo).map(optionName);

		await t.key(Clutter.KEY_Escape);
		await waitFor('the list of "' + title + '" to close', () => !popup(), 4000);
		return names;
	}

	// the list is walked with the arrow keys: the positions GTK reports inside a popover are not usable for a click
	async function choose(title, option, root)
	{
		let combo = await openCombo(title, root);
		let items = options(combo);
		let target = items.findIndex(item => optionName(item) === option);
		check(target !== -1, '"' + title + '" does not offer "' + option + '", only: ' + items.map(optionName).join(', '));

		// the list has no key focus before the first arrow key (Return would only close it), although the tree marks its first item as focused
		await t.key(Clutter.KEY_Down);

		let focused = -1;
		for (let i = 0; i < items.length * 2 + 2; i++)
		{
			focused = items.findIndex(item => has(item, 'FOCUSED'));
			if (focused === target)
				break;

			await t.key(focused === -1 || focused < target ? Clutter.KEY_Down : Clutter.KEY_Up);
		}

		check(focused === target, 'the arrow keys did not reach "' + option + '" in the list of "' + title + '"');
		await t.key(Clutter.KEY_Return);
		await waitFor('the list of "' + title + '" to close', () => !popup(), 4000);
		await sleep(200);
	}

	// what the closed combo row shows
	async function chosen(title, root)
	{
		let combo = await row(title, root);
		let shown = find('list', undefined, combo);
		return shown ? find('label', undefined, shown)?.get_name() ?? '' : '';
	}

	const toast = (text, timeout = 6000) => get('label', text, app, timeout);

	// typing a path works in every file chooser of GTK: in an open dialog the first "/" brings up the location entry, in a save dialog the name entry has the focus
	async function chooseFile(path, save = false)
	{
		let dialog = await waitFor('the file chooser', chooser, 10000);
		await focus(dialog);
		await sleep(500);

		// the name is preselected without its extension, typing over it would keep ".opml"
		if (save)
			await t.chord(Clutter.KEY_Control_L, Clutter.KEY_a);

		await t.type(path);
		await sleep(300);
	}

	async function confirmFile()
	{
		await t.key(Clutter.KEY_Return);
		await waitFor('the file chooser to close', () => !chooser(), 10000);
		await sleep(300);
	}

	function area()
	{
		let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;

		for (let window of all())
		{
			let r = window.get_frame_rect();
			x1 = Math.min(x1, r.x);
			y1 = Math.min(y1, r.y);
			x2 = Math.max(x2, r.x + r.width);
			y2 = Math.max(y2, r.y + r.height);
		}

		return x1 === Infinity ? null : { x: x1 - 12, y: y1 - 12, w: x2 - x1 + 24, h: y2 - y1 + 24 };
	}

	async function shot(slug, look)
	{
		await sleep(250);
		await t.shot(slug, look, area());
	}

	function tree(root = app)
	{
		let lines = [];
		let states = ['SENSITIVE', 'SHOWING', 'FOCUSED', 'CHECKED', 'SELECTED', 'EXPANDED'];

		let walk = (node, depth) =>
		{
			if (lines.length >= 3000)
				return;

			try
			{
				let e = node.get_role_name() === 'application' ? { x: 0, y: 0, width: 0, height: 0 } : node.get_extents(Atspi.CoordType.WINDOW);
				let set = node.get_state_set();
				let names = [];
				for (let i = 0; i < node.get_n_actions(); i++)
					names.push(node.get_action_name(i));

				lines.push('  '.repeat(depth) + node.get_role_name() + ' "' + node.get_name() + '" [' + [e.x, e.y, e.width, e.height].join(',') + '] ' +
					states.filter(s => set.contains(Atspi.StateType[s])).join(' ') + (names.length && names.length < 4 ? ' actions: ' + names.join(',') : ''));

				let count = node.get_child_count();
				for (let i = 0; i < count; i++)
					walk(node.get_child_at_index(i), depth + 1);
			}
			catch (e)
			{
				lines.push('  '.repeat(depth) + '(unreadable: ' + e.message + ')');
			}
		};

		walk(root, 0);
		return lines.join('\n');
	}

	async function open(opener = () => t.obj().openPreferences())
	{
		if (!win())
			await opener();

		let window = await waitFor('the preferences window', win, 20000);
		await waitFor('the preferences window in the accessibility tree', attach, 15000);
		await waitFor('the pages of the preferences window', () => find('page tab'), 15000);

		// tall enough to show every page without scrolling
		let top = Main.panel.height + 8;
		let frame = { x: Math.round((global.screen_width - WIDTH) / 2), y: top, w: WIDTH, h: global.screen_height - top - 10 };
		// a window that was mapped a moment ago can still ignore the first request
		await waitFor('the preferences window to take the size ' + frame.w + 'x' + frame.h, () =>
		{
			let now = window.get_frame_rect();
			if (now.width === frame.w && now.height === frame.h)
				return true;

			window.move_resize_frame(true, frame.x, frame.y, frame.w, frame.h);
			return false;
		}, 10000);

		await focus(window);
		await park();
		await sleep(400);
	}

	async function close()
	{
		let window = win();
		if (!window)
			return;

		window.delete(global.get_current_time());
		await waitFor('the preferences window to close', () => !win(), 10000);
		app = null;

		// the process behind the window leaves two seconds after its last window; a window opened sooner comes from the same process,
		// and at-spi 2.54 (GNOME 47) has thrown the tree of that process away by then
		await waitFor('the preferences process to leave the bus', () => !Gio.DBus.session.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
			'org.freedesktop.DBus', 'NameHasOwner', new GLib.Variant('(s)', [WM_CLASS]), null, Gio.DBusCallFlags.NONE, 1000, null).deepUnpack()[0], 10000);
	}

	// the tree of a failed step shows which names and roles this GTK version really has
	t.onFailure(async id =>
	{
		if (!app || !win())
			return '';

		let file = 'a11y_g' + t.config().major + '_' + t.config().theme + '_' + id + '.txt';
		GLib.file_set_contents(t.config().out + '/' + file, tree() + '\n');
		return ' (widget tree: ' + file + ')';
	});

	t.prefs = {
		SWITCH, RADIO, BUTTON,
		open, close, win, chooser, popup, focus, park,
		find, findAll, get, row, has, read, value, enabled, rect,
		press, clickOn, page, pages, current, fill, spin, toggle, radio,
		openCombo, listOptions, choose, chosen, toast, chooseFile, confirmFile,
		area, shot, tree,
	};
})();
