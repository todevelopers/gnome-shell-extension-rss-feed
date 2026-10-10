# End-to-end tests

`scripts/run-tests.sh` runs the installed extension in a second, headless GNOME Shell and clicks through parts of the pre-release checklist, the popup in the panel as well as the preferences window. Nothing of the desktop session is touched: every scenario gets a fresh temporary HOME, its own session bus and an empty system bus, and everything is removed afterwards.

## Requirements

A machine with GNOME Shell 46 or newer and the extension installed (`scripts/clone.sh` or `scripts/install.sh`). The script needs `gnome-shell`, `gjs`, `gdbus`, `gsettings`, `dbus-run-session`, `dbus-daemon`, `glib-compile-schemas`, `python3`, `curl`, `setsid`, `timeout` and `tar`; a stock Ubuntu or Fedora desktop has all of them. It stops with the name of the missing command otherwise.

## Usage

```bash
curl -fsSL https://raw.githubusercontent.com/todevelopers/gnome-shell-extension-rss-feed/master/scripts/run-tests.sh | bash
```

From a checkout the same script uses the files next to it instead of downloading them:

```bash
bash scripts/run-tests.sh --only header,classic --theme dark
```

`--only` takes scenario names separated by commas, `--theme` takes `dark`, `light` or `both`. A full run of both themes takes about a quarter of an hour.

| Scenario | What it covers |
| --- | --- |
| `smoke` | the harness itself: screenshot, click on the panel icon, Escape |
| `lifecycle` | enable, disable, quick toggling, unread state kept |
| `panel` | panel icon, unread dot, two-step unread badge |
| `header` | popup header, status line, failed pill, overflow menu |
| `classic` | Classic layout, hover buttons, mouse buttons, keyboard |
| `minimal` | Minimal layout, sections, Show more |
| `feeds` | feed formats, broken feeds, long feeds, titles |
| `starred` | Starred group and section, unstar, feeds removed and added again with starred articles |
| `dismiss` | dismissed articles stay hidden, restore, mark as read skips them |
| `prefs` | preferences: General and Notifications pages, About dialog, how the window is opened |
| `sources` | preferences: Sources page (add, remove, edit, mute, reorder, check all, remove all) |
| `actions` | preferences: Actions page and what its choices do in the popup |
| `opml` | preferences: OPML import and export through the file chooser |

## Output

The run writes `~/rss-feed-e2e/<date-time>/` and the same folder as `.tar.gz`; the path of the archive is the last line printed. The exit code is 1 when a step failed.

- `report.md`: environment, failed steps, all steps, filtered Shell log
- `results.tsv`: one line per step (theme, scenario, step, result, check, message)
- `manifest.json`: one entry per screenshot with the checklist item it belongs to and what to look for
- `g<shell>_<theme>_<step>_<name>.png`: screenshots, cropped to the popup or the preferences window where possible; `_FAILED` is the whole screen at the moment a step failed
- `a11y_g<shell>_<theme>_<step>.txt`: the widget tree of the preferences window at the moment a step failed, with the roles, names and positions that this GTK version reports
- `full.log`: output of the Shell, the buses and the mock feed server, with the steps in between

## How it works

- `feeds.py` is a small HTTP server on localhost that serves the test feeds. Article dates are computed from the current time, so the relative times in the screenshots stay the same. `garbage.xml` and any unknown name are the two broken feeds.
- `driver.js` is read and evaluated inside the test Shell through `org.gnome.Shell.Eval` (the Shell runs with `--unsafe-mode`). It creates a virtual pointer and keyboard, so clicks and keys are real input events, and takes screenshots through the Shell's own screenshot service.
- `scenarios.js` holds the tests of the popup, `scenarios-prefs.js` those of the preferences window. A step id starts with the section of the checklist it covers, `00` is the harness itself.
- `prefs.js` reaches the preferences window, which is a separate GTK process. Its widgets are found by role and name in the accessibility tree (AT-SPI), read from inside the test Shell. Buttons, switches and tabs are pressed through their accessible action; rows, text entries and the drag handle get real pointer and key events; a choice in a combo row is made with the arrow keys.
- Opening an article or a link of the About dialog does not start a browser: the test profile registers a handler that only writes the URL to a file.
- The test profile masks the desktop portal, so the file chooser is always the one built into GTK and it opens in the temporary HOME. The preferences window takes its colour scheme straight from GSettings (`ADW_DISABLE_PORTAL`).

## Adding a scenario

Add `t.scenarios.<name>` to `scenarios.js` and the name to `SCENARIOS` in `scripts/run-tests.sh`. Each scenario runs in its own Shell with a fresh profile and should start with `t.setup([...feed names])`. Inside, every check is a step:

```js
await step('14-07', 'text of the checklist item', async () =>
{
	await t.openPopup();
	await click(t.header()._navButtons[2]);
	check(t.header()._menu.isOpen, 'the menu did not open');
	await shot('menu-open', 'What the reviewer should see in this screenshot.');
});
```

A step that throws is recorded as failed with a screenshot and the scenario goes on. Use `waitFor` or `eventually` instead of fixed sleeps, and move the pointer away (`moveTo`) before using the keyboard: a row under the pointer takes the key focus.

A step in the preferences window looks the same, with the helpers of `t.prefs`:

```js
await step('06-15', 'Initial unread can be switched off', async () =>
{
	await p.open();
	let page = await p.page('Sources');
	await p.toggle('Initial unread', page);
	await eventually(() => t.obj()._settings.get_boolean('mark-initial-as-new'), false, 'mark-initial-as-new in the settings');
	await p.shot('initial-unread-off', 'What the reviewer should see in this screenshot.');
});
```

GTK 4.14 (GNOME 46) reports wrong positions for widgets in the header bar and inside popovers, so only click what lies in the page itself (`p.clickOn`) and leave the rest to `p.press` and `p.choose`.
