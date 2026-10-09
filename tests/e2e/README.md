# End-to-end tests

`scripts/run-tests.sh` runs the installed extension in a second, headless GNOME Shell and clicks through parts of the pre-release checklist. Nothing of the desktop session is touched: every scenario gets a fresh temporary HOME, its own session bus and an empty system bus, and everything is removed afterwards.

## Requirements

A machine with GNOME Shell 46 or newer and the extension installed (`scripts/clone.sh` or `scripts/install.sh`). The script needs `gnome-shell`, `gdbus`, `gsettings`, `dbus-run-session`, `dbus-daemon`, `glib-compile-schemas`, `python3`, `curl`, `setsid`, `timeout` and `tar`; a stock Ubuntu or Fedora desktop has all of them. It stops with the name of the missing command otherwise.

## Usage

```bash
curl -fsSL https://raw.githubusercontent.com/todevelopers/gnome-shell-extension-rss-feed/master/scripts/run-tests.sh | bash
```

From a checkout the same script uses the files next to it instead of downloading them:

```bash
bash scripts/run-tests.sh --only header,classic --theme dark
```

`--only` takes scenario names separated by commas (`smoke`, `lifecycle`, `panel`, `header`, `classic`, `minimal`, `feeds`), `--theme` takes `dark`, `light` or `both`. A full run of both themes takes about five minutes.

## Output

The run writes `~/rss-feed-e2e/<date-time>/` and the same folder as `.tar.gz`; the path of the archive is the last line printed. The exit code is 1 when a step failed.

- `report.md`: environment, failed steps, all steps, filtered Shell log
- `results.tsv`: one line per step (theme, scenario, step, result, check, message)
- `manifest.json`: one entry per screenshot with the checklist item it belongs to and what to look for
- `g<shell>_<theme>_<step>_<name>.png`: screenshots, cropped to the popup where possible; `_FAILED` is the whole screen at the moment a step failed
- `full.log`: output of the Shell, the buses and the mock feed server, with the steps in between

## How it works

- `feeds.py` is a small HTTP server on localhost that serves the test feeds. Article dates are computed from the current time, so the relative times in the screenshots stay the same. `garbage.xml` and any unknown name are the two broken feeds.
- `driver.js` is read and evaluated inside the test Shell through `org.gnome.Shell.Eval` (the Shell runs with `--unsafe-mode`). It creates a virtual pointer and keyboard, so clicks and keys are real input events, and takes screenshots through the Shell's own screenshot service.
- `scenarios.js` holds the tests. A step id starts with the section of the checklist it covers, `00` is the harness itself.
- Opening an article does not start a browser: the test profile registers a handler that only writes the URL to a file.

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

A step that throws is recorded as failed with a screenshot and the scenario goes on. Use `waitFor` instead of fixed sleeps, and move the pointer away (`moveTo`) before using the keyboard: a row under the pointer takes the key focus.
