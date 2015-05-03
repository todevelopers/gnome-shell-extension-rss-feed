## Changelog

### v1.1 (03.05.2015)

*Patch version with new formats support*

* main feature: Atom format support
* main feature: RDF format support
* feature: Disable scheduled Update interval by seting it to 0
* feature: Debug messages for extension. Should be turned on in dconf
* performance: Settings widget works better. Extension must be reloaded after changes made in Settings tab
* bugfix: Reported sources now works

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
