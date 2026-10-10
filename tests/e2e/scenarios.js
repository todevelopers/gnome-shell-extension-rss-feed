/* global imports, Main */

// Step ids start with the section of the Pre-Release Test Checklist they cover; 00 is the harness itself.
(() =>
{
	const { Clutter, St } = imports.gi;

	const t = globalThis.e2e;
	const { step, shot, sleep, waitFor, check, same, click, clickAt, hover, key, moveTo } = t;

	const LEFT = Clutter.BUTTON_PRIMARY;
	const MIDDLE = Clutter.BUTTON_MIDDLE;
	const RIGHT = Clutter.BUTTON_SECONDARY;

	const uuid = () => t.config().uuid;
	const overflow = () => t.header()._menu;
	const overflowItems = () => overflow()._getMenuItems().filter(i => i.visible && i.label && i.label.text);
	const overflowLabels = () => overflowItems().map(i => i.label.text);
	const overflowItem = text => overflowItems().find(i => i.label.text.startsWith(text));
	const numbered = (prefix, count) => Array.from({ length: count }, (_, i) => prefix + ' ' + String(i + 1).padStart(2, '0'));
	const away = () => moveTo(700, 700);
	const updated = () => /^Updated at \d{1,2}\D\d{2}/.test(t.status());

	function indicatorCount()
	{
		let count = 0;
		for (let box of [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox])
		{
			for (let container of box.get_children())
			{
				let child = container.get_first_child();
				if (child && child.constructor.name === 'RssIndicator')
					count++;
			}
		}
		return count;
	}

	function descendants(actor, test, found = [])
	{
		for (let child of actor.get_children())
		{
			if (test(child))
				found.push(child);
			descendants(child, test, found);
		}
		return found;
	}

	async function openOverflow()
	{
		await t.openPopup();
		if (overflow().isOpen)
			return;

		await click(t.header()._navButtons[2]);
		await waitFor('the ⋮ menu to open', () => overflow().isOpen);
	}

	async function opened(before, link)
	{
		await waitFor('the browser to be started', () => t.openedUrls().length === before + 1, 8000);
		same(t.openedUrls().pop(), link, 'opened URL');
	}

	t.scenarios.smoke = async () =>
	{
		await step('00-10', 'screenshot of the whole screen through the driver', async () =>
		{
			await shot('screen', 'Whole screen: top panel with the RSS icon on the right, no popup open.', null);
		});

		await step('00-11', 'real click on the panel icon opens the popup', async () =>
		{
			await click(t.ind());
			await waitFor('the popup to open', () => t.ind().menu.isOpen);
			await shot('popup-empty', 'Popup without feeds: logo, RSS Feed title, empty status line, ⋮ button. No badge, no failed pill.');
		});

		await step('00-12', 'Escape key closes the popup', async () =>
		{
			await key(Clutter.KEY_Escape);
			await waitFor('the popup to close', () => !t.ind().menu.isOpen);
		});
	};

	t.scenarios.lifecycle = async () =>
	{
		let ready = await step('01-01', 'Fresh install enables without error', async () =>
		{
			same(t.ext().state, 1, 'extension state');
			check(!t.ext().error, 'extension error: ' + t.ext().error);
			same(indicatorCount(), 1, 'panel indicators');

			await t.setup(['rss2', 'atom'], { 'display-mode': 'notifications-and-widget' });
			same(t.store().getSources().map(s => s.items.length), [10, 5], 'articles per feed');
			same(t.store().totalUnread, 15, 'unread articles');
		}, 45000);
		if (!ready)
			return;

		await step('01-02', 'Disable: no errors, the panel icon is gone', async () =>
		{
			let rss = t.source('rss2');
			for (let item of rss.items.slice(0, 3))
				t.store().markRead(rss, item);
			same(t.store().totalUnread, 12, 'unread articles after reading three');

			Main.extensionManager.disableExtension(uuid());
			await waitFor('the extension to be disabled', () => t.ext().state !== 1, 10000);
			same(t.ext().state, 2, 'extension state');
			check(!t.ind(), 'the indicator is still in the status area');
			same(indicatorCount(), 0, 'panel indicators');
			await shot('disabled', 'Top panel after disable: no RSS icon.', t.panelStrip());
		});

		await step('01-03', 'Disable then re-enable: still works, no duplicate panel icon', async () =>
		{
			Main.extensionManager.enableExtension(uuid());
			await waitFor('the extension to be enabled', () => t.ext().state === 1 && t.ind() && t.store(), 15000);
			same(indicatorCount(), 1, 'panel indicators');
			await waitFor('both feeds to be back', () => t.store().getSources().length === 2 && t.store().getSources().every(s => s.items.length > 0), 15000);
		});

		await step('20-02', 'Unread state is kept after disable and re-enable', async () =>
		{
			await waitFor('the unread count to be restored', () => t.store().totalUnread === 12, 8000).catch(() => {});
			same(t.store().totalUnread, 12, 'unread articles');
			same(t.source('rss2').items.slice(0, 3).map(i => i.read), [true, true, true], 'read state of the three read articles');
		});

		await step('01-04', 'Toggle enable/disable several times quickly: no leaks or errors', async () =>
		{
			for (let i = 0; i < 10; i++)
			{
				Main.extensionManager.disableExtension(uuid());
				await sleep(150);
				Main.extensionManager.enableExtension(uuid());
				await sleep(150);
			}

			await waitFor('the extension to settle', () => t.ext().state === 1 && t.ind() && t.store(), 20000).catch(() => {});
			await sleep(1500);
			same(t.ext().state, 1, 'extension state');
			check(!t.ext().error, 'extension error: ' + t.ext().error);
			same(indicatorCount(), 1, 'panel indicators');
			await waitFor('both feeds to be back', () => t.store().getSources().length === 2 && t.store().getSources().every(s => s.items.length > 0), 15000);
			same(t.store().totalUnread, 12, 'unread articles');
		}, 60000);

		await step('01-04b', 'After the toggling the popup still opens and lists both feeds', async () =>
		{
			await t.openPopup();
			same([...t.ind()._groups.values()].map(g => g.label.text), ['Mock RSS', 'Mock Atom'], 'feed groups');
			await shot('after-toggle', 'One RSS icon in the panel. Popup lists Mock RSS (pill 7) and Mock Atom (pill 5), header badge 12.');
			await t.closePopup();
		});
	};

	t.scenarios.panel = async () =>
	{
		if (!await step('02-00', 'setup: one feed with ten unread articles', () => t.setup(['rss2']), 45000))
			return;

		await step('02-01', 'RSS icon shows in the panel', async () =>
		{
			check(t.ind().mapped, 'the indicator is not mapped');
			await shot('panel', 'RSS icon in the top panel with a small unread dot to its left.', t.panelStrip());
		});

		await step('02-02', 'Unread dot appears left of the RSS icon when there are unread articles', async () =>
		{
			let dot = t.ind()._iconLabel;
			check(dot.visible && dot.mapped, 'the unread dot is not visible');
			check(t.bounds(dot).x < t.bounds(dot.get_next_sibling()).x, 'the dot is not left of the icon');
		});

		await step('02-07', 'Clicking the icon opens the popup menu', async () =>
		{
			await click(t.ind());
			await waitFor('the popup to open', () => t.ind().menu.isOpen);
			same(t.header()._badge._label.text, '10', 'header badge');
			await shot('popup', 'Popup with one feed group Mock RSS and count pill 10, header badge 10, status Updated at HH:MM.');
		});

		await step('05-07', 'Unread badge in the header: the first click arms the two-step confirm', async () =>
		{
			let badge = t.header()._badge;
			await click(badge);
			check(badge._confirmMode, 'the badge is not armed');
			same(t.store().totalUnread, 10, 'unread articles');
			await shot('badge-armed', 'Header badge shows a check mark instead of the number 10.', t.area(t.header()));
		});

		await step('05-08', 'Clicking elsewhere cancels an armed badge confirm', async () =>
		{
			let badge = t.header()._badge;
			await click(t.header(), LEFT, 0.3, 0.5);
			check(!badge._confirmMode, 'the badge is still armed');
			check(t.ind().menu.isOpen, 'the popup closed');
			same(t.store().totalUnread, 10, 'unread articles');
		});

		await step('05-07b', 'The second click on the armed badge marks all as read', async () =>
		{
			let badge = t.header()._badge;
			await click(badge);
			check(badge._confirmMode, 'the badge is not armed');
			await click(badge);
			same(t.store().totalUnread, 0, 'unread articles');
			check(!badge.visible, 'the badge is still visible at 0 unread');
		});

		await step('02-03', 'Dot disappears when unread count reaches 0 (mark all read)', async () =>
		{
			check(!t.ind()._iconLabel.visible, 'the unread dot is still visible');
			await shot('all-read', 'No unread dot in the panel, no badge in the header, the Mock RSS group has no count pill.');
			await t.closePopup();
			await away();
			await shot('panel-all-read', 'Top panel: RSS icon without the unread dot.', t.panelStrip());
		});
	};

	t.scenarios.header = async () =>
	{
		if (!await step('14-00', 'setup: three working feeds (one slow) and two broken ones', () => t.setup(['rss2', 'atom', 'slow', '404', 'garbage']), 45000))
			return;

		await step('14-01', 'Popup width is 400 px', async () =>
		{
			await t.openPopup();
			same(t.ind().menu.actor.width, 400, 'popup width');
		});

		await step('14-02', 'Header right side is [N failed pill] [unread badge] [⋮]; there are no standalone Refresh / Settings buttons', async () =>
		{
			let [pill, badge, more] = t.header()._navButtons;
			check(pill.visible, 'the failed pill is hidden');
			same(pill.child.text, '2 failed', 'failed pill');
			check(badge.visible, 'the unread badge is hidden');
			same(badge._label.text, '17', 'unread badge');
			check(more.visible, 'the ⋮ button is hidden');

			let xs = [pill, badge, more].map(a => Math.round(t.bounds(a).x));
			check(xs[0] < xs[1] && xs[1] < xs[2], 'order of the header controls by x: ' + xs.join(', '));
			same(descendants(t.header(), c => c instanceof St.Button && c.visible).length, 3, 'buttons in the header');
			await shot('header', 'Header: logo, RSS Feed, status Updated at HH:MM, then the 2 failed pill, badge 17 and ⋮ at the right.', t.area(t.header()));
		});

		await step('14-03', 'Status line shows "Updated at HH:MM" after an update', async () =>
		{
			check(updated(), 'status line: "' + t.status() + '"');
		});

		await step('14-04', 'The "N failed" pill does not wrap even for "Updating… 120/400"', async () =>
		{
			let pill = t.header()._failedPill;
			let before = t.bounds(pill);

			try
			{
				t.ind().markProgress(120, 400);
				await sleep(300);
				let after = t.bounds(pill);
				same(t.status(), 'Updating… 120/400', 'status line');
				same([after.h, Math.round(after.y)], [before.h, Math.round(before.y)], 'height and vertical position of the pill');
				same(pill.child.clutter_text.get_layout().get_line_count(), 1, 'lines of text in the pill');
				check(after.x + after.w <= t.bounds(t.header()._badge).x, 'the pill runs into the unread badge');
				await shot('progress-120-400', 'Status Updating… 120/400 and the 2 failed pill on one line, the pill not wrapped or cut.', t.area(t.header()));
			}
			finally
			{
				t.ind().markUpdated(t.obj()._poller.lastUpdated);
			}
		});

		await step('14-01b', 'The status text truncates with an ellipsis instead of pushing the layout', async () =>
		{
			try
			{
				t.header()._setStatus('Updating… 120/400 ' + 'and a status text far too long for the popup '.repeat(4));
				await sleep(300);
				same(t.ind().menu.actor.width, 400, 'popup width');
				check(t.header()._subtitle.clutter_text.get_layout().is_ellipsized(), 'the status text is not ellipsized');
				await shot('status-ellipsis', 'Long status text ends with an ellipsis; pill, badge and ⋮ keep their place and the popup is not wider.', t.area(t.header()));
			}
			finally
			{
				t.ind().markUpdated(t.obj()._poller.lastUpdated);
			}
		});

		await step('14-07a', '⋮ menu opens and offers Refresh, Mark all as read and Settings', async () =>
		{
			await openOverflow();
			same(overflowLabels(), ['Refresh', 'Mark all as read', 'Settings'], 'visible items of the ⋮ menu');
			await shot('overflow-menu-open', '⋮ menu open under the ⋮ button: Refresh, Mark all as read, a separator, Settings. No Restore dismissed, no Unstar all.');
		});

		await step('14-13a', 'Escape closes the ⋮ menu and leaves the popup open', async () =>
		{
			await openOverflow();
			await key(Clutter.KEY_Escape);
			await waitFor('the ⋮ menu to close', () => !overflow().isOpen);
			check(t.ind().menu.isOpen, 'the popup closed together with the ⋮ menu');
		});

		await step('14-12', 'Click outside the ⋮ menu closes only the ⋮ menu; a second click closes the popup', async () =>
		{
			await openOverflow();
			await clickAt(700, 600);
			await waitFor('the ⋮ menu to close', () => !overflow().isOpen);
			check(t.ind().menu.isOpen, 'the first click closed the popup too');
			await clickAt(700, 600);
			await waitFor('the popup to close', () => !t.ind().menu.isOpen);
		});

		await step('14-13', 'Escape order: badge confirm, then ⋮ menu, then popup', async () =>
		{
			await t.openPopup();
			let badge = t.header()._badge;
			await click(badge);
			check(badge._confirmMode, 'the badge is not armed');
			await key(Clutter.KEY_Escape);
			check(!badge._confirmMode, 'Escape did not cancel the badge confirm');
			check(t.ind().menu.isOpen, 'the first Escape closed the popup');

			await openOverflow();
			await key(Clutter.KEY_Escape);
			check(!overflow().isOpen, 'Escape did not close the ⋮ menu');
			check(t.ind().menu.isOpen, 'the second Escape closed the popup');

			await key(Clutter.KEY_Escape);
			await waitFor('the popup to close', () => !t.ind().menu.isOpen);
		});

		await step('14-14', 'Closing the popup also closes the ⋮ menu', async () =>
		{
			await openOverflow();
			t.ind().menu.close();
			await waitFor('the popup to close', () => !t.ind().menu.isOpen);
			check(!overflow().isOpen, 'the ⋮ menu stayed open');
		});

		await step('14-07', '⋮ menu: Refresh starts an update (progress counter appears)', async () =>
		{
			await openOverflow();
			await click(overflowItem('Refresh'));
			await waitFor('the progress counter', () => /^Updating… \d+\/5$/.test(t.status()), 3000);
			let seen = t.status();
			await shot('refresh-progress', 'Status line shows Updating… N/5 while the slow feed is still loading.', t.ind().menu.isOpen ? t.area(t.header()) : null);
			await waitFor('the update to finish', updated, 25000);
			return 'saw "' + seen + '", popup ' + (t.ind().menu.isOpen ? 'stayed open' : 'closed');
		}, 45000);

		await step('14-08', '⋮ menu: Mark all as read works and is inactive at 0 unread', async () =>
		{
			await openOverflow();
			await click(overflowItem('Mark all as read'));
			same(t.store().totalUnread, 0, 'unread articles');

			await openOverflow();
			check(!t.header()._markAllItem.sensitive, 'Mark all as read is still active at 0 unread');
			await shot('mark-all-inactive', '⋮ menu with Mark all as read greyed out.');
			await key(Clutter.KEY_Escape);
		});

		await step('14-09', '⋮ menu: Restore dismissed (N) is visible only when N > 0', async () =>
		{
			let rss = t.source('rss2');
			t.store().dismiss(rss, rss.items[0]);
			t.store().dismiss(rss, rss.items[1]);

			await openOverflow();
			same(overflowLabels(), ['Refresh', 'Mark all as read', 'Restore dismissed (2)', 'Settings'], 'visible items of the ⋮ menu');
			await shot('restore-dismissed', '⋮ menu with the extra item Restore dismissed (2).');
			await click(overflowItem('Restore dismissed'));
			same(t.store().dismissedCount(), 0, 'dismissed articles');
			same(t.status(), '2 articles restored', 'flash message');
		});

		await step('14-10', '⋮ menu: Unstar all (N) is visible only when N > 0', async () =>
		{
			let feed = t.source('atom');
			t.store().toggleStar(feed, feed.items[0]);

			await openOverflow();
			same(overflowLabels(), ['Refresh', 'Mark all as read', 'Unstar all (1)', 'Settings'], 'visible items of the ⋮ menu');
			await shot('unstar-all', '⋮ menu with the extra item Unstar all (1); a Starred group is in the list behind it.');
			await click(overflowItem('Unstar all'));
			same(t.store().starredCount(), 0, 'starred articles');
			same(t.status(), '1 article unstarred', 'flash message');
		});

		await step('14-15', 'Flash messages show in the status line for about 2 s, then the previous text returns', async () =>
		{
			await waitFor('the status line to settle', updated, 5000);
			let feed = t.source('atom');
			t.store().toggleStar(feed, feed.items[0]);

			await openOverflow();
			let item = overflowItem('Unstar all');
			let started = Date.now();
			await click(item);
			same(t.status(), '1 article unstarred', 'flash message');
			await shot('flash', 'Status line shows the flash message "1 article unstarred" in place of Updated at HH:MM.', t.area(t.header()));
			await waitFor('the previous status text to return', updated, 5000);

			let elapsed = Date.now() - started;
			check(elapsed > 1500 && elapsed < 3500, 'the flash lasted about ' + elapsed + ' ms');
			return 'flash lasted about ' + elapsed + ' ms';
		});

		await step('14-05', 'The "N failed" pill is hidden when "Show failed feeds indicator" is OFF', async () =>
		{
			let pill = t.header()._failedPill;
			check(pill.visible, 'the pill is hidden before the setting changes');
			t.setValue('show-failed-feeds', false);
			await waitFor('the pill to hide', () => !pill.visible);
			await shot('pill-off', 'Header without the 2 failed pill.', t.area(t.header()));
			t.setValue('show-failed-feeds', true);
			await waitFor('the pill to come back', () => pill.visible);
		});

		await step('14-06', 'The failed pill disappears after the failing source is removed', async () =>
		{
			await t.setFeeds(['rss2', 'atom', 'slow']);
			await waitFor('the pill to hide', () => !t.header()._failedPill.visible);
			same(t.store().failedCount, 0, 'failed feeds');
		});

		await step('14-16', 'Switching display mode from notifications-only to widget-only keeps the status text', async () =>
		{
			await t.closePopup();
			t.setValue('display-mode', 'notifications-only');
			await waitFor('the panel icon to go away', () => !t.ind());
			t.setValue('display-mode', 'widget-only');
			await waitFor('the panel icon to come back', () => t.ind());
			await t.openPopup();
			check(updated(), 'status line: "' + t.status() + '"');
			await shot('mode-switch', 'Popup after notifications-only then widget-only: the status line still says Updated at HH:MM.');
		});

		await step('14-11', '⋮ menu: Settings opens preferences and closes the popup', async () =>
		{
			await openOverflow();
			await click(overflowItem('Settings'));
			await waitFor('the popup to close', () => !t.ind().menu.isOpen);
			await sleep(6000);
			await shot('settings-clicked', 'Whole screen a few seconds after Settings: the popup is closed. The preferences window may be visible (not asserted).', null);
		});
	};

	t.scenarios.classic = async () =>
	{
		if (!await step('15-00', 'setup: two feeds in the Classic layout, every article unread', () => t.setup(['rss2', 'atom']), 45000))
			return;

		const rss = () => t.group('rss2');
		const rows = () => t.classicRows(rss());

		await step('03-01', 'Each feed shows as a submenu with an avatar and an unread count pill', async () =>
		{
			await t.openPopup();
			let groups = [...t.ind()._groups.values()];
			same(groups.map(g => g.label.text), ['Mock RSS', 'Mock Atom'], 'feed groups');
			same(groups.map(g => g._avatar.child.text), ['MR', 'MA'], 'avatars');
			same(groups.map(g => g._countBadge._label.text), ['10', '5'], 'count pills');
			check(!t.ind()._starredGroup.visible, 'the Starred group is visible with nothing starred');
			await shot('groups', 'Two collapsed feed groups: avatar MR, Mock RSS, pill 10 and avatar MA, Mock Atom, pill 5. No Starred group.');
		});

		await step('05-09', 'Per-feed badge in the Classic layout marks the articles of that feed as read', async () =>
		{
			let badge = t.group('atom')._countBadge;
			await click(badge);
			check(badge._confirmMode, 'the count pill is not armed');
			check(!t.group('atom').menu.isOpen, 'the click on the pill opened the feed group');
			await shot('feed-badge-armed', 'The pill of Mock Atom shows a check mark instead of 5.', t.area(t.group('rss2'), t.group('atom')));
			await click(badge);
			same(t.source('atom').unreadCount, 0, 'unread articles of Mock Atom');
			same(t.source('rss2').unreadCount, 10, 'unread articles of Mock RSS');
			check(!badge.visible, 'the count pill is still visible at 0 unread');
		});

		await step('03-03', 'Expanding a feed lists its articles', async () =>
		{
			await t.expand(rss(), 10);
			same(rows().map(t.titleOf), numbered('RSS article', 10), 'article titles');
			await away();
			await shot('group-open', 'Mock RSS expanded: ten rows RSS article 01 to 10, all bold (unread), a relative time at the right of each row.');
		});

		await step('05-01', 'Unread articles are bold', async () =>
		{
			check(rows().every(r => r.label.has_style_class_name('rss-article-unread')), 'a row of an unread article is not styled as unread');
		});

		await step('05-02', 'Relative timestamps look right (2m, 4h, 3d, 2w)', async () =>
		{
			let times = rows().map(r => r._timeLabel.text);
			check(/^\d+m$/.test(times[0]), 'time of the newest article: ' + times[0]);
			same(times.slice(1), ['1h', '4h', '11h', '1d', '3d', '6d', '2w', '4w', '10w'], 'relative times');
		});

		await step('15-01', 'Hovering an article row shows the configured hover buttons (default: Mark as read/unread and Star); they are pale until hovered or focused', async () =>
		{
			await away();
			let buttons = await t.hoverRow(rows()[1]);
			same(buttons._slots.map(s => s.id), ['read', 'star'], 'hover buttons');
			same(buttons._slots.map(s => s.button.opacity), [128, 128], 'opacity of the buttons while the pointer is on the row');
			await shot('hover-buttons', 'Second row hovered: two pale icon buttons (envelope, star) at its right end.', t.area(rows()[0], rows()[2]));

			await hover(buttons._slots[0].button);
			await waitFor('the hovered button to turn opaque', () => buttons._slots[0].button.opacity === 255);
			same(buttons._slots[1].button.opacity, 128, 'opacity of the button that is not hovered');
			await shot('hover-button-active', 'The envelope button is fully opaque under the pointer, the star is still pale.', t.area(rows()[0], rows()[2]));
		});

		await step('15-02', 'Classic: hover buttons replace the timestamp', async () =>
		{
			let row = rows()[1];
			await t.hoverRow(row);
			check(!row._timeLabel.get_parent().visible, 'the time is still visible next to the hover buttons');
			await away();
			await waitFor('the time to come back', () => row._timeLabel.get_parent().visible && !row._hoverButtons.visible);
		});

		await step('15-11', 'Row height does not jump when the hover buttons appear', async () =>
		{
			await away();
			let row = rows()[1];
			let before = [row.height, Math.round(t.bounds(rows()[2]).y)];
			await t.hoverRow(row);
			await sleep(200);
			same([row.height, Math.round(t.bounds(rows()[2]).y)], before, 'row height and position of the next row');
			return 'row height ' + before[0] + ' px';
		});

		await step('15-03', 'Mark as read / unread toggles the state, flashes "Marked as read" / "Marked as unread", popup stays open', async () =>
		{
			let row = rows()[1];
			await t.pressButton(row, 'read');
			check(row._item.read, 'the article is still unread');
			same(t.status(), 'Marked as read', 'flash message');
			check(t.ind().menu.isOpen, 'the popup closed');
			check(row.label.has_style_class_name('rss-article-read'), 'the title is still styled as unread');
			same(rss()._countBadge._label.text, '9', 'count pill of the feed');
			await shot('marked-read', 'Second row is no longer bold, status line says Marked as read, the feed pill shows 9.', t.area(t.header(), rows()[3]));

			await t.pressButton(row, 'read');
			check(!row._item.read, 'the article is still read');
			same(t.status(), 'Marked as unread', 'flash message');
		});

		await step('15-04', 'Star / unstar toggles the icon, flashes "Article starred" / "Article unstarred"', async () =>
		{
			let row = rows()[1];
			await t.pressButton(row, 'star');
			check(row._item.starred, 'the article is not starred');
			same(t.status(), 'Article starred', 'flash message');
			check(t.ind()._starredGroup.visible, 'the Starred group did not appear');
			await sleep(300);
			await shot('starred', 'A Starred group is above Mock RSS, the second article has a star before its time, status line says Article starred.', t.area(t.header(), rows()[3]));

			let buttons = await t.hoverRow(row);
			same(buttons._slots.find(s => s.id === 'star').icon, 'starred-symbolic', 'icon of the star button');
			await t.pressButton(row, 'star');
			check(!row._item.starred, 'the article is still starred');
			same(t.status(), 'Article unstarred', 'flash message');
			await waitFor('the Starred group to hide', () => !t.ind()._starredGroup.visible);
		});

		await step('15-05', 'Dismiss hides the article, flashes "Article dismissed", unread count drops', async () =>
		{
			t.setValue('hover-action-3', 'dismiss');
			let row = rows()[2];
			let target = row._item;
			let buttons = await t.hoverRow(row);
			await waitFor('three hover buttons', () => buttons._slots.length === 3);
			same(buttons._slots.map(s => s.id), ['read', 'star', 'dismiss'], 'hover buttons');
			await shot('three-buttons', 'Third row hovered with three buttons: envelope, star, close.', t.area(rows()[1], rows()[3]));

			await t.pressButton(row, 'dismiss');
			check(target.dismissed, 'the article is not dismissed');
			same(t.status(), 'Article dismissed', 'flash message');
			await waitFor('the row to go away', () => rows().length === 9);
			check(!rows().some(r => r._item === target), 'the dismissed article is still listed');
			same(t.source('rss2').unreadCount, 9, 'unread articles of the feed');
		});

		await step('15-06', 'Mark older as read marks this and every older article of the same feed as read, flashes "Older articles marked as read"', async () =>
		{
			t.setValue('hover-action-1', 'older');
			t.setValue('hover-action-2', 'copy');
			t.setValue('hover-action-3', 'open');

			let pivot = rows()[4]._item;
			await t.pressButton(rows()[4], 'older');
			same(t.status(), 'Older articles marked as read', 'flash message');

			let listed = t.source('rss2').items.filter(i => !i.dismissed);
			check(listed.filter(i => i.timestamp <= pivot.timestamp).every(i => i.read), 'an older article is still unread');
			check(listed.filter(i => i.timestamp > pivot.timestamp).every(i => !i.read), 'a newer article was marked as read too');
			await away();
			await shot('older-read', 'The first four rows are still bold, the fifth and all rows below it are not; the feed pill shows 4.');
		});

		await step('15-07', 'Copy link puts the URL on the clipboard and flashes "Link copied"', async () =>
		{
			let row = rows()[0];
			t.setClipboard('e2e');
			await t.pressButton(row, 'copy');
			same(t.status(), 'Link copied', 'flash message');
			same(await t.clipboard(), row._item.link, 'clipboard');
		});

		await step('15-08', 'Open only opens the browser without marking read, flashes "Opened in browser", popup stays open', async () =>
		{
			let row = rows()[0];
			let before = t.openedUrls().length;
			await t.pressButton(row, 'open');
			same(t.status(), 'Opened in browser', 'flash message');
			await opened(before, row._item.link);
			check(!row._item.read, 'the article was marked as read');
			check(t.ind().menu.isOpen, 'the popup closed');
		});

		await step('15-09b', 'Middle click = Open only, the popup stays open', async () =>
		{
			let row = rows()[1];
			let before = t.openedUrls().length;
			await click(row, MIDDLE, 0.35, 0.5);
			same(t.status(), 'Opened in browser', 'flash message');
			await opened(before, row._item.link);
			check(!row._item.read, 'the article was marked as read');
			check(t.ind().menu.isOpen, 'the popup closed');
		});

		await step('15-09c', 'Right click = Copy link and the popup stays open', async () =>
		{
			let row = rows()[1];
			t.setClipboard('e2e');
			await click(row, RIGHT, 0.35, 0.5);
			same(t.status(), 'Link copied', 'flash message');
			same(await t.clipboard(), row._item.link, 'clipboard');
			check(t.ind().menu.isOpen, 'the popup closed');
		});

		await step('15-09a', 'Left click = Open and mark as read (closes the popup)', async () =>
		{
			let row = rows()[0];
			let target = row._item;
			let before = t.openedUrls().length;
			await click(row, LEFT, 0.35, 0.5);
			await waitFor('the popup to close', () => !t.ind().menu.isOpen);
			check(target.read, 'the article is still unread');
			await opened(before, target.link);
		});

		await step('15-12', 'Keyboard: arrows reach the hover buttons, Enter activates them, focus is not lost after an action', async () =>
		{
			t.setValue('hover-action-1', 'read');
			t.setValue('hover-action-2', 'star');
			t.setValue('hover-action-3', 'none');
			await away();
			await t.openPopup();
			await t.expand(rss(), 9);

			let row = rows()[1];
			let was = row._item.read;
			row.grab_key_focus();
			await sleep(200);
			await key(Clutter.KEY_Right);
			check(row._hoverButtons._slots.length > 0 && row._hoverButtons._slots[0].button.has_key_focus(), 'Right did not move the focus to the first hover button');
			await shot('keyboard-focus', 'Second row focused from the keyboard: its hover buttons are visible and the first one has the focus ring.', t.area(rows()[0], rows()[2]));

			await key(Clutter.KEY_Return);
			same(row._item.read, !was, 'read state after Enter');
			let focus = global.stage.get_key_focus();
			check(focus && row.contains(focus), 'the focus left the row after the action');

			await key(Clutter.KEY_Left);
			check(row.has_key_focus(), 'Left did not bring the focus back to the row');
			await t.closePopup();
		});
	};

	t.scenarios.minimal = async () =>
	{
		if (!await step('04-00', 'setup: two feeds in the Minimal layout, every article unread', () => t.setup(['rss2', 'atom'], { 'layout-mode': 'minimal' }), 45000))
			return;

		const MIXED = [
			'RSS article 01', 'RSS article 02', 'Atom entry 01', 'RSS article 03', 'Atom entry 02',
			'RSS article 04', 'RSS article 05', 'Atom entry 03', 'RSS article 06', 'Atom entry 04',
			'RSS article 07', 'RSS article 08', 'Atom entry 05', 'RSS article 09', 'RSS article 10',
		];

		const state = () => t.ind()._minimal._state;
		const unread = () => t.minimalRows().filter(r => state().unread.rows.get(r._item) === r);
		const headers = () => t.ind()._minimal.section.box.get_children().filter(c => c.constructor.name === 'MinimalSectionHeader').map(c => c._label.text);

		await step('04-02', 'Single chronological list mixes all sources correctly', async () =>
		{
			await t.openPopup();
			await waitFor('fifteen rows', () => t.minimalRows().length === 15, 8000).catch(() => {});
			same(t.minimalRows().map(t.titleOf), MIXED, 'article order');
			check(t.ind()._minimal.section.actor.visible && !t.ind()._feedsSection.actor.visible, 'the Classic list is visible in the Minimal layout');
			await away();
			await shot('list', 'Minimal layout: header UNREAD with count 15, then the articles of both feeds mixed by date, each with a source tag and a time under its title.');
		});

		await step('04-03', 'Source tag/label shown per article', async () =>
		{
			same(t.minimalRows().slice(0, 3).map(r => r._sourceTag.text), ['Mock RSS', 'Mock RSS', 'Mock Atom'], 'source tags of the first three rows');
		});

		await step('04-05', 'Sections UNREAD, READ and STARRED each have a header; section counts are correct (READ shows no count)', async () =>
		{
			same(headers(), ['UNREAD'], 'section headers with every article unread');
			same(state().unread.header._count.text, '15', 'UNREAD count');

			let rss = t.source('rss2');
			t.store().markRead(rss, rss.items[9]);
			t.store().toggleStar(rss, rss.items[8]);
			await waitFor('the READ and STARRED sections', () => state().read.header && state().starred.header, 5000).catch(() => {});

			same(headers(), ['STARRED', 'UNREAD', 'READ'], 'section headers');
			same(state().starred.header._count.text, '1', 'STARRED count');
			same(state().unread.header._count.text, '13', 'UNREAD count');
			check(!state().read.header._count.visible, 'READ shows a count');
			await sleep(300);
			await shot('sections', 'Three sections in the order STARRED (1), UNREAD (13), READ (no count), each header with a line and an arrow.');
		});

		await step('15-02m', 'Minimal: the timestamp stays and the buttons are at the end of the meta row', async () =>
		{
			await away();
			let row = unread()[1];
			let height = row.height;
			let buttons = await t.hoverRow(row);
			same(buttons._slots.map(s => s.id), ['read', 'star'], 'hover buttons');
			check(row._timeLabel.visible, 'the time is hidden while the row is hovered');
			check(t.bounds(buttons).x > t.bounds(row._timeLabel).x, 'the buttons are not after the time');
			same(row.height, height, 'row height with the hover buttons');
			await shot('hover-buttons', 'Second UNREAD row hovered: source tag and time stay under the title, two pale buttons at the right end of that line.', t.area(unread()[0], unread()[2]));
		});

		await step('15-03m', 'Minimal: Mark as read moves the article to READ, flashes "Marked as read", popup stays open', async () =>
		{
			let row = unread()[1];
			let target = row._item;
			await t.pressButton(row, 'read');
			check(target.read, 'the article is still unread');
			same(t.status(), 'Marked as read', 'flash message');
			await waitFor('the article to move to READ', () => state().read.rows.has(target) && !state().unread.rows.has(target), 4000);
			same(state().unread.header._count.text, '12', 'UNREAD count');
			check(t.ind().menu.isOpen, 'the popup closed');
		});

		await step('15-04m', 'Minimal: Star moves the article to STARRED and flashes "Article starred"', async () =>
		{
			let row = unread()[0];
			let target = row._item;
			await t.pressButton(row, 'star');
			check(target.starred, 'the article is not starred');
			same(t.status(), 'Article starred', 'flash message');
			await waitFor('the article to move to STARRED', () => state().starred.rows.has(target) && !state().unread.rows.has(target), 4000);
			same(state().starred.header._count.text, '2', 'STARRED count');
			await away();
			await shot('starred', 'STARRED now lists two articles, UNREAD count is 11, the status line says Article starred.');
		});

		await step('15-10', 'Clicking hover buttons quickly in Minimal does not log "object has been already disposed"', async () =>
		{
			let disposed = t.logCount('already disposed');
			let before = state().unread.total;
			let buttons = await t.hoverRow(unread()[0]);
			let spot = t.bounds(buttons._slots[0].button);

			for (let i = 0; i < 5; i++)
				await clickAt(spot.x + spot.w / 2, spot.y + spot.h / 2);

			await sleep(1000);
			same(t.logCount('already disposed') - disposed, 0, 'new "already disposed" lines in the Shell log');
			check(state().unread.total < before, 'none of the five clicks marked an article as read');
			return (before - state().unread.total) + ' of 5 clicks on the same spot marked an article as read';
		});

		await step('04-04', 'The section header collapses and expands its section', async () =>
		{
			await away();
			let count = unread().length;
			await click(state().unread.header, LEFT, 0.3, 0.5);
			await waitFor('the UNREAD rows to hide', () => unread().length === 0);
			await shot('collapsed', 'UNREAD is collapsed: only its header with a sideways arrow, READ follows right after it.');
			await click(state().unread.header, LEFT, 0.3, 0.5);
			await waitFor('the UNREAD rows to come back', () => unread().length === count);
		});

		await step('04-06', '"Show more" works; its expansion resets when the menu is closed and reopened', async () =>
		{
			try
			{
				t.setValue('items-visible', 3);
				await waitFor('three UNREAD rows and a Show more row', () => unread().length === 3 && state().unread.showMore, 5000);
				let total = state().unread.total;
				same(state().unread.showMore._label.text, 'Show more (3 of ' + total + ')', 'Show more label');
				await shot('show-more', 'Each section shows at most three rows and ends with a Show more row.');

				await click(state().unread.showMore, LEFT, 0.3, 0.5);
				await waitFor('more UNREAD rows', () => unread().length === Math.min(6, total), 5000);

				await t.closePopup();
				await t.openPopup();
				await waitFor('three UNREAD rows after reopening', () => unread().length === 3, 5000);
			}
			finally
			{
				t.setValue('items-visible', 100);
			}
		});

		await step('15-09m', 'Minimal: left click opens the article, marks it as read and closes the popup', async () =>
		{
			await t.openPopup();
			await waitFor('the UNREAD rows', () => unread().length > 0, 5000);
			let target = unread()[0]._item;
			let before = t.openedUrls().length;
			await click(unread()[0], LEFT, 0.35, 0.3);
			await waitFor('the popup to close', () => !t.ind().menu.isOpen);
			check(target.read, 'the article is still unread');
			await opened(before, target.link);
		});

		await step('04-08', 'Switching back to Classic live-updates correctly', async () =>
		{
			await t.openPopup();
			t.setValue('layout-mode', 'classic');
			await waitFor('the Classic list', () => t.ind()._feedsSection.actor.visible && !t.ind()._minimal.section.actor.visible);
			await sleep(300);
			await shot('back-to-classic', 'Classic layout again: a Starred group, then Mock RSS and Mock Atom with their count pills.');
			await t.closePopup();
		});
	};

	t.scenarios.feeds = async () =>
	{
		const FEEDS = ['rss2', 'atom', 'rdf', 'feedburner', 'latin2', 'entities', 'notitle', 'longtitles', 'long', '404', 'garbage'];

		if (!await step('07-00', 'setup: eleven feeds of different formats, two of them broken', () => t.setup(FEEDS, { 'items-visible': 60 }), 60000))
			return;

		let disposed = { mouse: -1, keyboard: -1 };

		const parsed = (name, title, count, first) => async () =>
		{
			let feed = t.source(name);
			check(!feed.lastError, 'feed error: ' + feed.lastError);
			same(feed.title, title, 'feed title');
			same(feed.items.length, count, 'articles');
			same(feed.items[0].title, first, 'newest article');
		};

		await step('07-03', 'RSS 2.0 feed parses correctly', parsed('rss2', 'Mock RSS', 10, 'RSS article 01'));
		await step('07-04', 'Atom feed parses correctly', parsed('atom', 'Mock Atom', 5, 'Atom entry 01'));
		await step('07-05', 'RDF / RSS 1.0 feed parses correctly', parsed('rdf', 'Mock RDF', 5, 'RDF item 01'));
		await step('07-06', 'FeedBurner feed parses correctly', parsed('feedburner', 'Mock FeedBurner', 5, 'FeedBurner item 01'));

		await step('07-07', 'Non-UTF-8 feed (declared charset) renders without mojibake', async () =>
		{
			await parsed('latin2', 'Mock Latin2', 3, 'Žluťoučký kůň 01')();
			await t.openPopup();
			await t.expand(t.group('latin2'), 3);
			await away();
			await shot('latin2', 'Eleven feed groups, Mock Latin2 expanded: three rows titled Žluťoučký kůň 01 to 03 with correct accents.');
		});

		await step('07-08', 'HTML entities / special characters in titles render correctly', async () =>
		{
			same(t.source('entities').items[0].title, 'Entities <b> article 01 & more', 'article title');
			same(t.group('entities').label.text, 'Mock Entities & Co', 'feed title in the menu');
			await t.openPopup();
			await t.expand(t.group('entities'), 3);
			await away();
			await shot('entities', 'Feed title Mock Entities & Co; its rows read Entities <b> article 01 & more, with a literal <b> and &.');
		});

		await step('05-06', 'Article links containing XML entities (&amp; in the URL) open the correct URL', async () =>
		{
			let row = t.classicRows(t.group('entities'))[0];
			let link = row._item.link;
			check(link.endsWith('?a=1&b=2'), 'stored link: ' + link);
			let before = t.openedUrls().length;
			await click(row, MIDDLE, 0.35, 0.5);
			await opened(before, link);
		});

		await step('05-05', 'Articles without a title show the start of the description instead', async () =>
		{
			same(t.source('notitle').items[0].title, 'Untitled note 01: the title is taken from the start of this description.', 'article title');
			await t.openPopup();
			await t.expand(t.group('notitle'), 3);
			await away();
			await shot('notitle', 'Mock No Title expanded: rows start with Untitled note 01: the title is taken from the start of this description.');
		});

		await step('07-09', 'A feed returning 404 / garbage does not break the others', async () =>
		{
			check(String(t.source('404').lastError).startsWith('404'), 'error of the 404 feed: ' + t.source('404').lastError);
			same(t.source('garbage').lastError, 'Not a feed', 'error of the garbage feed');
			same(t.store().failedCount, 2, 'failed feeds');
			same(t.store().getSources().filter(s => !s.lastError).length, 9, 'working feeds');
			same(t.header()._failedPill.child.text, '2 failed', 'failed pill');
		});

		await step('13-03', 'Very long titles / descriptions truncate or wrap cleanly', async () =>
		{
			await t.openPopup();
			await t.expand(t.group('longtitles'), 3);
			let row = t.classicRows(t.group('longtitles'))[0];
			let text = row.label.text;
			check(text.length === 103 && text.endsWith('...'), 'title in the row has ' + text.length + ' characters');
			same(t.ind().menu.actor.width, 400, 'popup width');

			let r = t.bounds(row);
			let m = t.bounds(t.ind().menu.actor);
			check(r.x >= m.x && r.x + r.w <= m.x + m.w, 'the row is wider than the popup');
			await away();
			await shot('long-titles', 'Mock Long Titles expanded: three long headlines that stay inside the popup (wrapped or cut), the time stays at the right edge.');
		});

		await step('13-02', 'Feed with hundreds of items: no UI freeze on build (chunked)', async () =>
		{
			await t.openPopup();
			let started = Date.now();
			await t.expand(t.group('long'), 60);
			let elapsed = Date.now() - started;
			same(t.classicRows(t.group('long')).length, 60, 'rows built');
			same(t.source('long').items.length, 200, 'articles kept of the 300 in the feed (Articles kept per feed is 200)');
			check(elapsed < 6000, 'building 60 rows took ' + elapsed + ' ms');
			return '60 rows in ' + elapsed + ' ms';
		});

		await step('03-04', 'Long feeds show a "Show more" row; clicking it reveals more (no freeze)', async () =>
		{
			let feed = t.group('long');
			check(feed._showMoreRow, 'there is no Show more row');
			same(feed._showMoreRow._label.text, 'Show more (60 of 200)', 'Show more label');

			await away();
			let view = t.ind()._feedsSection.actor;
			view.vadjustment.value = view.vadjustment.upper - view.vadjustment.page_size;
			await sleep(400);
			await shot('show-more', 'End of the Mock Long list scrolled into view: the last rows and the row Show more (60 of 200).');

			let before = t.logCount('already disposed');
			let started = Date.now();
			await click(feed._showMoreRow, LEFT, 0.3, 0.5);
			await waitFor('120 rows', () => t.classicRows(feed).length === 120 && feed._showMoreRow, 12000);
			same(feed._showMoreRow._label.text, 'Show more (120 of 200)', 'Show more label');
			let elapsed = Date.now() - started;
			await sleep(500);
			disposed.mouse = t.logCount('already disposed') - before;
			return '60 more rows in ' + elapsed + ' ms';
		});

		await step('15-13', '"Show more" keeps focus after click', async () =>
		{
			let feed = t.group('long');

			// the list scrolls under the pointer, a row that lands there would take the key focus
			await away();
			feed._showMoreRow.grab_key_focus();
			await sleep(400);

			let before = t.logCount('already disposed');
			await key(Clutter.KEY_Return);
			await waitFor('180 rows', () => t.classicRows(feed).length === 180, 12000);
			let focus = global.stage.get_key_focus();
			let first = t.classicRows(feed)[120];
			check(focus && first.contains(focus), 'the focus is not on the first of the new rows');
			await sleep(500);
			disposed.keyboard = t.logCount('already disposed') - before;
		});

		await step('21-01', 'Activating "Show more" in the Classic layout logs no "already disposed" warning', async () =>
		{
			check(disposed.mouse >= 0 && disposed.keyboard >= 0, 'the Show more steps before this one did not get as far as the log check');
			same(disposed, { mouse: 0, keyboard: 0 }, 'new "already disposed" lines in the Shell log, by the way Show more was activated');
		});

		await step('03-08', 'Menu scrolls when taller than the max height', async () =>
		{
			try
			{
				t.setValue('max-height', 300);
				await sleep(500);
				let view = t.ind()._feedsSection.actor;
				check(view.height <= 300, 'the list is ' + view.height + ' px high');
				check(view.vadjustment.upper > view.vadjustment.page_size, 'the list does not scroll');
				await shot('max-height', 'The feed list is limited to 300 px and has a scrollbar.');
			}
			finally
			{
				t.setValue('max-height', 8192);
			}
		});

		await step('07-01r', 'A new article in a feed shows up as unread after a manual refresh', async () =>
		{
			let feed = t.source('rss2');
			let before = feed.unreadCount;
			t.setFeedState({ extra: { rss2: 1 } });
			await t.refresh();
			same(feed.items.length, 11, 'articles of the feed');
			same(feed.items[0].title, 'RSS article new 1', 'newest article');
			same(feed.unreadCount, before + 1, 'unread articles of the feed');
		}, 45000);

		await step('04-07', 'Minimal layout with a large list: "Show more" works, no freeze on large lists', async () =>
		{
			try
			{
				await t.openPopup();
				let started = Date.now();
				t.setValue('layout-mode', 'minimal');
				let state = t.ind()._minimal._state;
				await waitFor('60 UNREAD rows and a Show more row', () => state.unread.rows.size === 60 && state.unread.showMore, 12000);
				same(state.unread.showMore._label.text, 'Show more (60 of ' + state.unread.total + ')', 'Show more label');
				let elapsed = Date.now() - started;
				await away();
				await shot('minimal-large', 'Minimal layout with several hundred unread articles: header UNREAD with its count, rows of several feeds mixed by date.');
				return '60 rows of ' + state.unread.total + ' in ' + elapsed + ' ms';
			}
			finally
			{
				t.setValue('layout-mode', 'classic');
			}
		});

		await step('13-01', 'Empty feed list (no sources): menu and panel behave sanely, no errors', async () =>
		{
			await t.setFeeds([]);
			await waitFor('all feed groups to go away', () => t.ind()._groups.size === 0);
			same(t.store().totalUnread, 0, 'unread articles');
			check(!t.ind()._iconLabel.visible, 'the unread dot is still visible');
			check(!t.header()._failedPill.visible, 'the failed pill is still visible');
			await t.openPopup();
			await sleep(300);
			await shot('empty', 'Popup with no feeds: only the header, no badge, no failed pill, no groups.');
			await t.closePopup();
		});
	};

	t.scenarios.starred = async () =>
	{
		const rss = () => t.source('rss2');
		const atom = () => t.source('atom');
		const group = () => t.ind()._starredGroup;
		const rows = () => t.classicRows(group());
		const star = (source, index) => t.store().toggleStar(source, source.items[index]);
		const count = badge => badge.visible ? badge._label.text : '';
		const described = () => rows().map(row => t.titleOf(row) + ' / ' + row._sourceTag.text);
		const archived = () => t.store().getArchived().map(source => source.url.replace(t.config().base + '/', ''));

		if (!await step('16-00', 'setup: two feeds in the Classic layout, nothing starred', async () =>
		{
			await t.setup(['rss2', 'atom']);
			same(t.store().starredCount(), 0, 'starred articles');
		}, 45000))
			return;

		await step('16-01', 'Classic: a Starred group appears (hidden when nothing is starred) with a correct unread count', async () =>
		{
			await t.openPopup();
			check(!group().visible, 'the Starred group is visible with nothing starred');

			t.store().markRead(rss(), rss().items[1]);
			star(rss(), 0);
			star(rss(), 1);
			star(atom(), 0);
			await waitFor('the Starred group to appear', () => group().visible);
			same(group().label.text, 'Starred', 'title of the group');
			same(count(group()._countBadge), '2', 'unread count of the Starred group (two of the three starred articles are unread)');
			await away();
			await shot('group', 'Classic layout: a group Starred with a star icon and the count 2, together with the groups Mock RSS and Mock Atom.');
		});

		await step('16-02', 'Classic: starred rows show the feed name and look like the Minimal rows', async () =>
		{
			await t.expand(group(), 3);
			same(rows().map(row => row.constructor.name), ['TaggedArticleRow', 'TaggedArticleRow', 'TaggedArticleRow'], 'kind of the starred rows');
			same(described(), ['RSS article 01 / Mock RSS', 'RSS article 02 / Mock RSS', 'Atom entry 01 / Mock Atom'], 'titles and feed names of the starred rows');
			await away();
			await shot('rows', 'Starred group expanded: three rows, each with the article title and under it a tag with the feed name and the time; RSS article 02 is read (no dot).');
		});

		await step('16-04', 'Unstarring removes the article from the Starred view', async () =>
		{
			let row = rows()[0];
			let target = row._item;
			await t.pressButton(row, 'star');
			check(!target.starred, 'the article is still starred');
			same(t.status(), 'Article unstarred', 'flash message');
			await waitFor('the row to leave the Starred group', () => rows().length === 2 && !rows().some(r => r._item === target), 4000);
			same(count(group()._countBadge), '1', 'unread count of the Starred group');
			check(t.ind().menu.isOpen, 'the popup closed');
		});

		await step('16-11', 'Expanding / collapsing the Classic Starred group works, also after closing and reopening the menu', async () =>
		{
			await away();
			await click(group(), LEFT, 0.4, 0.5);
			await waitFor('the Starred group to collapse', () => !group().menu.isOpen);
			await click(group(), LEFT, 0.4, 0.5);
			await waitFor('the Starred group to expand again', () => group().menu.isOpen && rows().length === 2);

			await t.closePopup();
			await t.openPopup();
			let reopened = group().menu.isOpen ? 'expanded' : 'collapsed';
			await t.expand(group(), 2);
			same(rows().length, 2, 'starred rows after the menu was reopened');
			await away();
			await click(group(), LEFT, 0.4, 0.5);
			await waitFor('the Starred group to collapse after the menu was reopened', () => !group().menu.isOpen);
			return 'after reopening the menu the group was ' + reopened;
		});

		await step('16-10', 'Mark all as read / mark older as read include starred articles', async () =>
		{
			star(rss(), 5);
			let older = rss().items[5];
			check(!older.read, 'RSS article 06 is read before the test');

			t.store().markOlderRead(rss(), rss().items[3]);
			check(older.read, 'mark older as read skipped the starred RSS article 06');

			let unreadStarred = atom().items[0];
			check(unreadStarred.starred && !unreadStarred.read, 'Atom entry 01 is not an unread starred article before the test');
			t.store().markAllSeen();
			check(unreadStarred.read, 'mark all as read skipped the starred Atom entry 01');
			same(count(group()._countBadge), '', 'unread count of the Starred group');
			same(t.store().starredCount(), 3, 'starred articles');
		});

		await step('16-05', 'Unstar all (N) in the ⋮ menu unstars everything', async () =>
		{
			await openOverflow();
			check(overflowLabels().includes('Unstar all (3)'), 'the ⋮ menu has no Unstar all (3): ' + overflowLabels().join(', '));
			await click(overflowItem('Unstar all'));
			same(t.store().starredCount(), 0, 'starred articles');
			same(t.status(), '3 articles unstarred', 'flash message');
			await waitFor('the Starred group to hide', () => !group().visible);
		});

		await step('16-03', 'Minimal: STARRED section appears; unread starred articles are listed only in STARRED (intended)', async () =>
		{
			const state = () => t.ind()._minimal._state;
			let first = rss().items[2];
			let second = rss().items[3];

			try
			{
				t.setValue('layout-mode', 'minimal');
				await t.openPopup();
				t.store().markUnread(rss(), first);
				t.store().markUnread(rss(), second);
				t.store().toggleStar(rss(), first);
				await waitFor('the article in the STARRED section', () => state().starred.header && state().starred.rows.has(first), 5000);

				check(!state().unread.rows.has(first), 'the unread starred article is listed in UNREAD as well');
				check(state().unread.rows.has(second), 'the other unread article is missing in UNREAD');
				same([state().starred.header._count.text, state().unread.header._count.text], ['1', '1'], 'counts of STARRED and UNREAD');
				await away();
				await shot('minimal', 'Minimal layout: STARRED (1) with RSS article 03, UNREAD (1) with RSS article 04 only, then READ.');
			}
			finally
			{
				t.setValue('layout-mode', 'classic');
			}
		});

		await step('16-07', 'Starred articles survive a disable and enable of the extension (stands in for a Shell restart)', async () =>
		{
			await t.closePopup();
			same(t.store().starredEntries().map(entry => entry.item.title), ['RSS article 03'], 'starred articles before the disable');

			Main.extensionManager.disableExtension(uuid());
			await waitFor('the extension to be disabled', () => t.ext().state !== 1, 10000);
			Main.extensionManager.enableExtension(uuid());
			await waitFor('the extension to be enabled', () => t.ext().state === 1 && t.ind() && t.store(), 15000);
			await waitFor('both feeds to be back', () => t.store().getSources().length === 2 && t.store().getSources().every(s => s.items.length > 0), 15000);

			same(t.store().starredEntries().map(entry => entry.item.title), ['RSS article 03'], 'starred articles after the enable');
			check(group().visible, 'the Starred group is hidden after the enable');
		}, 60000);

		await step('16-08', 'Remove a feed that has starred articles: the starred articles stay (shown with the stored feed title)', async () =>
		{
			await t.setFeeds(['atom']);
			await waitFor('Mock RSS to leave the list', () => !t.source('rss2'));
			same(t.store().starredEntries().map(entry => entry.item.title), ['RSS article 03'], 'starred articles after the feed was removed');
			same(archived(), ['rss2.xml'], 'removed feeds that are kept for their starred articles');

			await t.openPopup();
			check(!t.group('rss2'), 'the menu still has a group for the removed feed');
			await t.expand(group(), 1);
			same(described(), ['RSS article 03 / Mock RSS'], 'title and feed name of the starred row');
			await away();
			await shot('removed-feed', 'Only Mock Atom is left as a feed; the Starred group still shows RSS article 03 with the tag Mock RSS.');
		}, 45000);

		await step('16-09', 'Add the same URL again: the starred articles return to the feed; unstarring the last starred article of a removed feed makes it disappear', async () =>
		{
			await t.setFeeds(['atom', 'rss2']);
			await waitFor('Mock RSS to be loaded again', () => rss() && rss().items.length === 10, 15000);
			same(archived(), [], 'removed feeds that are kept after the feed was added again');
			same(rss().items.filter(item => item.starred).map(item => item.title), ['RSS article 03'], 'starred articles of Mock RSS');
			same(t.store().starredCount(), 1, 'starred articles');

			await t.setFeeds(['atom']);
			await waitFor('Mock RSS to leave the list', () => !t.source('rss2'));
			same(archived(), ['rss2.xml'], 'removed feeds that are kept for their starred articles');

			let entry = t.store().starredEntries()[0];
			t.store().toggleStar(entry.source, entry.item);
			same(t.store().starredCount(), 0, 'starred articles');
			same(archived(), [], 'removed feeds that are kept after their last starred article was unstarred');
			await waitFor('the Starred group to hide', () => !group().visible);
		}, 60000);
	};

	t.scenarios.dismiss = async () =>
	{
		const rss = () => t.source('rss2');
		const titles = () => rss().items.filter(item => item.dismissed).map(item => item.title);
		const shown = () => t.classicRows(t.group('rss2')).map(t.titleOf);

		if (!await step('17-00', 'setup: one feed with ten unread articles', async () =>
		{
			await t.setup(['rss2']);
			same(t.store().totalUnread, 10, 'unread articles');
		}, 45000))
			return;

		await step('17-01', 'A dismissed article stays hidden after refresh and after a disable and enable (a feed that still publishes it does not bring it back)', async () =>
		{
			t.store().dismiss(rss(), rss().items[0]);
			same(titles(), ['RSS article 01'], 'dismissed articles');
			same(t.store().totalUnread, 9, 'unread articles');

			await t.openPopup();
			await t.expand(t.group('rss2'), 9);
			same(shown(), numbered('RSS article', 10).slice(1), 'rows of the feed group');
			await t.closePopup();

			await t.refresh();
			same(titles(), ['RSS article 01'], 'dismissed articles after a refresh');
			same(rss().items.length, 10, 'articles of the feed after a refresh');

			Main.extensionManager.disableExtension(uuid());
			await waitFor('the extension to be disabled', () => t.ext().state !== 1, 10000);
			Main.extensionManager.enableExtension(uuid());
			await waitFor('the extension to be enabled', () => t.ext().state === 1 && t.ind() && t.store(), 15000);
			await waitFor('the feed to be back', () => rss() && rss().items.length === 10, 15000);

			same(titles(), ['RSS article 01'], 'dismissed articles after the enable');
			same(t.store().totalUnread, 9, 'unread articles after the enable');
			await t.openPopup();
			await t.expand(t.group('rss2'), 9);
			same(shown(), numbered('RSS article', 10).slice(1), 'rows of the feed group after the enable');
		}, 90000);

		await step('17-02', 'Dismissing a starred article unstars it first', async () =>
		{
			let item = rss().items[1];
			t.store().toggleStar(rss(), item);
			same(t.store().starredCount(), 1, 'starred articles before the dismiss');

			t.store().dismiss(rss(), item);
			check(item.dismissed, 'the article is not dismissed');
			check(!item.starred, 'the dismissed article is still starred');
			same(t.store().starredCount(), 0, 'starred articles after the dismiss');
			check(!t.ind()._starredGroup.visible, 'the Starred group is still visible');
		});

		await step('17-04', 'Mark all as read / mark older as read skip dismissed articles', async () =>
		{
			let first = rss().items[0];
			let second = rss().items[1];
			check(!first.read && !second.read, 'the two dismissed articles are read before the test');

			t.store().markOlderRead(rss(), rss().items[0]);
			same([first.read, second.read], [false, false], 'read state of the dismissed articles after mark older as read');
			same(t.store().totalUnread, 0, 'unread articles after mark older as read');

			t.store().markUnread(rss(), rss().items[2]);
			t.store().markAllSeen();
			same([first.read, second.read], [false, false], 'read state of the dismissed articles after mark all as read');
			same(t.store().totalUnread, 0, 'unread articles after mark all as read');
		});

		await step('17-03', 'Restore dismissed (N) brings all dismissed articles back in their previous read state (unread stays unread)', async () =>
		{
			t.store().dismiss(rss(), rss().items[2]);
			same(titles(), ['RSS article 01', 'RSS article 02', 'RSS article 03'], 'dismissed articles');

			await openOverflow();
			check(overflowLabels().includes('Restore dismissed (3)'), 'the ⋮ menu has no Restore dismissed (3): ' + overflowLabels().join(', '));
			await click(overflowItem('Restore dismissed'));
			same(t.status(), '3 articles restored', 'flash message');
			same(titles(), [], 'dismissed articles after the restore');
			same(rss().items.slice(0, 3).map(item => item.read), [false, false, true], 'read state of the restored articles');
			same(t.store().totalUnread, 2, 'unread articles after the restore');
		});

		await step('17-03a', 'The restored articles are back in the open feed group, without a Show more row for ten articles', async () =>
		{
			await t.openPopup();
			await t.expand(t.group('rss2'), 7);
			await away();
			await shot('restored', 'Mock RSS expanded with all ten articles again; the first two are unread, the third is read. No Show more row.');
			same(shown(), numbered('RSS article', 10), 'rows of the feed group after the restore (Visible articles is ' + t.obj()._settings.get_int('items-visible') + ')');
		});
	};
})();
