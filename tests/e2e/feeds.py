#!/usr/bin/env python3
import argparse
import json
import sys
import time
from email.utils import formatdate
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from xml.sax.saxutils import escape

HOUR = 3600
DAY = 86400

# ages sit in the middle of a rounding step, so the relative time in a screenshot does not move during a run
RSS_AGES = [95, 70 * 60, 220 * 60, 11 * HOUR, 26 * HOUR, 62 * HOUR, 6 * DAY, 15 * DAY, 30 * DAY, 70 * DAY]
ATOM_AGES = [2 * HOUR, 8 * HOUR, 2 * DAY, 5 * DAY, 21 * DAY]
SHORT_AGES = [3 * HOUR, 9 * HOUR, 30 * HOUR, 4 * DAY, 16 * DAY]

FILLER = ' '.join(['lorem ipsum dolor sit amet consectetur'] * 7)


def rfc822(age):
    return formatdate(time.time() - age, usegmt=True)


def iso(age):
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime(time.time() - age))


def articles(base, feed, prefix, ages, width=2):
    items = []
    for index, age in enumerate(ages, start=1):
        number = '%0*d' % (width, index)
        items.append({
            'id': '%s-%s' % (feed, number),
            'title': '%s %s' % (prefix, number),
            'link': '%s/articles/%s/%s' % (base, feed, number),
            'desc': 'Description of %s %s.' % (prefix.lower(), number),
            'age': age,
        })
    return items


def with_state(state, base, feed, prefix, items):
    extra = state.get('extra', {}).get(feed, 0)
    fresh = []
    for index in range(extra, 0, -1):
        fresh.append({
            'id': '%s-new-%d' % (feed, index),
            'title': '%s new %d' % (prefix, index),
            'link': '%s/articles/%s/new-%d' % (base, feed, index),
            'desc': 'Description of a new article.',
            # a higher number is a newer article, and all of them are newer than the fixed ones
            'age': max(5, 60 - index),
        })
    titles = state.get('titles', {})
    for item in items:
        item['title'] = titles.get(item['id'], item['title'])
    return fresh + items


def rss(base, title, items, attrs=''):
    body = ''.join(
        '<item><title>%s</title><link>%s</link><description>%s</description><pubDate>%s</pubDate><guid>%s</guid></item>'
        % (escape(i['title']), escape(i['link']), escape(i['desc']), rfc822(i['age']), escape(i['id']))
        for i in items)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"%s><channel><title>%s</title><link>%s</link>'
            '<description>%s feed</description><lastBuildDate>%s</lastBuildDate>%s</channel></rss>'
            % (attrs, escape(title), base, escape(title), rfc822(0), body))


def atom(base, title, items):
    body = ''.join(
        '<entry><title>%s</title><link href="%s"/><id>urn:mock:%s</id><published>%s</published><updated>%s</updated>'
        '<summary>%s</summary></entry>'
        % (escape(i['title']), escape(i['link']), escape(i['id']), iso(i['age']), iso(i['age']), escape(i['desc']))
        for i in items)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>%s</title>'
            '<link rel="alternate" href="%s"/><updated>%s</updated>%s</feed>' % (escape(title), base, iso(0), body))


def rdf(base, title, items):
    body = ''.join(
        '<item><title>%s</title><link>%s</link><description>%s</description><dc:date>%s</dc:date></item>'
        % (escape(i['title']), escape(i['link']), escape(i['desc']), iso(i['age']))
        for i in items)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>%s</title><link>%s</link>'
            '<description>%s feed</description></channel>%s</rdf:RDF>' % (escape(title), base, escape(title), body))


def build(name, base, state):
    if name == 'rss2':
        return rss(base, 'Mock RSS', with_state(state, base, name, 'RSS article', articles(base, name, 'RSS article', RSS_AGES)))
    if name == 'atom':
        return atom(base, 'Mock Atom', with_state(state, base, name, 'Atom entry', articles(base, name, 'Atom entry', ATOM_AGES)))
    if name == 'rdf':
        return rdf(base, 'Mock RDF', articles(base, name, 'RDF item', SHORT_AGES))
    if name == 'feedburner':
        return rss(base, 'Mock FeedBurner', articles(base, name, 'FeedBurner item', SHORT_AGES),
                   ' xmlns:feedburner="http://rssnamespace.org/feedburner/ext/1.0"')
    if name == 'slow':
        time.sleep(3)
        return rss(base, 'Mock Slow', articles(base, name, 'Slow article', SHORT_AGES[:2]))
    if name == 'long':
        return rss(base, 'Mock Long', articles(base, name, 'Long article', [HOUR // 2 + n * HOUR for n in range(300)], 3))
    if name == 'longtitles':
        items = articles(base, name, 'Very long headline', SHORT_AGES[:3])
        for item in items:
            item['title'] += ' ' + FILLER
        return rss(base, 'Mock Long Titles', items)
    if name == 'notitle':
        items = articles(base, name, 'Untitled note', SHORT_AGES[:3])
        for item in items:
            item['desc'] = '%s: the title is taken from the start of this description.' % item['title']
            item['title'] = ''
        return rss(base, 'Mock No Title', items)
    if name == 'entities':
        items = articles(base, name, 'Entities', SHORT_AGES[:3])
        for item in items:
            item['title'] = item['title'].replace('Entities', 'Entities <b> article') + ' & more'
            item['link'] += '?a=1&b=2'
        return rss(base, 'Mock Entities & Co', items)
    if name == 'latin2':
        return rss(base, 'Mock Latin2', articles(base, name, 'Žluťoučký kůň', SHORT_AGES[:3])).replace('UTF-8', 'ISO-8859-2', 1)
    return None


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        name = self.path.split('?')[0].strip('/')
        if name.endswith('.xml'):
            name = name[:-4]
        base = 'http://%s:%d' % self.server.server_address

        try:
            with open(self.server.state_file, encoding='utf-8') as handle:
                state = json.load(handle)
        except (OSError, ValueError):
            state = {}

        if name == 'timeout':
            time.sleep(120)
            return
        if name == 'garbage':
            self.reply(b'this is not a feed', 'text/plain')
            return

        text = build(name, base, state)
        if text is None:
            self.send_error(404)
            return
        if name == 'latin2':
            # no charset in the header: the encoding has to be taken from the XML declaration
            self.reply(text.encode('iso-8859-2'), 'application/xml')
            return
        self.reply(text.encode('utf-8'), 'application/xml; charset=utf-8')

    def reply(self, body, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        # the extension keeps an HTTP cache, a cached feed would hide the changes a test makes
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        sys.stderr.write('[feeds] %s\n' % (format % args))
        sys.stderr.flush()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port-file', required=True)
    parser.add_argument('--state-file', required=True)
    args = parser.parse_args()

    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.daemon_threads = True
    server.state_file = args.state_file
    with open(args.port_file, 'w', encoding='utf-8') as handle:
        handle.write(str(server.server_address[1]))
    server.serve_forever()


if __name__ == '__main__':
    main()
