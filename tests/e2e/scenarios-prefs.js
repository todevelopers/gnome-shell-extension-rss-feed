/* global imports */

// Scenarios that work the preferences window; prefs.js explains how its widgets are reached.
// Step ids start with the section of the Pre-Release Test Checklist they cover, a trailing p marks a check that another scenario does without the window.
(() =>
{
	const { Clutter, GLib, St } = imports.gi;

	const t = globalThis.e2e;
	const p = t.prefs;
	const { step, sleep, waitFor, check, same, eventually, click, key } = t;

	const LEFT = Clutter.BUTTON_PRIMARY;
	const MIDDLE = Clutter.BUTTON_MIDDLE;
	const RIGHT = Clutter.BUTTON_SECONDARY;
	const VISIBLE_ARTICLES = "Visible articles before 'Show more'";

	const settings = () => t.obj()._settings;
	const str = name => settings().get_string(name);
	const int = name => settings().get_int(name);
	const bool = name => settings().get_boolean(name);
	const feeds = () => settings().get_strv('rss-feeds-list');
	const feedMeta = name => JSON.parse(str('rss-feeds-settings'))[t.feedUrl(name)] ?? {};
	const u = name => t.feedUrl(name);
	const short = url => url.replace(t.config().base + '/', '').replace(/\.xml$/, '');
	const numbered = (prefix, count) => Array.from({ length: count }, (_, i) => prefix + ' ' + String(i + 1).padStart(2, '0'));
	const overflow = () => t.header()._menu;

	const spinOf = async (title, root) => p.get('spin button', undefined, await p.row(title, root));
	const isOn = async (title, root) => p.has(await p.get(p.SWITCH, title, await p.row(title, root)), 'CHECKED');
	const isPicked = async (title, root) => p.has(await p.radio(title, root), 'CHECKED');

	async function openOverflow()
	{
		await t.openPopup();
		if (!overflow().isOpen)
			await click(t.header()._navButtons[2]);
		await waitFor('the ⋮ menu to open', () => overflow().isOpen);
	}

	async function clickSettings()
	{
		await openOverflow();
		await click(overflow()._getMenuItems().find(i => i.visible && i.label && i.label.text === 'Settings'));
	}

	async function erase(entry)
	{
		await p.clickOn(entry, 0.2, 0.5);
		await t.chord(Clutter.KEY_Control_L, Clutter.KEY_a);
		await key(Clutter.KEY_BackSpace);
		await eventually(() => p.read(entry), '', 'text of the entry after it was erased', 3000);
	}

	t.scenarios.prefs = async () =>
	{
		if (!await step('18-00', 'setup: two working feeds and a broken one', () => t.setup(['rss2', 'atom', '404']), 45000))
			return;

		const meta = () => t.ext().metadata;
		const NOTIFICATION_ROWS = ['Notifications limit', 'Group by RSS Source', 'Show on lock screen', 'Clear on disable'];
		const DISPLAY_ROWS = ['Classic', 'Minimal', 'Menu height (px)', VISIBLE_ARTICLES, 'Show failed feeds indicator'];
		let general = null;

		await step('14-05a', 'The "N failed" pill opens the preferences on the Sources page', async () =>
		{
			await t.openPopup();
			let pill = t.header()._failedPill;
			check(pill.visible, 'the failed pill is hidden');
			await p.open(() => click(pill));
			check(!t.ind().menu.isOpen, 'the popup stayed open');
			same(p.current(), 'Sources', 'selected page');
			same(bool('prefs-open-sources'), false, 'the prefs-open-sources flag after the window used it');
			await p.shot('from-failed-pill', 'Preferences window opened by the failed pill: the Sources tab is selected, three sources are listed, the third has a red 404 Not Found status.');
		}, 60000);

		let ready = await step('06-09', 'Preference pages are ordered General, Sources, Actions, Notifications', async () =>
		{
			await p.open();
			same(p.pages(), ['General', 'Sources', 'Actions', 'Notifications'], 'page tabs');
		}, 60000);
		if (!ready)
			return;

		await step('14-11a', '⋮ menu: Settings opens the preferences on the General page and closes the popup', async () =>
		{
			await p.close();
			await p.open(clickSettings);
			check(!t.ind().menu.isOpen, 'the popup stayed open');
			same(p.current(), 'General', 'selected page');
		}, 60000);

		await step('18-09', 'General page: Mode, Layout, Display and Polling show the current settings', async () =>
		{
			await p.open();
			general = await p.page('General');
			for (let title of ['Mode', 'Layout', 'Display', 'Polling'])
				await p.get('label', title, general);

			same([await isPicked('Notifications and widget', general), await isPicked('Notifications only', general), await isPicked('Widget only', general)],
				[false, false, true], 'Mode radios');
			same([await isPicked('Classic', general), await isPicked('Minimal', general)], [true, false], 'Layout radios');
			same(p.value(await spinOf('Menu height (px)', general)), 8192, 'Menu height');
			same(p.value(await spinOf(VISIBLE_ARTICLES, general)), 100, 'Visible articles');
			same(p.value(await spinOf('Update interval (min)', general)), 15, 'Update interval');
			check(await isOn('Show failed feeds indicator', general), 'the failed feeds switch is off');
			await p.shot('general', 'General page: Mode with Widget only selected, Layout with Classic selected, Display (8192, 100, switch on), Polling 15 and the row About RSS Feed. Nothing cut off or overlapping.');
		}, 45000);

		await step('09-02', 'Mode "Notifications only": the panel icon goes away, Layout and Display turn inactive', async () =>
		{
			await p.press(await p.radio('Notifications only', general));
			await eventually(() => str('display-mode'), 'notifications-only', 'display mode in the settings');
			await waitFor('the panel icon to go away', () => !t.ind());

			for (let title of DISPLAY_ROWS)
				check(!p.enabled(await p.row(title, general)), 'the row "' + title + '" is still active');
			check(p.enabled(await p.row('Update interval (min)', general)), 'the Polling group turned inactive too');
			await p.shot('notifications-only', 'Notifications only is selected; the Layout and Display groups are greyed out, Polling and About are not.');
		});

		await step('09-04', 'Switching modes live-updates: "Notifications and widget" brings the panel icon back', async () =>
		{
			await p.press(await p.radio('Notifications and widget', general));
			await eventually(() => str('display-mode'), 'notifications-and-widget', 'display mode in the settings');
			await waitFor('the panel icon to come back', () => t.ind() && t.ind().mapped);

			for (let title of DISPLAY_ROWS)
				check(p.enabled(await p.row(title, general)), 'the row "' + title + '" is still inactive');
		});

		await step('18-09a', 'A mode changed outside the window is picked up by the radio buttons', async () =>
		{
			t.setValue('display-mode', 'widget-only');
			let widgetOnly = await p.radio('Widget only', general);
			await waitFor('the Widget only radio to follow the setting', () => p.has(widgetOnly, 'CHECKED'));
			check(!await isPicked('Notifications and widget', general), 'Notifications and widget is still selected');
		});

		await step('09-03', 'Notifications page is inactive in the Widget only mode and active otherwise', async () =>
		{
			let page = await p.page('Notifications');
			for (let title of NOTIFICATION_ROWS)
				check(!p.enabled(await p.row(title, page)), 'the row "' + title + '" is active in the Widget only mode');
			await p.shot('notifications-inactive', 'Notifications page in the Widget only mode: all four rows greyed out.');

			t.setValue('display-mode', 'notifications-and-widget');
			let limit = await p.row('Notifications limit', page);
			await waitFor('the rows to turn active', () => p.enabled(limit));
			for (let title of NOTIFICATION_ROWS)
				check(p.enabled(await p.row(title, page)), 'the row "' + title + '" is still inactive');
		});

		await step('08-08', 'Notifications page: every control writes its setting', async () =>
		{
			let page = await p.page('Notifications');
			same([p.value(await spinOf('Notifications limit', page)), await isOn('Group by RSS Source', page), await isOn('Show on lock screen', page), await isOn('Clear on disable', page)],
				[25, false, false, true], 'values shown before the change');

			await p.spin('Notifications limit', 7, page);
			await eventually(() => int('notification-limit'), 7, 'notification-limit in the settings');
			await p.toggle('Group by RSS Source', page);
			await eventually(() => bool('group-notifications-by-source'), true, 'group-notifications-by-source in the settings');
			await p.toggle('Show on lock screen', page);
			await eventually(() => bool('enable-notifications-locked'), true, 'enable-notifications-locked in the settings');
			await p.toggle('Clear on disable', page);
			await eventually(() => bool('notifications-cleanup'), false, 'notifications-cleanup in the settings');
			await p.shot('notifications', 'Notifications page, all rows active: limit 7, Group by RSS Source on, Show on lock screen on, Clear on disable off.');

			t.setValue('display-mode', 'widget-only');
		});

		await step('04-01p', 'Switch layout to Minimal in prefs: the menu updates live', async () =>
		{
			general = await p.page('General');
			await p.press(await p.radio('Minimal', general));
			await eventually(() => str('layout-mode'), 'minimal', 'layout in the settings');

			await t.openPopup();
			check(t.ind()._minimal.section.actor.visible, 'the Minimal list is not shown');
			check(!t.ind()._feedsSection.actor.visible, 'the Classic list is still shown');
			await eventually(() => t.minimalRows().length, 15, 'article rows in the Minimal list', 8000);
			await t.shot('minimal-from-prefs', 'Popup in the Minimal layout (one list, UNREAD header, source tags) over the preferences window.');
			await t.closePopup();
		});

		await step('04-08p', 'Switching back to Classic in prefs live-updates correctly', async () =>
		{
			await p.press(await p.radio('Classic', general));
			await eventually(() => str('layout-mode'), 'classic', 'layout in the settings');

			await t.openPopup();
			check(t.ind()._feedsSection.actor.visible, 'the Classic list is not shown');
			check(!t.ind()._minimal.section.actor.visible, 'the Minimal list is still shown');
			same(t.ind()._groups.size, 3, 'feed groups');
			await t.closePopup();
		});

		await step('03-08p', 'Menu height set in prefs: the menu scrolls when taller than the max height', async () =>
		{
			try
			{
				await p.spin('Menu height (px)', 300, general);
				await eventually(() => int('max-height'), 300, 'max-height in the settings');

				await t.openPopup();
				await t.expand(t.group('rss2'), 10);
				let view = t.ind()._feedsSection.actor;
				check(view.height <= 300, 'the list is ' + view.height + ' px high');
				check(view.vadjustment.upper > view.vadjustment.page_size, 'the list does not scroll');
				await t.shot('max-height-from-prefs', 'Popup with the feed list limited to 300 px and a scrollbar.');
				await t.closePopup();
			}
			finally
			{
				t.setValue('max-height', 8192);
			}
		});

		await step('18-09b', "Visible articles before 'Show more' set in prefs applies to the feed groups", async () =>
		{
			try
			{
				await p.spin(VISIBLE_ARTICLES, 3, general);
				await eventually(() => int('items-visible'), 3, 'items-visible in the settings');

				await t.openPopup();
				let feed = t.group('rss2');
				await t.expand(feed, 3);
				await waitFor('three rows and a Show more row', () => t.classicRows(feed).length === 3 && feed._showMoreRow);
				same(feed._showMoreRow._label.text, 'Show more (3 of 10)', 'Show more label');
				await t.shot('items-visible-from-prefs', 'Mock RSS expanded with three articles and the row Show more (3 of 10).');
				await t.closePopup();
			}
			finally
			{
				t.setValue('items-visible', 100);
			}
		});

		await step('14-05p', 'Show failed feeds indicator switched off in prefs hides the "N failed" pill', async () =>
		{
			let pill = t.header()._failedPill;
			check(pill.visible, 'the pill is hidden before the switch changes');
			await p.toggle('Show failed feeds indicator', general);
			await eventually(() => bool('show-failed-feeds'), false, 'show-failed-feeds in the settings');
			await waitFor('the pill to hide', () => !pill.visible);

			await p.toggle('Show failed feeds indicator', general);
			await eventually(() => bool('show-failed-feeds'), true, 'show-failed-feeds in the settings');
			await waitFor('the pill to come back', () => pill.visible);
		});

		await step('07-02', 'Changing the update interval takes effect', async () =>
		{
			await p.spin('Update interval (min)', 7, general);
			await eventually(() => int('update-interval'), 7, 'update-interval in the settings');
			same(t.obj()._poller._interval, 7, 'interval of the poller');
		});

		await step('18-09c', 'A number above the range of a spin row is cut back (Menu height 99999 becomes 8192)', async () =>
		{
			t.setValue('max-height', 500);
			let button = await spinOf('Menu height (px)', general);
			await eventually(() => p.value(button), 500, 'Menu height shown after the setting changed outside');
			await p.spin('Menu height (px)', 99999, general);
			await eventually(() => int('max-height'), 8192, 'max-height in the settings');
			same(p.value(button), 8192, 'value shown');
		});

		await step('18-09d', 'Closing the window with its Close button and reopening shows what was set', async () =>
		{
			await p.press(await p.get(p.BUTTON, 'Close'));
			await waitFor('the preferences window to close', () => !p.win(), 10000);

			await p.open();
			same(p.current(), 'General', 'selected page');
			general = await p.page('General');
			same(p.value(await spinOf('Update interval (min)', general)), 7, 'Update interval');
			check(await isPicked('Widget only', general), 'Widget only is not selected');
		}, 60000);

		let about = await step('18-07', 'About RSS Feed opens the About dialog with the correct version and the rows What\'s New, Website, Report an Issue and Legal', async () =>
		{
			general = await p.page('General');
			await p.clickOn(await p.row('About RSS Feed', general));

			let dialog = await p.get('dialog');
			await p.get('label', meta().name, dialog);
			await p.get(null, meta()['version-name'], dialog);
			for (let title of [/^What.s New$/, 'Website', 'Report an Issue', 'Legal'])
				await p.row(title, dialog);
			await p.shot('about', 'About dialog over the General page: RSS icon, RSS Feed, version ' + meta()['version-name'] + ' and the rows What\'s New, Website, Report an Issue, Legal.');
		});

		if (about)
		{
			await step('18-07a', "About dialog: What's New shows the notes of the current version", async () =>
			{
				let dialog = await p.get('dialog');
				await p.clickOn(await p.row(/^What.s New$/, dialog));

				let source = t.readText(t.ext().path + '/prefs/releaseNotes.js');
				let version = source.match(/RELEASE_NOTES_VERSION = '([^']+)'/)[1];
				let lead = source.match(/<p>(.*?)<\/p>/)[1];
				let items = [...source.matchAll(/<li>(.*?)<\/li>/g)].map(m => m[1]);
				same(version, meta()['version-name'], 'version of the release notes');

				let notes = await waitFor('the release notes', () => p.findAll('text', undefined, dialog).map(p.read).find(text => text.includes(lead)));
				check(notes.includes(version), 'the notes do not name version ' + version);
				let missing = items.filter(item => !notes.includes(item));
				same(missing, [], 'points of the release notes that the dialog does not show');
				await p.shot('about-whats-new', "What's New page of the About dialog: heading with version " + version + ', a lead sentence and ' + items.length + ' bullet points.');

				await p.focus();
				await key(Clutter.KEY_Escape);
				await p.row('Website', dialog);
			});

			await step('18-07b', 'About dialog: Website and Report an Issue open the project pages', async () =>
			{
				let dialog = await p.get('dialog');
				let before = t.openedUrls().length;

				await p.clickOn(await p.row('Website', dialog));
				await eventually(() => t.openedUrls().length, before + 1, 'URLs opened after Website', 8000);
				await p.clickOn(await p.row('Report an Issue', dialog));
				await eventually(() => t.openedUrls().length, before + 2, 'URLs opened after Report an Issue', 8000);
				same(t.openedUrls().slice(before), [meta().url, meta().url + '/issues'], 'opened URLs');
			});

			await step('18-07c', 'About dialog: Legal names the GPL, Escape goes back and then closes the dialog', async () =>
			{
				let dialog = await p.get('dialog');
				await p.clickOn(await p.row('Legal', dialog));
				await p.get('label', /GNU General Public License, version 3 or later/, dialog);
				await p.shot('about-legal', 'Legal page of the About dialog: no warranty, GNU General Public License, version 3 or later.');

				await p.focus();
				await key(Clutter.KEY_Escape);
				await p.row('Website', dialog);
				await key(Clutter.KEY_Escape);
				await waitFor('the About dialog to close', () => !p.find('dialog'));
				check(p.win(), 'Escape closed the preferences window too');
			});
		}

		await step('18-08', 'There is no Website entry in the ⋮ menu and the RSS logo in the header is not a link', async () =>
		{
			await p.close();
			await openOverflow();
			let labels = overflow()._getMenuItems().filter(i => i.label).map(i => i.label.text);
			check(!labels.some(text => /website/i.test(text)), 'the ⋮ menu has a Website entry: ' + labels.join(', '));
			await key(Clutter.KEY_Escape);

			// the first child of a menu item is its hidden ornament, not the logo
			let logo = t.header().get_children().find(child => child.has_style_class_name('rss-header-icon'));
			check(!(logo instanceof St.Button) && !logo.reactive, 'the logo reacts to the pointer');
			let before = t.openedUrls().length;
			await click(logo);
			await sleep(1000);
			same(t.openedUrls().length, before, 'URLs opened by a click on the logo');
			await t.closePopup();
		});
	};

	t.scenarios.sources = async () =>
	{
		if (!await step('06-00', 'setup: three working feeds (one slow) and a broken one', () => t.setup(['rss2', 'atom', 'slow', '404']), 45000))
			return;

		let page = null;

		// the row of a source is the first widget around its URL that also holds its Remove button
		const source = url =>
		{
			let node = p.find('label', url, page);
			while (node && !p.find(p.BUTTON, 'Remove', node))
				node = node.get_parent();
			return node;
		};
		// avatar, title, URL, status
		const labels = url => p.findAll('label', undefined, source(url)).map(l => l.get_name());
		const statusOf = url => labels(url).pop();
		const counter = () => p.find('image', /^\d+ sources?, \d+ failed$/, page)?.get_name() ?? '';
		const shown = () => feeds().slice().sort((a, b) => p.rect(source(a)).y - p.rect(source(b)).y);
		const allChecked = () => waitFor('every source to be checked', () => !p.find('label', 'Checking…', page), 40000);
		const muted = url =>
		{
			let bell = p.find(null, 'Notifications', source(url));
			return p.has(bell, 'PRESSED') || p.has(bell, 'CHECKED');
		};
		const menuOrder = () =>
		{
			let urls = new Map([...t.ind()._groups].map(([url, group]) => [group, url]));
			return t.ind()._feedsSection.box.get_children().filter(c => urls.has(c)).map(c => urls.get(c));
		};

		async function openSources()
		{
			await p.open();
			page = await p.page('Sources');
		}

		async function addSource(text)
		{
			let entry = await p.get('text', 'New RSS source URL', page);
			await p.fill(entry, text);
			await key(Clutter.KEY_Return);
		}

		let ready = await step('06-10', 'Sources page shows the counter (N sources, M failed) and a status for every source', async () =>
		{
			await openSources();
			await allChecked();
			same(['rss2', 'atom', 'slow', '404'].map(name => statusOf(u(name))), ['OK (RSS 2.0)', 'OK (Atom)', 'OK (RSS 2.0)', '404 Not Found'], 'status of the sources');
			same(['rss2', 'atom', 'slow'].map(name => labels(u(name))[1]), ['Mock RSS', 'Mock Atom', 'Mock Slow'], 'titles taken from the feeds');
			await eventually(counter, '4 sources, 1 failed', 'counter');
			await p.shot('sources', 'Sources page: four rows with drag handle, avatar, title, URL, status pill (three green OK, one red 404 Not Found), bell, bin and arrow; below them the entry New RSS source URL, Articles kept per feed 200 and Initial unread on.');
		}, 90000);
		if (!ready)
			return;

		await step('06-01', 'Add a valid feed URL: it appears and starts fetching', async () =>
		{
			await addSource(u('rdf'));
			await eventually(() => feeds().map(short), ['rss2', 'atom', 'slow', '404', 'rdf'], 'feeds in the settings');
			await eventually(() => statusOf(u('rdf')), 'OK (RSS 1.0)', 'status of the new row', 10000);
			same(labels(u('rdf')).slice(0, 2), ['MR', 'Mock RDF'], 'avatar and title of the new row');
			same(p.read(await p.get('text', 'New RSS source URL', page)), '', 'entry after the feed was added');
			await eventually(() => t.source('rdf')?.items.length, 5, 'articles the extension loaded for the new feed', 15000);
			check(t.group('rdf'), 'the menu has no group for the new feed');
			await eventually(counter, '5 sources, 1 failed', 'counter');
		});

		await step('06-01a', 'Adding a URL that is already in the list changes nothing', async () =>
		{
			let rows = p.findAll(p.BUTTON, 'Remove', page).length;
			await addSource(u('rdf'));
			await sleep(800);
			same(feeds().filter(url => url === u('rdf')).length, 1, 'times the URL is in the settings');
			same(p.findAll(p.BUTTON, 'Remove', page).length, rows, 'rows');
			await erase(await p.get('text', 'New RSS source URL', page));
		});

		await step('06-02', 'Add an invalid URL: handled gracefully (no crash, sane feedback)', async () =>
		{
			await addSource('not a url');
			await eventually(() => statusOf('not a url'), 'Invalid URL', 'status of the row "not a url"', 8000);
			await addSource(u('garbage'));
			await eventually(() => statusOf(u('garbage')), 'Not a feed', 'status of the page that is not a feed', 8000);
			await eventually(counter, '7 sources, 3 failed', 'counter');

			await eventually(() => t.store().failedCount, 3, 'failed feeds counted by the extension', 15000);
			same(t.ext().state, 1, 'extension state');
			check(!t.ext().error, 'extension error: ' + t.ext().error);
			await p.shot('invalid-urls', 'Seven rows; "not a url" has the red status Invalid URL and the last row the red status Not a feed.');
		});

		await step('06-03', 'Remove a feed: it disappears from the list and from the menu', async () =>
		{
			for (let url of ['not a url', u('garbage')])
			{
				await p.press(p.find(p.BUTTON, 'Remove', source(url)));
				await waitFor('the row of ' + url + ' to go away', () => !source(url));
			}

			same(feeds().map(short), ['rss2', 'atom', 'slow', '404', 'rdf'], 'feeds in the settings');
			same(counter(), '5 sources, 1 failed', 'counter');
			await eventually(() => [t.store().getSources().length, t.store().failedCount], [5, 1], 'feeds and failed feeds of the extension', 10000);
			same(t.ind()._groups.size, 5, 'feed groups in the menu');
		});

		await step('06-04', 'Inline edit custom title: reflected in the menu', async () =>
		{
			await p.clickOn(source(u('atom')), 0.4, 0.5);
			let title = await p.get('text', 'Title', page);
			same(p.read(title), 'Mock Atom', 'Title entry');

			await p.fill(title, 'Renamed Atom');
			await eventually(() => feedMeta('atom').t, 'Renamed Atom', 'title in the settings');
			same(labels(u('atom')).slice(0, 2), ['RA', 'Renamed Atom'], 'avatar and title of the row');
			await eventually(() => t.group('atom').label.text, 'Renamed Atom', 'title of the feed group in the menu');
			await eventually(() => t.group('atom')._avatar.child.text, 'RA', 'avatar of the feed group in the menu');
		});

		await step('06-04a', 'The avatar of a renamed source still follows the custom title after the source is checked again', async () =>
		{
			await p.press(await p.get(p.BUTTON, 'Check all sources', page));
			await sleep(500);
			await allChecked();
			same(t.group('atom')._avatar.child.text, 'RA', 'avatar of the feed group in the menu');
			same(labels(u('atom')).slice(0, 2), ['RA', 'Renamed Atom'], 'avatar and title of the row in the preferences');
		}, 60000);

		await step('06-05', 'Inline edit custom avatar: reflected in the menu', async () =>
		{
			let avatar = await p.get('text', 'Avatar', page);
			await p.fill(avatar, 'QX');
			await eventually(() => feedMeta('atom').v, 'QX', 'avatar in the settings');
			same(labels(u('atom'))[0], 'QX', 'avatar of the row');
			await eventually(() => t.group('atom')._avatar.child.text, 'QX', 'avatar of the feed group in the menu');
			await p.shot('source-edited', 'The second row is expanded and shows the entries Avatar (QX), Title (Renamed Atom) and URL; its header shows the avatar QX and the title Renamed Atom.');
		});

		await step('06-05b', 'Lower case letters typed into Avatar keep their order (xy becomes XY)', async () =>
		{
			let avatar = await p.get('text', 'Avatar', page);
			await p.fill(avatar, 'xy', false);
			await eventually(() => p.read(avatar), 'XY', 'text of the Avatar entry after typing x and y', 3000);
		});

		await step('06-05a', 'An emptied avatar falls back to the initials of the title', async () =>
		{
			await erase(await p.get('text', 'Avatar', page));
			await eventually(() => labels(u('atom'))[0], 'RA', 'avatar of the row');
			same(feedMeta('atom').v, undefined, 'avatar in the settings');
			await eventually(() => t.group('atom')._avatar.child.text, 'RA', 'avatar of the feed group in the menu');

			await p.clickOn(source(u('atom')), 0.4, 0.5);
			await waitFor('the row to collapse', () => !p.find('text', 'Title', page));
		});

		await step('06-07', 'Mute a source: the bell is crossed out and the setting is stored', async () =>
		{
			await p.press(p.find(null, 'Notifications', source(u('rss2'))));
			await eventually(() => feedMeta('rss2').n, true, 'mute flag in the settings');
			check(muted(u('rss2')), 'the bell button does not look pressed');
			await p.shot('muted', 'The bell of Mock RSS is crossed out, the other bells are not.');
		});

		await step('06-06', 'Drag-and-drop reorder', async () =>
		{
			let before = feeds();
			let expected = before.filter(url => url !== u('atom'));
			expected.splice(before.indexOf(u('rdf')), 0, u('atom'));

			let handle = p.rect(p.find('image', undefined, source(u('atom'))));
			let target = p.rect(source(u('rdf')));
			await p.focus();
			await t.drag({ x: handle.x + handle.w / 2, y: handle.y + handle.h / 2 }, { x: target.x + target.w * 0.4, y: target.y + target.h / 2 });
			await p.park();

			await eventually(() => feeds().map(short), expected.map(short), 'order in the settings');
			same(shown().map(short), expected.map(short), 'order of the rows');
			await p.shot('reordered', 'Renamed Atom was dragged to the end: Mock RSS, Mock Slow, the 404 feed, Mock RDF, Renamed Atom.');
		});

		await step('03-07', 'Reordering feeds in prefs is reflected in the menu order', async () =>
		{
			await eventually(() => menuOrder().map(short), feeds().map(short), 'order of the feed groups in the menu');
			await t.openPopup();
			await t.shot('menu-reordered', 'Popup with the feed groups in the new order, Renamed Atom last.');
			await t.closePopup();
		});

		await step('06-06a', 'The order, the custom title and the mute flag are still there after reopening prefs', async () =>
		{
			await p.close();
			await openSources();
			await allChecked();
			same(shown().map(short), feeds().map(short), 'order of the rows');
			same(labels(u('atom'))[1], 'Renamed Atom', 'title of the renamed feed');
			check(muted(u('rss2')), 'the bell of the muted feed is not pressed');
			check(!muted(u('atom')), 'the bell of a feed that was not muted is pressed');
		}, 90000);

		await step('06-11', 'Check all sources works', async () =>
		{
			await p.press(await p.get(p.BUTTON, 'Check all sources', page));
			await eventually(() => statusOf(u('slow')), 'Checking…', 'status of the slow source right after the click', 3000);
			await p.shot('checking', 'Right after Check all sources: the slow feed still shows the grey pill Checking…');
			await allChecked();
			same(['rss2', 'slow', '404', 'rdf', 'atom'].map(name => statusOf(u(name))), ['OK (RSS 2.0)', 'OK (RSS 2.0)', '404 Not Found', 'OK (RSS 1.0)', 'OK (Atom)'], 'status of the sources');
			same(counter(), '5 sources, 1 failed', 'counter');
		}, 60000);

		await step('06-14', 'Articles kept per feed works (lower the limit, refresh: old articles are pruned, starred ones stay)', async () =>
		{
			let rss = t.source('rss2');
			let starred = rss.items.find(item => item.title === 'RSS article 08');
			t.store().toggleStar(rss, starred);

			try
			{
				await p.spin('Articles kept per feed', 4, page);
				await eventually(() => int('items-retained'), 4, 'items-retained in the settings');
				await t.refresh();
				same(t.source('rss2').items.map(item => item.title).sort(), [...numbered('RSS article', 4), 'RSS article 08'], 'articles of Mock RSS');
				same(t.source('atom').items.map(item => item.title).sort(), numbered('Atom entry', 4), 'articles of the Atom feed');
			}
			finally
			{
				t.store().toggleStar(rss, starred);
				t.setValue('items-retained', 200);
			}
		}, 60000);

		await step('06-15', 'Initial unread works: off, the articles of a new feed start as read; on, they start as unread', async () =>
		{
			check(await isOn('Initial unread', page), 'the switch is off although the test profile turns the setting on');
			await p.toggle('Initial unread', page);
			await eventually(() => bool('mark-initial-as-new'), false, 'mark-initial-as-new in the settings');
			await addSource(u('feedburner'));
			await eventually(() => t.source('feedburner')?.items.length, 5, 'articles of the feed added with Initial unread off', 15000);
			same(t.source('feedburner').unreadCount, 0, 'unread articles of the feed added with Initial unread off');

			await p.toggle('Initial unread', page);
			await eventually(() => bool('mark-initial-as-new'), true, 'mark-initial-as-new in the settings');
			await addSource(u('entities'));
			await waitFor('the second feed to load', () => t.source('entities') && t.source('entities').items.length > 0, 15000);
			same(t.source('entities').unreadCount, t.source('entities').items.length, 'unread articles of the feed added with Initial unread on');
		}, 60000);

		await step('07-08p', 'A feed title and a feed URL that contain & are shown in the row of the source', async () =>
		{
			let query = u('atom') + '?a=1&b=2';
			let rows = () => p.findAll(p.BUTTON, 'Remove', page);

			await addSource(query);
			await eventually(() => feeds().includes(query), true, 'the URL with two query parameters is in the settings');
			await eventually(() => rows().length, feeds().length, 'rows');
			await allChecked();

			try
			{
				await p.shot('ampersand', 'The row of the feed Mock Entities & Co must show that title, and the last row must show the URL that ends in atom.xml?a=1&b=2.');
				same(t.group('entities').label.text, 'Mock Entities & Co', 'title of the feed group in the menu');
				same(labels(u('entities'))[1], 'Mock Entities & Co', 'title of the row of the feed that calls itself "Mock Entities & Co"');
				check(p.find('label', query, page), 'no row shows the URL ' + query);
			}
			finally
			{
				// the row cannot be looked up by a URL it may not show; it is the last one
				await p.press(rows().pop());
				await eventually(() => feeds().includes(query), false, 'the URL with two query parameters is in the settings');
			}
		}, 60000);

		await step('06-13', 'Removing a source does not scroll the list back to the top', async () =>
		{
			let gone = numbered('gone', 16).map(name => name.replace(' ', ''));
			await p.close();
			await t.setFeeds([...feeds().map(short), ...gone]);
			await openSources();
			await allChecked();

			let total = feeds().length;
			same(counter(), total + ' sources, ' + (gone.length + 1) + ' failed', 'counter');

			let frame = p.win().get_frame_rect();
			let inView = node => p.rect(node).y > frame.y && p.rect(node).y + p.rect(node).h < frame.y + frame.height;
			let firstRow = () => Math.round(p.rect(source(u('rss2'))).y - frame.y);

			try
			{
				await t.moveTo(frame.x + frame.width / 2, frame.y + frame.height / 2);
				await t.wheel(40);

				let last = u(gone[gone.length - 1]);
				let before = firstRow();
				check(inView(source(last)), 'the wheel did not bring the last source into view');
				check(before < 0, 'the list is not long enough to scroll');

				// a real click, as it gives the button the keyboard focus that is lost with the row
				await p.clickOn(p.find(p.BUTTON, 'Remove', source(last)));
				await waitFor('the row to go away', () => !source(last));
				await sleep(700);
				await p.shot('removed-at-the-end', 'Sources page right after the last source was removed with the mouse while the list was scrolled to its end. Expected: still the end of the list (gone feeds with 404 pills, the entry New RSS source URL, the two option rows).');
				check(firstRow() < 0, 'the list jumped back to the top: its first row was ' + -before + ' px above the window before the click and is ' + firstRow() + ' px below the top of the window after it');
				check(inView(await p.get('text', 'New RSS source URL', page)), 'the end of the list is no longer in view');
				return total + ' sources were checked in batches';
			}
			finally
			{
				await p.park();
			}
		}, 150000);

		await step('06-12', 'Remove all sources… asks for confirmation, then removes everything and shows a toast', async () =>
		{
			let total = feeds().length;
			let button = await p.get(p.BUTTON, 'Remove all sources…', page);

			await p.press(button);
			await p.get('label', 'Remove all sources?');
			await p.get('label', new RegExp('^This removes ' + total + ' feeds and the articles stored for them'));
			await p.shot('remove-all-confirm', 'Dialog Remove all sources? naming ' + total + ' feeds, with the buttons Cancel and Remove All (red).');

			await p.focus();
			await key(Clutter.KEY_Escape);
			await waitFor('the dialog to close', () => !p.find('label', 'Remove all sources?'));
			same(feeds().length, total, 'feeds after Cancel');

			await p.press(button);
			await p.press(await p.get(p.BUTTON, 'Remove All'));
			await eventually(() => feeds().length, 0, 'feeds in the settings after Remove All');
			await p.toast('Removed ' + total + ' feeds');
			same(str('rss-feeds-settings'), '{}', 'per-feed settings');
			same(p.findAll(p.BUTTON, 'Remove', page).length, 0, 'rows left');
			same(counter(), '0 sources, 0 failed', 'counter');
			await eventually(() => t.ind()._groups.size, 0, 'feed groups in the menu', 8000);
			await p.shot('removed-all', 'Empty Sources page with the toast Removed ' + total + ' feeds at the bottom.');
		}, 45000);

		await step('13-01p', 'Empty feed list after Remove all: the popup opens and shows no feeds', async () =>
		{
			await p.close();
			await t.openPopup();
			same(t.store().totalUnread, 0, 'unread articles');
			check(!t.header()._badge.visible, 'the unread badge is still visible');
			await t.shot('menu-empty', 'Popup without feed groups: only the header.');
			await t.closePopup();
		});
	};

	t.scenarios.actions = async () =>
	{
		if (!await step('18-00', 'setup: one feed with ten unread articles', () => t.setup(['rss2']), 45000))
			return;

		const HOVER = ['First button', 'Second button', 'Third button'];
		const MOUSE = ['Left click', 'Middle click', 'Right click'];
		const KEYS = ['hover-action-1', 'hover-action-2', 'hover-action-3', 'click-action-left', 'click-action-middle', 'click-action-right'];
		const HOVER_OPTIONS = ['None', 'Mark as read / unread', 'Star / unstar', 'Dismiss', 'Mark older as read', 'Copy link', 'Open only'];
		const CLICK_OPTIONS = ['None', 'Open and mark as read', 'Open only', 'Mark as read / unread', 'Star / unstar', 'Dismiss', 'Mark older as read', 'Copy link'];
		const DEFAULTS = ['Mark as read / unread', 'Star / unstar', 'None', 'Open and mark as read', 'Open only', 'Copy link'];

		const hoverSlots = () => KEYS.slice(0, 3).map(str);
		const clickActions = () => KEYS.slice(3).map(str);
		const rows = () => t.classicRows(t.group('rss2'));
		let page = null;

		async function shownConfig()
		{
			let texts = [];
			for (let title of [...HOVER, ...MOUSE])
				texts.push(await p.chosen(title, page));
			return texts;
		}

		async function hoverButtons(index)
		{
			await t.openPopup();
			await t.expand(t.group('rss2'), 3);

			let row = rows()[index];
			await t.hover(row, 0.35, 0.5);
			await sleep(500);
			return row._hoverButtons.visible ? row._hoverButtons._slots.map(slot => slot.id) : [];
		}

		let ready = await step('18-01', 'Actions page has groups Hover buttons (First / Second / Third button) and Mouse buttons (Left / Middle / Right click)', async () =>
		{
			await p.open();
			page = await p.page('Actions');
			await p.get('label', 'Hover buttons', page);
			await p.get('label', 'Mouse buttons', page);
			same(await shownConfig(), DEFAULTS, 'what the six rows show');
			await p.shot('actions', 'Actions page: Hover buttons with First button Mark as read / unread, Second button Star / unstar, Third button None; Mouse buttons with Left click Open and mark as read, Middle click Open only, Right click Copy link; Reset to defaults greyed out.');
		}, 60000);
		if (!ready)
			return;

		await step('18-02', 'Left click offers only Open and mark as read and Open only', async () =>
		{
			same(await p.listOptions('Left click', page), ['Open and mark as read', 'Open only'], 'choices of Left click');
			same(await p.listOptions('Middle click', page), CLICK_OPTIONS, 'choices of Middle click');
			same(await p.listOptions('Right click', page), CLICK_OPTIONS, 'choices of Right click');
			for (let title of HOVER)
				same(await p.listOptions(title, page), HOVER_OPTIONS, 'choices of ' + title);

			await p.openCombo('First button', page);
			await p.shot('hover-choices', 'Open list of First button with seven choices from None to Open only, Mark as read / unread is ticked.');
			await key(Clutter.KEY_Escape);
			await waitFor('the list to close', () => !p.popup());
		}, 60000);

		await step('18-06a', 'Reset to defaults is inactive while everything is at its default', async () =>
		{
			check(!p.enabled(await p.row('Reset to defaults', page)), 'Reset to defaults is active');
		});

		await step('18-03', 'Choosing an action already used by another hover slot swaps the two slots', async () =>
		{
			await p.choose('First button', 'Star / unstar', page);
			await eventually(hoverSlots, ['star', 'read', 'none'], 'hover slots in the settings');
			same((await shownConfig()).slice(0, 3), ['Star / unstar', 'Mark as read / unread', 'None'], 'what the hover rows show');
			check(p.enabled(await p.row('Reset to defaults', page)), 'Reset to defaults is still inactive');
			await p.shot('swapped', 'First button now shows Star / unstar and Second button Mark as read / unread; Reset to defaults is no longer greyed out.');
		});

		await step('18-05', 'Changes apply to the popup without re-enabling the extension', async () =>
		{
			same(await hoverButtons(1), ['star', 'read'], 'hover buttons of an article row');
			await t.shot('hover-swapped', 'Second article hovered: the star button comes first, the envelope second.', t.area(rows()[0], rows()[2]));
			await t.closePopup();
		});

		await step('18-04', 'Setting a slot to None hides that button; with all three None no buttons appear', async () =>
		{
			await p.choose('Second button', 'None', page);
			await eventually(hoverSlots, ['star', 'none', 'none'], 'hover slots in the settings');
			same(await hoverButtons(1), ['star'], 'hover buttons with one slot left');
			await t.closePopup();

			await p.choose('First button', 'None', page);
			await eventually(hoverSlots, ['none', 'none', 'none'], 'hover slots in the settings');
			same(await hoverButtons(1), [], 'hover buttons with all three slots set to None');
			check(rows()[1]._timeLabel.get_parent().visible, 'the time of the hovered row is hidden although it has no buttons');
			await t.shot('no-hover-buttons', 'Second article hovered with all slots set to None: no buttons, the relative time stays.', t.area(rows()[0], rows()[2]));
			await t.closePopup();
		}, 60000);

		await step('18-05a', 'Mouse buttons chosen in prefs are what the clicks in the popup do', async () =>
		{
			await p.choose('Right click', 'Dismiss', page);
			await p.choose('Middle click', 'Star / unstar', page);
			await p.choose('Left click', 'Open only', page);
			await eventually(clickActions, ['open', 'star', 'dismiss'], 'click actions in the settings');

			await t.openPopup();
			await t.expand(t.group('rss2'), 10);
			let [first, second, third] = rows().map(row => row._item);

			await click(rows().find(row => row._item === second), MIDDLE, 0.35, 0.5);
			check(second.starred, 'the middle click did not star the article');
			await sleep(500);

			let before = t.openedUrls().length;
			await click(rows().find(row => row._item === first), LEFT, 0.35, 0.5);
			await eventually(() => t.openedUrls().length, before + 1, 'URLs opened by the left click', 8000);
			same(t.openedUrls().pop(), first.link, 'opened URL');
			check(!first.read, 'Open only marked the article as read');
			check(t.ind().menu.isOpen, 'Open only closed the popup');

			await click(rows().find(row => row._item === third), RIGHT, 0.35, 0.5);
			check(third.dismissed, 'the right click did not dismiss the article');
			await t.closePopup();
		}, 60000);

		await step('18-05b', 'A setting changed outside the window is picked up by its row', async () =>
		{
			t.setValue('hover-action-3', 'copy');
			await eventually(() => p.chosen('Third button', page), 'Copy link', 'what Third button shows');
		});

		await step('18-06', 'Reset to defaults restores the defaults (read, star, none / open and mark read, open only, copy link)', async () =>
		{
			let reset = await p.row('Reset to defaults', page);
			check(p.enabled(reset), 'Reset to defaults is inactive');
			await p.press(reset);
			await p.park();

			await eventually(() => KEYS.map(str), ['read', 'star', 'none', 'openread', 'open', 'copy'], 'actions in the settings');
			same(await shownConfig(), DEFAULTS, 'what the six rows show');
			await waitFor('Reset to defaults to turn inactive', () => !p.enabled(reset));
			await p.shot('reset', 'Actions page back at the defaults, Reset to defaults greyed out again.');
			return 'the reset row is a ' + reset.get_role_name();
		});

		await step('18-06b', 'After the reset the popup shows the default hover buttons again', async () =>
		{
			same(await hoverButtons(0), ['read', 'star'], 'hover buttons of an article row');
			await t.closePopup();
			await p.close();
		});
	};

	t.scenarios.opml = async () =>
	{
		const file = name => t.config().profile + '/' + name;
		const loaded = () => t.store().getSources().map(source => short(source.url) + ' ' + (source.items.length > 0 ? 'loaded' : 'empty')).sort();
		const perFeed = () => Object.entries(JSON.parse(str('rss-feeds-settings'))).map(([url, data]) => [short(url), data]).sort((a, b) => a[0].localeCompare(b[0]));
		let page = null;
		const rowCount = () => p.findAll(p.BUTTON, 'Remove', page).length;

		if (!await step('19-00', 'setup: two feeds and three files to import in the test profile', async () =>
		{
			await t.setup(['rss2', 'atom']);

			let outline = (name, title) => '<outline type="rss" text="' + title + '" title="' + title + '" xmlUrl="' + u(name) + '"/>';
			let opml = body => '<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>e2e</title></head><body>' + body + '</body></opml>\n';
			GLib.file_set_contents(file('import.opml'), opml('<outline text="News" title="News">' + outline('feedburner', 'Burner from OPML') + '</outline>' +
				outline('rdf', 'RDF from OPML') + outline('rss2', 'Duplicate')));
			GLib.file_set_contents(file('broken.opml'), '<opml><body><outline text="a" xmlUrl="' + u('entities') + '"></body></opml>\n');
			GLib.file_set_contents(file('notes.txt'), 'this is not an OPML file\n');
		}, 45000))
			return;

		// on GNOME 47 the driver can lose the window when the file chooser closes. A new window is readable again, but the toast of
		// the old one is gone with it, so that one check is left out then.
		let lostWindow = false;

		async function confirm()
		{
			lostWindow = await p.confirmFile();
			if (!lostWindow)
				return;

			await p.close();
			await p.open();
			page = await p.page('Sources');
		}

		async function toast(text, timeout)
		{
			if (!lostWindow)
				await p.toast(text, timeout);
		}

		async function importFile(name)
		{
			await p.press(await p.get(p.BUTTON, 'Import OPML…', page));
			await p.chooseFile(file(name));
			await confirm();
		}

		let ready = await step('19-01', 'Import OPML… imports a file with folders preserved and skips duplicates', async () =>
		{
			await p.open();
			page = await p.page('Sources');

			await p.press(await p.get(p.BUTTON, 'Import OPML…', page));
			await p.chooseFile(file('import.opml'));
			await p.shot('import-dialog', 'File chooser Import OPML over the preferences window, the path of import.opml typed into its location entry. The chooser belongs to GTK, not to the extension.');
			await confirm();

			await toast('Imported 2 feeds (1 duplicate skipped)');
			same(feeds().map(short), ['rss2', 'atom', 'feedburner', 'rdf'], 'feeds in the settings');
			same(feedMeta('feedburner'), { t: 'Burner from OPML', f: 'News' }, 'title and folder of the feed inside the folder News');
			same(feedMeta('rdf'), { t: 'RDF from OPML' }, 'title of the feed outside any folder');
			same(rowCount(), 4, 'rows');
			await eventually(loaded, ['atom loaded', 'feedburner loaded', 'rdf loaded', 'rss2 loaded'], 'feeds of the extension', 15000);
			same(t.group('feedburner').label.text, 'Burner from OPML', 'title of the imported feed in the menu');
			await p.shot('imported', 'Sources page with four rows, the last two are Burner from OPML and RDF from OPML; toast Imported 2 feeds (1 duplicate skipped).');
		}, 90000);
		if (!ready)
			return;

		await step('19-01a', 'Import OPML…: "No new feeds found in file" for nothing new', async () =>
		{
			await importFile('import.opml');
			await toast('No new feeds found in file', 15000);
			same(feeds().length, 4, 'feeds in the settings');
			same(rowCount(), 4, 'rows');
		}, 60000);

		await step('19-01b', 'Import OPML…: an error toast for a broken file', async () =>
		{
			await importFile('broken.opml');
			await toast('Could not parse OPML file', 15000);
			same(feeds().length, 4, 'feeds in the settings');
			await p.shot('import-broken', 'Sources page unchanged with the toast Could not parse OPML file.');
		}, 60000);

		await step('19-01c', 'Import OPML…: a file that is not OPML at all imports nothing', async () =>
		{
			await importFile('notes.txt');
			await toast('No new feeds found in file', 15000);
			same(feeds().length, 4, 'feeds in the settings');
		}, 60000);

		await step('19-01d', 'Import OPML…: Cancel in the file chooser changes nothing', async () =>
		{
			await p.press(await p.get(p.BUTTON, 'Import OPML…', page));
			let dialog = await waitFor('the file chooser', p.chooser, 10000);
			await p.focus(dialog);
			await key(Clutter.KEY_Escape);
			await waitFor('the file chooser to close', () => !p.chooser(), 10000);
			same(feeds().length, 4, 'feeds in the settings');
			check(p.win(), 'the preferences window closed together with the file chooser');
		});

		await step('19-02', 'Export OPML… writes a valid file; the toast shows "Exported N feeds"', async () =>
		{
			await p.press(await p.get(p.BUTTON, 'Export OPML…', page));
			await p.chooseFile(file('export.opml'), true);
			await confirm();
			await toast('Exported 4 feeds', 15000);

			let text = t.readText(file('export.opml'));
			same([...text.matchAll(/xmlUrl="([^"]+)"/g)].map(m => short(m[1])).sort(), ['atom', 'feedburner', 'rdf', 'rss2'], 'feeds in the file');
			check(/<outline text="News" title="News">\s*<outline text="Burner from OPML"[^>]*feedburner\.xml"\/>\s*<\/outline>/.test(text), 'the folder News does not wrap its feed: ' + text);
			check(text.includes('text="Mock RSS"') && text.includes('text="RDF from OPML"'), 'a feed title is missing: ' + text);
			await p.shot('exported', 'Sources page with the toast Exported 4 feeds.');
		}, 60000);

		await step('19-02a', 'The exported file imports again into an empty list', async () =>
		{
			let before = { feeds: feeds().map(short).sort(), settings: perFeed() };

			await p.press(await p.get(p.BUTTON, 'Remove all sources…', page));
			await p.press(await p.get(p.BUTTON, 'Remove All'));
			await eventually(() => feeds().length, 0, 'feeds in the settings after Remove All');

			await importFile('export.opml');
			await toast('Imported 4 feeds', 20000);
			same(feeds().map(short).sort(), before.feeds, 'feeds in the settings');
			same(perFeed(), before.settings, 'titles and folders');
			await eventually(loaded, ['atom loaded', 'feedburner loaded', 'rdf loaded', 'rss2 loaded'], 'feeds of the extension', 15000);
		}, 90000);

		await step('19-01e', 'An imported feed is fetched also when the Shell is busy while the import writes its settings', async () =>
		{
			await p.close();

			// a second process writes what the import writes, the per-feed settings first and the list last
			GLib.file_set_contents(file('writer.js'), [
				'const { Gio } = imports.gi;',
				'let source = Gio.SettingsSchemaSource.new_from_directory(ARGV[0], Gio.SettingsSchemaSource.get_default(), false);',
				"let settings = new Gio.Settings({ settings_schema: source.lookup('org.gnome.shell.extensions.rss-feed', false) });",
				"settings.set_string('rss-feeds-settings', ARGV[1]);",
				"settings.set_strv('rss-feeds-list', JSON.parse(ARGV[2]));",
				'Gio.Settings.sync();',
			].join('\n') + '\n');

			let list = [...feeds(), u('latin2')];
			let perFeedSettings = JSON.parse(str('rss-feeds-settings'));
			perFeedSettings[u('latin2')] = { t: 'Imported while busy' };
			GLib.spawn_async(null, ['gjs', file('writer.js'), t.ext().path + '/schemas', JSON.stringify(perFeedSettings), JSON.stringify(list)], null, GLib.SpawnFlags.SEARCH_PATH, null);

			// both changes are already there when the main loop gets to the first of them
			GLib.usleep(2500000);

			await eventually(() => feeds().length, list.length, 'feeds in the settings after the second process wrote them');
			await eventually(() => t.source('latin2')?.items.length, 3, 'articles loaded for the feed that arrived while the Shell was busy', 10000);
		}, 45000);
	};
})();
