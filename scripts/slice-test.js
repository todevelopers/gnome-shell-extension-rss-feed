// Checks whether a short string cut out of a downloaded feed keeps the whole feed text alive.
// Run each mode in its own process:
//   for m in slice copy feed feed-copy; do gjs -m slice-test.js $m; done
// The feed modes load the installed extension, pass its directory as the second argument when it is not in the default place.

/* global ARGV, print */

import GLib from 'gi://GLib';
import System from 'system';

const ROUNDS = 300;
const UUID = 'rss-feed@gnome-shell-extension.todevelopers.github.com';

const mode = ARGV[0] || 'slice';
const dir = ARGV[1] || GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', UUID]);

function rss()
{
	let [, contents] = GLib.file_get_contents('/proc/self/status');
	return Number(new TextDecoder().decode(contents).match(/VmRSS:\s+(\d+)/)[1]);
}

function copy(s)
{
	return (' ' + s).slice(1);
}

function feedBody(round)
{
	let filler = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(70);
	let items = [];

	for (let i = 0; i < 50; i++)
	{
		items.push('<item><title>Article ' + round + '-' + i + ' with a reasonably long headline</title>'
			+ '<link>https://example.org/articles/' + round + '/' + i + '/a-reasonably-long-slug</link>'
			+ '<guid>https://example.org/?p=' + round + '000' + i + '&amp;source=feed</guid>'
			+ '<pubDate>Sat, 03 Oct 2026 10:' + String(i).padStart(2, '0') + ':00 GMT</pubDate>'
			+ '<description>' + filler + '</description></item>');
	}

	let xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>Test</title>' + items.join('') + '</channel></rss>';
	return new TextDecoder().decode(new TextEncoder().encode(xml));
}

let kept = [];
let before = rss();

if (mode === 'slice' || mode === 'copy')
{
	for (let i = 0; i < ROUNDS; i++)
	{
		let body = new TextDecoder().decode(new Uint8Array(200000).fill(97));
		let part = body.slice(100, 160);
		kept.push(mode === 'copy' ? copy(part) : part);
	}
}
else
{
	let { createRssParser } = await import('file://' + dir + '/parsers/factory.js');
	let { FeedItem } = await import('file://' + dir + '/data/feedItem.js');

	for (let i = 0; i < ROUNDS; i++)
	{
		let parser = createRssParser(feedBody(i), 'test');
		parser.parse();

		// one new article per poll, built the same way FeedSource.merge builds it
		let p = parser.Items[0];
		let data = {
			id: p.ID,
			title: p.Title,
			link: p.HttpLink,
			desc: p.Description,
			publishDate: p.PublishDate,
			updateTime: p.UpdateTime,
		};

		if (mode === 'feed-copy')
		{
			data.id = copy(data.id);
			data.link = copy(data.link);
			data.publishDate = copy(data.publishDate);
			data.updateTime = copy(data.updateTime);
		}

		kept.push(new FeedItem(data));
	}
}

System.gc();
System.gc();

let after = rss();
print(mode.padEnd(10) + ' before ' + before + ' kB, after ' + after + ' kB, grew ' + (after - before) + ' kB, kept ' + kept.length);
