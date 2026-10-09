import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as GSKeys from '../../gskeys.js';
import { FeedPoller } from '../../data/feedPoller.js';
import { timeouts, runTimeouts, resetTimeouts } from '../gi/GLib.js';
import { networkMonitor, setNetworkAvailable, resetNetworkMonitor, cancelledError } from '../gi/Gio.js';
import { requests, sessions, caches, respond, fail, resetSoup } from '../gi/Soup.js';

const rss = (title, prolog = '') => prolog + '<rss version="2.0"><channel><title>' + title + '</title><link>https://x.com</link><description>d</description>' +
	'<item><guid>g1</guid><title>Item</title><link>https://x.com/1</link><description>d</description></item></channel></rss>';

// č, š and ž in a row are E8 B9 BE, which is valid utf-8 as well, so the samples keep ascii between them
const LATIN2 = { 'č': 0xE8, 'š': 0xB9, 'ž': 0xBE };
const latin2 = text => Uint8Array.from(text, c => LATIN2[c] ?? c.charCodeAt(0));

const connectionError = { message: 'Connection refused', matches: () => false };
const pendingSeconds = () => [...timeouts.values()].map(t => t.seconds);

function makeSettings(values) {
	return {
		values,
		handlers: new Map(),
		get_int: key => values[key],
		get_boolean: key => values[key],

		connectObject(...args) {
			this.owner = args.pop();
			for (let i = 0; i < args.length; i += 2)
				this.handlers.set(args[i], args[i + 1]);
		},

		disconnectObject(owner) {
			if (owner === this.owner)
				this.handlers.clear();
		},

		emit(signal) {
			this.handlers.get(signal)();
		},
	};
}

function setup({ urls = ['https://a.example/rss'], online = true, interval = 0 } = {}) {
	networkMonitor.network_available = online;

	const sources = urls.map(url => ({ url, setError: vi.fn(), merge: vi.fn() }));
	const repository = { flushItems: vi.fn() };
	const settings = makeSettings({
		[GSKeys.UPDATE_INTERVAL]: interval,
		[GSKeys.ITEMS_RETAINED]: 200,
		[GSKeys.MARK_INITIAL_AS_NEW]: false,
	});

	const poller = new FeedPoller({ getSources: () => sources }, repository, settings, 'rss-feed@test');
	poller.onStart = vi.fn();
	poller.onProgress = vi.fn();
	poller.onComplete = vi.fn();
	poller.onIdle = vi.fn();

	return { poller, sources, repository, settings };
}

beforeEach(() => {
	resetTimeouts();
	resetNetworkMonitor();
	resetSoup();
	vi.spyOn(console, 'warn').mockImplementation(() => {});
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('FeedPoller', () => {

	describe('a successful fetch', () => {
		it('merges the parsed feed and completes the cycle', () => {
			const { poller, sources, repository } = setup();
			poller.start();

			expect(poller.onStart).toHaveBeenCalledWith(1);
			expect(requests).toHaveLength(1);
			expect(requests[0].message.url).toBe('https://a.example/rss');

			respond(requests[0], { body: rss('Feed A') });

			const [parser, options] = sources[0].merge.mock.calls[0];
			expect(parser.Publisher.Title).toBe('Feed A');
			expect(parser.Items).toHaveLength(1);
			expect(options).toEqual({ itemsRetained: 200, markInitialAsNew: false });
			expect(sources[0].setError.mock.calls).toEqual([[null]]);
			expect(poller.onProgress.mock.calls).toEqual([[1, 1]]);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
			expect(repository.flushItems).toHaveBeenCalledTimes(1);
			expect(caches[0].dump).toHaveBeenCalledTimes(1);
			expect(poller.lastUpdated).toBeInstanceOf(Date);
		});

		it('completes only after the last source answered', () => {
			const { poller, sources } = setup({ urls: ['https://a.example/rss', 'https://b.example/rss'] });
			poller.start();

			expect(poller.onStart).toHaveBeenCalledWith(2);
			respond(requests[1], { body: rss('Feed B') });
			expect(poller.onProgress.mock.calls).toEqual([[1, 2]]);
			expect(poller.onComplete).not.toHaveBeenCalled();

			respond(requests[0], { body: rss('Feed A') });
			expect(poller.onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
			expect(sources[0].merge).toHaveBeenCalledTimes(1);
			expect(sources[1].merge).toHaveBeenCalledTimes(1);
		});

		it('identifies itself without posing as a browser', () => {
			const { poller } = setup();
			poller.start();

			const agent = requests[0].message.requestHeaders.get_one('User-Agent');
			expect(agent).toMatch(/^gnome-shell-extension-rss-feed\//);
			expect(agent).not.toContain('Mozilla');
		});

		it('escapes the query of the request url', () => {
			const { poller } = setup({ urls: ['https://a.example/rss?q=a b'] });
			poller.start();

			expect(requests[0].message.url).toBe('https://a.example/rss?q=a%20b');
		});
	});

	describe('an unchanged feed', () => {
		it('treats a 304 as a success without merging', () => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { status: 304, reason: 'Not Modified', body: null });

			expect(sources[0].merge).not.toHaveBeenCalled();
			expect(sources[0].setError.mock.calls).toEqual([[null]]);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
		});

		it('does not merge the same body twice', () => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { body: rss('Feed A') });

			poller.refresh();
			respond(requests[1], { body: rss('Feed A') });

			expect(sources[0].merge).toHaveBeenCalledTimes(1);
			expect(sources[0].setError.mock.calls).toEqual([[null], [null]]);
			expect(poller.onComplete).toHaveBeenCalledTimes(2);
		});

		it('merges a changed body', () => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { body: rss('Feed A') });

			poller.refresh();
			respond(requests[1], { body: rss('Feed A, renamed') });

			expect(sources[0].merge).toHaveBeenCalledTimes(2);
		});

		it('merges the same body again after the retention limit changed', () => {
			const { poller, sources, settings } = setup();
			poller.start();
			respond(requests[0], { body: rss('Feed A') });

			settings.values[GSKeys.ITEMS_RETAINED] = 50;
			settings.emit('changed::' + GSKeys.ITEMS_RETAINED);
			poller.refresh();
			respond(requests[1], { body: rss('Feed A') });

			expect(sources[0].merge).toHaveBeenCalledTimes(2);
			expect(sources[0].merge.mock.calls[1][1]).toEqual({ itemsRetained: 50, markInitialAsNew: false });
		});

		it('does not remember a body it could not parse', () => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { body: '<html><body>moved</body></html>' });

			poller.refresh();
			respond(requests[1], { body: '<html><body>moved</body></html>' });

			expect(sources[0].setError.mock.calls).toEqual([['Not a feed'], ['Not a feed']]);
		});

		it('does not remember a body whose merge threw', () => {
			const { poller, sources } = setup();
			sources[0].merge.mockImplementationOnce(() => {
				throw new Error('boom');
			});
			poller.start();
			respond(requests[0], { body: rss('Feed A') });

			expect(sources[0].setError.mock.calls).toEqual([['Unexpected error']]);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);

			poller.refresh();
			respond(requests[1], { body: rss('Feed A') });

			expect(sources[0].merge).toHaveBeenCalledTimes(2);
			expect(sources[0].setError).toHaveBeenLastCalledWith(null);
		});
	});

	describe('a failed fetch', () => {
		it('reports a 404 at once and does not retry', () => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { status: 404, reason: 'Not Found' });

			expect(sources[0].setError.mock.calls).toEqual([['404 Not Found']]);
			expect(sources[0].merge).not.toHaveBeenCalled();
			expect(timeouts.size).toBe(0);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
		});

		it.each([
			[500, 'Internal Server Error'],
			[503, 'Service Unavailable'],
			[408, 'Request Timeout'],
			[429, 'Too Many Requests'],
		])('retries a %i twice before reporting it', (status, reason) => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { status, reason });

			expect(pendingSeconds()).toEqual([5]);
			expect(sources[0].setError).not.toHaveBeenCalled();
			expect(poller.onProgress.mock.calls).toEqual([[1, 1]]);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);

			runTimeouts(5);
			expect(requests).toHaveLength(2);
			respond(requests[1], { status, reason });

			expect(pendingSeconds()).toEqual([20]);
			expect(sources[0].setError).not.toHaveBeenCalled();

			runTimeouts(20);
			expect(requests).toHaveLength(3);
			respond(requests[2], { status, reason });

			expect(sources[0].setError.mock.calls).toEqual([[status + ' ' + reason]]);
			expect(timeouts.size).toBe(0);
			expect(poller.onProgress).toHaveBeenCalledTimes(1);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
		});

		it('retries a connection error and reports its message in the end', () => {
			const { poller, sources } = setup();
			poller.start();
			fail(requests[0], connectionError);

			expect(pendingSeconds()).toEqual([5]);
			expect(sources[0].setError).not.toHaveBeenCalled();
			expect(poller.onComplete).toHaveBeenCalledTimes(1);

			runTimeouts(5);
			fail(requests[1], connectionError);
			runTimeouts(20);
			fail(requests[2], connectionError);

			expect(sources[0].setError.mock.calls).toEqual([['Connection refused']]);
			expect(timeouts.size).toBe(0);
		});

		it('retries an answer that came without a body', () => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { body: null });

			expect(pendingSeconds()).toEqual([5]);

			runTimeouts(5);
			respond(requests[1], { body: null });
			runTimeouts(20);
			respond(requests[2], { body: null });

			expect(sources[0].setError.mock.calls).toEqual([['Empty response']]);
		});

		it('merges a retry that succeeds without reporting the cycle again', () => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { status: 500, reason: 'Internal Server Error' });
			runTimeouts(5);
			respond(requests[1], { body: rss('Feed A') });

			expect(sources[0].merge).toHaveBeenCalledTimes(1);
			expect(sources[0].setError.mock.calls).toEqual([[null]]);
			expect(timeouts.size).toBe(0);
			expect(poller.onProgress).toHaveBeenCalledTimes(1);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
		});

		it('drops the pending retries when a new cycle starts', () => {
			const { poller } = setup();
			poller.start();
			respond(requests[0], { status: 500, reason: 'Internal Server Error' });
			expect(pendingSeconds()).toEqual([5]);

			poller.refresh();

			expect(timeouts.size).toBe(0);
			expect(requests).toHaveLength(2);

			poller.refresh();

			expect(requests).toHaveLength(3);
		});

		it('keeps a retry out of the counters of a cycle that is still open', () => {
			const { poller, sources } = setup({ urls: ['https://a.example/rss', 'https://b.example/rss'] });
			poller.start();
			respond(requests[0], { status: 500, reason: 'Internal Server Error' });

			expect(poller.onProgress.mock.calls).toEqual([[1, 2]]);

			runTimeouts(5);
			respond(requests[2], { body: rss('Feed A') });

			expect(sources[0].merge).toHaveBeenCalledTimes(1);
			expect(poller.onProgress.mock.calls).toEqual([[1, 2]]);
			expect(poller.onComplete).not.toHaveBeenCalled();

			respond(requests[1], { body: rss('Feed B') });

			expect(poller.onProgress.mock.calls).toEqual([[1, 2], [2, 2]]);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
		});

		it('reports a page that is not a feed', () => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { body: '<html><body>moved</body></html>' });

			expect(sources[0].setError.mock.calls).toEqual([['Not a feed']]);
			expect(timeouts.size).toBe(0);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
		});

		it('reports an empty body without retrying', () => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], { body: '' });

			expect(sources[0].setError.mock.calls).toEqual([['Empty response']]);
			expect(timeouts.size).toBe(0);
		});

		it('reports a url libsoup cannot parse', () => {
			const { poller, sources } = setup({ urls: ['not a url'] });
			poller.start();

			expect(requests).toHaveLength(0);
			expect(sources[0].setError.mock.calls).toEqual([['Invalid URL']]);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
		});

		it('ignores a request that was cancelled', () => {
			const { poller, sources } = setup();
			poller.start();
			fail(requests[0], cancelledError);

			expect(sources[0].setError).not.toHaveBeenCalled();
			expect(poller.onProgress).not.toHaveBeenCalled();
			expect(poller.onComplete).not.toHaveBeenCalled();
			expect(timeouts.size).toBe(0);
		});
	});

	describe('offline', () => {
		it('does not fetch while offline and polls on reconnect', () => {
			const { poller } = setup({ online: false });
			poller.start();

			expect(requests).toHaveLength(0);
			expect(poller.onStart).not.toHaveBeenCalled();
			expect(poller.onIdle).not.toHaveBeenCalled();

			setNetworkAvailable(true);

			expect(requests).toHaveLength(1);
			expect(poller.onStart).toHaveBeenCalledWith(1);
		});

		it('does not poll again on a network change that keeps it online', () => {
			const { poller } = setup();
			poller.start();
			setNetworkAvailable(true);

			expect(requests).toHaveLength(1);
		});

		it('neither blames nor retries a feed that failed because the machine went offline', () => {
			const { poller, sources } = setup();
			poller.start();
			networkMonitor.network_available = false;
			fail(requests[0], connectionError);

			expect(sources[0].setError).not.toHaveBeenCalled();
			expect(timeouts.size).toBe(0);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
		});

		it('retracts an announced cycle when the next one finds the machine offline', () => {
			const { poller } = setup();
			poller.start();
			networkMonitor.network_available = false;
			poller.refresh();

			expect(requests).toHaveLength(1);
			expect(poller.onIdle).toHaveBeenCalledTimes(1);
			expect(poller.onComplete).not.toHaveBeenCalled();
		});
	});

	describe('a cycle that replaces another', () => {
		it('ignores the answers of the cycle it replaced', () => {
			const { poller, sources } = setup();
			poller.start();
			poller.refresh();

			expect(requests).toHaveLength(2);
			expect(requests[0].cancellable.is_cancelled()).toBe(true);

			respond(requests[0], { body: rss('Feed A') });

			expect(sources[0].merge).not.toHaveBeenCalled();
			expect(poller.onProgress).not.toHaveBeenCalled();

			respond(requests[1], { body: rss('Feed A') });

			expect(sources[0].merge).toHaveBeenCalledTimes(1);
			expect(poller.onProgress.mock.calls).toEqual([[1, 1]]);
			expect(poller.onComplete).toHaveBeenCalledTimes(1);
		});

		it('asks the server to revalidate only on a manual refresh', () => {
			const { poller } = setup();
			poller.start();
			poller.refresh();

			expect(requests[0].message.requestHeaders.get_one('Cache-Control')).toBeNull();
			expect(requests[1].message.requestHeaders.get_one('Cache-Control')).toBe('no-cache');
		});
	});

	describe('without sources', () => {
		it('announces nothing', () => {
			const { poller } = setup({ urls: [] });
			poller.start();

			expect(requests).toHaveLength(0);
			expect(poller.onStart).not.toHaveBeenCalled();
			expect(poller.onIdle).not.toHaveBeenCalled();
			expect(poller.onComplete).not.toHaveBeenCalled();
		});
	});

	describe('scheduling', () => {
		it('polls again after the update interval', () => {
			const { poller } = setup({ interval: 10 });
			poller.start();

			expect(pendingSeconds()).toEqual([600]);

			respond(requests[0], { body: rss('Feed A') });
			runTimeouts(600);

			expect(requests).toHaveLength(2);
			expect(requests[1].message.requestHeaders.get_one('Cache-Control')).toBeNull();
			expect(pendingSeconds()).toEqual([600]);
		});

		it('follows a change of the update interval', () => {
			const { poller, settings } = setup({ interval: 10 });
			poller.start();

			settings.values[GSKeys.UPDATE_INTERVAL] = 5;
			settings.emit('changed::' + GSKeys.UPDATE_INTERVAL);
			expect(pendingSeconds()).toEqual([300]);

			settings.values[GSKeys.UPDATE_INTERVAL] = 0;
			settings.emit('changed::' + GSKeys.UPDATE_INTERVAL);
			expect(timeouts.size).toBe(0);
		});
	});

	describe('destroy', () => {
		it('leaves nothing behind', () => {
			const { poller, settings } = setup({ interval: 10 });
			poller.start();
			respond(requests[0], { status: 500, reason: 'Internal Server Error' });

			expect(pendingSeconds()).toEqual([600, 5]);

			poller.destroy();

			expect(timeouts.size).toBe(0);
			expect(settings.handlers.size).toBe(0);
			expect(networkMonitor.handlers).toHaveLength(0);
			expect(sessions[0].abort).toHaveBeenCalledTimes(1);
			expect(requests[0].cancellable.is_cancelled()).toBe(true);
			expect(caches[0].dump).toHaveBeenCalledTimes(2);
		});
	});

	describe('encoding', () => {
		const title = responseOptions => {
			const { poller, sources } = setup();
			poller.start();
			respond(requests[0], responseOptions);
			return sources[0].merge.mock.calls[0][0].Publisher.Title;
		};

		it('decodes utf-8 by default', () => {
			expect(title({ body: rss('čas šum žaba') })).toBe('čas šum žaba');
		});

		it('takes the charset from the content-type header', () => {
			expect(title({ body: latin2(rss('čas šum žaba')), contentType: 'application/rss+xml; charset=iso-8859-2' })).toBe('čas šum žaba');
		});

		it('takes the encoding from the xml prolog when the header names none', () => {
			const prolog = '<?xml version="1.0" encoding="iso-8859-2"?>';
			expect(title({ body: latin2(rss('čas šum žaba', prolog)), contentType: 'application/rss+xml' })).toBe('čas šum žaba');
			resetSoup();
			expect(title({ body: latin2(rss('čas šum žaba', prolog)) })).toBe('čas šum žaba');
		});

		it('reads a feed whose header names an encoding it does not know', () => {
			expect(title({ body: rss('čas šum žaba'), contentType: 'text/xml; charset=no-such-charset' })).toBe('čas šum žaba');
		});
	});
});
