## Changelog

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
