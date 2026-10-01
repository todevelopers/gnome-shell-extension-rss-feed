import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

const dir = process.argv[2];

if (!dir)
{
	console.error('usage: node scripts/history-report.js <items directory>');
	process.exit(1);
}

// counts the articles that share a key with an earlier one, each id is one stored article
function countDuplicates(items, keyOf)
{
	let groups = new Map();
	for (let item of items)
	{
		let key = keyOf(item);
		if (!key)
			continue;
		groups.set(key, (groups.get(key) || 0) + 1);
	}

	let duplicates = 0;
	let worst = null;
	for (let [key, count] of groups)
	{
		if (count < 2)
			continue;
		duplicates += count - 1;
		if (!worst || count > worst.count)
			worst = { key, count };
	}

	return { duplicates, worst };
}

let feeds = [];

for (let name of readdirSync(dir))
{
	if (!name.endsWith('.json'))
		continue;

	let path = join(dir, name);
	let data = JSON.parse(readFileSync(path, 'utf8'));
	let items = data.items || [];

	feeds.push({
		url: data.url,
		items: items.length,
		unread: items.filter(i => !i.read).length,
		bytes: statSync(path).size,
		idIsLink: items.filter(i => i.id === i.link).length,
		sameLink: countDuplicates(items, i => i.link),
		sameTitleDate: countDuplicates(items, i => i.title + '\n' + i.publishDate),
		sameTitle: countDuplicates(items, i => i.title),
	});
}

let sum = key => feeds.reduce((total, feed) => total + feed[key], 0);
let sumDuplicates = key => feeds.reduce((total, feed) => total + feed[key].duplicates, 0);

console.log('feeds:              ' + feeds.length);
console.log('articles:           ' + sum('items'));
console.log('unread:             ' + sum('unread'));
console.log('size on disk:       ' + (sum('bytes') / 1024 / 1024).toFixed(1) + ' MiB');
console.log('largest feed:       ' + Math.max(0, ...feeds.map(feed => feed.items)) + ' articles');
console.log('feeds without guid: ' + feeds.filter(feed => feed.items && feed.idIsLink === feed.items).length);
console.log('');
console.log('duplicates, same link:           ' + sumDuplicates('sameLink'));
console.log('duplicates, same title and date: ' + sumDuplicates('sameTitleDate'));
console.log('duplicates, same title:          ' + sumDuplicates('sameTitle'));

let suspects = feeds
	.filter(feed => feed.sameLink.duplicates || feed.sameTitle.duplicates)
	.sort((a, b) => b.sameTitle.duplicates - a.sameTitle.duplicates);

for (let feed of suspects)
{
	console.log('');
	console.log(feed.url);
	console.log('  articles ' + feed.items + ', id is the link in ' + feed.idIsLink);
	console.log('  same link ' + feed.sameLink.duplicates
		+ ', same title and date ' + feed.sameTitleDate.duplicates
		+ ', same title ' + feed.sameTitle.duplicates);

	let worst = feed.sameTitle.worst || feed.sameLink.worst;
	console.log('  worst: ' + worst.count + 'x ' + JSON.stringify(worst.key));
}
