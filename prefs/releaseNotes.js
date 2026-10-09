export const RELEASE_NOTES_VERSION = '10.0';

export const RELEASE_NOTES = `
<p>Starred articles, configurable article actions, and a compact popup header</p>
<ul>
<li>Starred articles, shown in a Starred group (Classic) or a STARRED section (Minimal); they are never removed by the retention limit and survive removing their feed</li>
<li>Configurable article actions: up to three hover buttons per article and separate actions for the left, middle and right mouse button, set on the new Actions page</li>
<li>New compact popup header with an overflow menu holding Refresh, Mark all as read, Restore dismissed, Unstar all and Settings</li>
<li>Articles can be dismissed, and all dismissed articles can be brought back with "Restore dismissed"</li>
<li>New "Mark this and older as read" action</li>
<li>Article history: articles that dropped out of a feed stay stored until the per-feed limit is reached, the default limit is now 200</li>
<li>Actions that leave the popup open confirm themselves with a short message in the header</li>
<li>About dialog with the version, project links and what's new</li>
<li>Articles without a title now use the beginning of their description</li>
<li>Fixed article links containing XML entities</li>
<li>Feeds with an unclosed br, img or hr tag in the description are no longer rejected</li>
<li>Feeds with an upper case or quoted charset declaration are decoded correctly</li>
<li>Removing a source no longer scrolls the Sources page back to the top or downloads all other feeds again</li>
<li>The header status text no longer disappears after switching the display mode</li>
<li>A feed whose content did not change since the last check is neither decoded nor parsed again</li>
</ul>
`;
