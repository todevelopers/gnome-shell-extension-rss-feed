## Changelog

### v9.0 (29.08.2026)

*Failed feed management, OPML import/export, and a new article storage backend*

* main feature: OPML import and export from the Sources preferences page, with folders preserved on import
* main feature: Feeds that fail to update are now retried automatically and reported in the menu header as a "N failed" pill that opens the Sources page
* feature: Menu header shows update progress ("Updating... 12/40") while feeds are being fetched, and "Idle" when no sources are configured
* feature: New "Show failed feeds indicator" preference to hide the failed pill
* feature: Sources page gained "Check all sources" and "Remove all sources" buttons, plus a counter showing how many sources are configured and how many of them failed
* feature: Panel menu is fully keyboard operable, with the view scrolling to follow the focused item
* feature: Added GNOME Shell 51 to the supported versions
* bugfix: HTTP 429 responses no longer break the update with "429 is not a valid value for enumeration Status"
* bugfix: A source that throws no longer stalls the whole update cycle, nor the validation queue in preferences
* bugfix: Fixed double-escaped query strings in feed request URLs
* bugfix: Changing the fetch interval now takes effect immediately instead of after the next poll
* bugfix: Fixed "object has been already disposed" when expanding "Show more"
* bugfix: The failed feeds pill no longer stays stale after the failing source is removed
* bugfix: Fixed focus being lost after clicking "Show more"
* bugfix: Fixed the mark as read button size and the unread marker in the minimal layout
* performance: Feeds are validated in batches of five on the Sources page, so large lists no longer block the preferences window
* internal: Article state moved out of GSettings into per-feed JSON files, with migration of existing data
* internal: Added an HTTP cache (SoupCache) so unchanged feeds are not re-downloaded, flushed periodically to survive logout
* internal: Polling pauses while the machine is offline (Gio.NetworkMonitor) instead of failing every feed
* internal: Parse failures now report why the feed could not be read
* internal: Reworked the Sources preferences page

---

### v8.1 (08.07.2026)

*Review fixes for the extensions.gnome.org resubmission*

* internal: Removed an unnecessary try-catch around opening article links
* internal: The unread-flush timer is now removed directly in `destroy()`

---

### v8.0 (07.07.2026)

*Performance rework and clean architecture design. The extension now handles much larger volumes of feeds and articles without freezing the Shell.*

* main feature: Notifications can now be grouped by source ([#27](https://github.com/todevelopers/gnome-shell-extension-rss-feed/discussions/27))
* feature: New "Mode" selector in preferences — choose between *Notifications and widget*, *Notifications only* (hides the panel indicator), or *Widget only* ([#28](https://github.com/todevelopers/gnome-shell-extension-rss-feed/discussions/28))
* bugfix: Atom feeds now read `summary`/`content` as the article description — fixes empty descriptions on some feeds
* bugfix: Articles that are only updated keep their read state and no longer re-notify or reappear as unread
* bugfix: Notifications are dismissed when the corresponding article is removed from the feed
* bugfix: Changed feed-request `User-Agent` so feeds behind anti-bot protection no longer fail with "Unable to parse"
* bugfix: Panel indicator unread dot now renders reliably on GNOME 46 — no more invisible/resizing marker ([#32](https://github.com/todevelopers/gnome-shell-extension-rss-feed/issues/32))
* bugfix: Fixed unread state being lost when the extension is disabled
* performance: Large feeds no longer freeze the Shell — chunked menu building, pagination in the classic layout, "Show all" in the minimal layout, and a configurable item-retention limit
* internal: Replaced the legacy REXML parser with a lightweight vendored txml parser
* internal: Complete data/UI architecture split — `extension.js` reduced to thin wiring
* internal: Adopted the `connectObject`/`disconnectObject` pattern for external signal handling
* internal: Removed the obsolete update-detection button

---

### v7.2 (19.06.2026)

*Light theme compatibility*

* main bugfix: Fixed extension being unusable on light GNOME themes (e.g. Yaru light) — all hardcoded white overlay colors replaced with theme-neutral alternatives ([#31](https://github.com/todevelopers/gnome-shell-extension-rss-feed/issues/31))
* bugfix: Notification feed avatars now use the user's selected system accent color (GNOME 47+ `accent-color` setting) — fixes white-on-white SVG invisible on light notification backgrounds
* internal: Notification accent color adapts via GSettings on GNOME 47+, falls back to default blue on GNOME 46

---

### v7.1 (15.06.2026)

*Code cleanup and bugfixes in preparation for extensions.gnome.org submission*

* bugfix: Fixed widget height calculation when fewer sources are configured
* bugfix: Fixed resource leak — scroll idle source was not removed on extension disable
* internal: Reworked and modernized encoder.js with expanded test coverage

---

### v7.0 (01.05.2026)

*Complete rewrite for modern GNOME*

* main feature: Ported to GNOME 46+ — updated to GJS ES module system and current Shell APIs
* feature: Supports GNOME Shell 46, 47, 48, 49, and 50
* main feature: Fully redesigned UI built from scratch for the modern GNOME desktop
* main feature: Two layout modes selectable from preferences:
  * Classic — per-feed submenus with feed avatars and unread count pills
  * Minimal — single chronological list mixing all sources
* feature: Panel indicator — shows a dot when there are unread articles
* feature: Relative timestamps on every article (2m, 4h, 3d, 2w)
* feature: Mark as read via two-step confirmation button — no accidental clicks
* feature: Show all / collapse sections for read articles
* feature: Native GNOME notifications redesigned — optional lock screen delivery
* feature: Closes the system tray panel when opening an article link
* feature: Preferences redesigned — sources page, notifications page, layout selector
* feature: Feed sources — add, remove, inline edit, and drag-and-drop reordering
* feature: Configurable initial unread state for articles on first load
* feature: Added `User-Agent` header to feed requests
* bugfix: Fixed text encoding and HTML entity handling in feed content
* bugfix: Fixed settings persistence across sessions
* feature: Added unit tests (vitest) and CI workflow (ESLint, shexli, vitest)

---

### v2.0 (03.03.2017)

*Major rework*

* Reworked incoming data handling and menu update procedures (large performance boost)
* Various bugfixes and increased fault tolerance
* Replaced RSS source 'paging' system with a scrollable menu (maximum menu height can be set)
* Added new article notification system
* Mark unread articles in menu, show unread count in status area
* Complete rework of the settings widget, added source verification
  * Keep the plugin active when Gnome session locks / blanks screen (by default, all plugins are disabled at this point)
  * Poll delay - minimizes performance impact on gnome-shell by rate-limiting source queries 
  * Toggle debug mode
  * Reload plugin button (depends on 'gnome-shell-extension-tool')
  * Panel menu:
    * Maximum number of shown articles per source
    * Toggle menu animations
    * Set menu button alignment (top/bottom)
    * Toggle update detection
    * Show article descriptions when selected
  * Notifications:
    * Toggle on/off
    * Set notification limit
    * Remove when plugin disabled
    * Toggle show on lock screen
  * RSS sources:
    * Added 'Status' colum, displays source validation result
    * Recheck all sources button, double click on a source to recheck it
    * Removed 'Edit' button, made URL column cell editable (click selected row to edit)
    * Made list reorderable (drag to reorder)
    * Added buttons to move selected item up/down
  * **`Note that certain features require plugin restart to take effect`**
* Added plugin restart button (shown only in debug mode) - this reinitializes the plugin so gnome-shell does not have to be restarted after editing the source
* Fixed REXML HTML attribute parsing bug
* Right click on article copies URL to clipboard

### v1.2 (24.05.2015)

*Hotfix version*

* feature: Behind proxy use [#4](https://github.com/todevelopers/gnome-shell-extension-rss-feed/issues/4)
* bugfix: Escaped XML/HTML characters displaying improperly. [#2](https://github.com/todevelopers/gnome-shell-extension-rss-feed/issues/2)
* bugfix: some feeds do not work: no data available [#3](https://github.com/todevelopers/gnome-shell-extension-rss-feed/issues/3)
* bugfix: Too long strings cut to 128 characters maximum length

### v1.1 (03.05.2015)

*Patch version with new formats support*

* main feature: Atom format support
* main feature: RDF format support
* feature: Disable scheduled Update interval by seting it to 0
* feature: Debug messages for extension. Should be turned on in dconf
* performance: Settings widget works better. Extension must be reloaded after changes made in Settings tab
* bugfix: Reported sources through GNOME Shell extensions portal now works
* bugfix: feed gives 0 status [#1](https://github.com/todevelopers/gnome-shell-extension-rss-feed/issues/1)

### v1.0 (18.04.2015)

*First release with base functionality*

* main feature: GNOME Shell panel popup extension
  * Panel button opens popup with RSS Feeds
  * RSS Feed contains list of articles
  * Default web browser is opened after click on article with links page
  * Refresh button
  * Settings button
  * Navigation buttons
  * Last update time
* main feature: Settings widget
  * Update interval in minutes
  * Number of sources per one page
  * List of RSS sources URLs
* feature: Asynchronous HTTP client for downloading RSS sources
* feature: Regular expresion XML parser
