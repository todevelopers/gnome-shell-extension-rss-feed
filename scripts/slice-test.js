// Checks whether a short string cut out of a downloaded feed keeps the whole feed text alive.
// Run each mode in its own process, the second argument is the number of rounds:
//   for r in 300 900; do for m in feed feed-none; do gjs -m slice-test.js $m $r; done; done
// feed-none parses the same feeds but keeps nothing, so growth it shares with feed is not held by the articles.
// feed-flat, feed-flat-json, feed-flat-codec and feed-flat-split keep the articles with every text field copied in a different way,
// the one that grows like feed-none releases the feed text.
// The feed modes load the installed extension, pass its directory as the fourth argument when it is not in the default place.

/* global ARGV, print */

import GLib from 'gi://GLib';
import System from 'system';

const UUID = 'rss-feed@gnome-shell-extension.todevelopers.github.com';

const mode = ARGV[0] || 'slice';
const ROUNDS = Number(ARGV[1]) || 300;
// "gc" as the third argument collects garbage every 25 rounds, growth that survives it is really held
const collect = ARGV[2] === 'gc';
const dir = ARGV[3] || GLib.build_filenamev([GLib.get_user_data_dir(), 'gnome-shell', 'extensions', UUID]);

function rss()
{
	let [, contents] = GLib.file_get_contents('/proc/self/status');
	return Number(new TextDecoder().decode(contents).match(/VmRSS:\s+(\d+)/)[1]);
}

function copy(s)
{
	return (' ' + s).slice(1);
}

// candidates for a copy that no longer points into the feed text
const FLATTEN = {
	'feed-flat': copy,
	'feed-flat-json': s => JSON.parse(JSON.stringify(s)),
	'feed-flat-codec': s => new TextDecoder().decode(new TextEncoder().encode(s)),
	'feed-flat-split': s => s.split('').join(''),
};

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
		if (collect && i % 25 === 0)
			System.gc();

		let parser = createRssParser(feedBody(i), 'test');
		parser.parse();

		if (mode === 'feed-none')
			continue;

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

		let item = new FeedItem(data);

		if (FLATTEN[mode])
		{
			for (let key of ['id', 'link', 'title', 'desc', 'publishDate', 'updateTime'])
				item[key] = FLATTEN[mode](item[key]);
		}

		kept.push(item);
	}
}

System.gc();
System.gc();

let after = rss();
print(mode.padEnd(10) + ' rounds ' + ROUNDS + (collect ? ' gc' : '') + ', before ' + before + ' kB, after ' + after + ' kB, grew ' + (after - before) + ' kB, kept ' + kept.length);
