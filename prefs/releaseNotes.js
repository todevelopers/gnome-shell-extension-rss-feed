export const RELEASE_NOTES_VERSION = '9.0';

export const RELEASE_NOTES = `
<p>Failed feed management, OPML import/export, and a new article storage backend</p>
<ul>
<li>OPML import and export from the Sources preferences page, with folders preserved on import</li>
<li>Feeds that fail to update are now retried automatically and reported in the menu header as a "N failed" pill that opens the Sources page</li>
<li>Menu header shows update progress ("Updating... 12/40") while feeds are being fetched, and "Idle" when no sources are configured</li>
<li>New "Show failed feeds indicator" preference to hide the failed pill</li>
<li>Sources page gained "Check all sources" and "Remove all sources" buttons, plus a counter showing how many sources are configured and how many of them failed</li>
<li>Panel menu is fully keyboard operable, with the view scrolling to follow the focused item</li>
<li>Added GNOME Shell 51 to the supported versions</li>
<li>HTTP 429 responses no longer break the update with "429 is not a valid value for enumeration Status"</li>
<li>A source that throws no longer stalls the whole update cycle, nor the validation queue in preferences</li>
<li>Fixed double-escaped query strings in feed request URLs</li>
<li>Changing the fetch interval now takes effect immediately instead of after the next poll</li>
<li>Fixed "object has been already disposed" when expanding "Show more"</li>
<li>The failed feeds pill no longer stays stale after the failing source is removed</li>
<li>Fixed focus being lost after clicking "Show more"</li>
<li>Fixed the mark as read button size and the unread marker in the minimal layout</li>
<li>Feeds are validated in batches of five on the Sources page, so large lists no longer block the preferences window</li>
</ul>
`;
