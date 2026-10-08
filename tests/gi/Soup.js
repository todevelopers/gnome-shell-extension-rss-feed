import { vi } from 'vitest';

export const requests = [];
export const sessions = [];
export const caches = [];

export function resetSoup() {
	requests.length = 0;
	sessions.length = 0;
	caches.length = 0;
}

class Headers {
	constructor() {
		this._values = new Map();
	}

	replace(name, value) {
		this._values.set(name.toLowerCase(), value);
	}

	get_one(name) {
		return this._values.get(name.toLowerCase()) ?? null;
	}
}

class Message {
	// libsoup returns null for a string it cannot parse as a URI
	static new(method, url) {
		return /^https?:\/\/\S+$/.test(url) ? new Message(method, url) : null;
	}

	constructor(method, url) {
		this.method = method;
		this.url = url;
		this.status_code = 0;
		this.reason = '';
		this.requestHeaders = new Headers();
		this.responseHeaders = new Headers();
	}

	get_request_headers() {
		return this.requestHeaders;
	}

	get_response_headers() {
		return this.responseHeaders;
	}

	get_reason_phrase() {
		return this.reason;
	}
}

class Session {
	constructor(properties) {
		this.properties = properties;
		this.features = [];
		this.abort = vi.fn();
		sessions.push(this);
	}

	add_feature(feature) {
		this.features.push(feature);
	}

	send_and_read_async(message, _priority, cancellable, callback) {
		requests.push({ session: this, message, cancellable, callback });
	}

	send_and_read_finish(result) {
		if (result.error)
			throw result.error;

		return result.bytes;
	}
}

// body is a string (sent as utf-8), raw bytes, or null for an answer without a body
export function respond(request, { status = 200, reason = 'OK', contentType = null, body = '' } = {}) {
	request.message.status_code = status;
	request.message.reason = reason;

	if (contentType)
		request.message.responseHeaders.replace('content-type', contentType);

	let raw = typeof body === 'string' ? new TextEncoder().encode(body) : body;
	request.callback(request.session, { bytes: raw && { toArray: () => raw } });
}

export function fail(request, error) {
	request.callback(request.session, { error });
}

export default {
	Session,
	Message,
	CacheType: { SINGLE_USER: 0 },

	Cache: {
		new(directory, type) {
			let cache = { directory, type, load: vi.fn(), dump: vi.fn() };
			caches.push(cache);
			return cache;
		},
	},
};
