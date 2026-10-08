import { createHash } from 'crypto';

export const timeouts = new Map();
export const files = new Map();

let lastId = 0;

export function resetTimeouts() {
	timeouts.clear();
}

export function resetFiles() {
	files.clear();
}

class Bytes {
	constructor(data) {
		this._data = data;
	}

	toArray() {
		return this._data;
	}
}

const Dir = {
	open(path) {
		let names = [...files.keys()].filter(name => name.startsWith(path + '/')).map(name => name.slice(path.length + 1));

		return {
			read_name: () => names.shift() ?? null,
			close() {},
		};
	},
};

export function runTimeouts(seconds) {
	for (let [id, timeout] of [...timeouts]) {
		if (timeout.seconds !== seconds || !timeouts.has(id))
			continue;

		if (!timeout.callback())
			timeouts.delete(id);
	}
}

export default {
	PRIORITY_DEFAULT: 0,
	SOURCE_REMOVE: false,
	ChecksumType: { SHA256: 2 },
	Bytes,
	Dir,

	Uri: {
		escape_string: (text, allowed) => text.replace(/[^A-Za-z0-9\-._~]/gu, c => allowed.includes(c) ? c : encodeURIComponent(c)),
	},

	// kept in seconds like the other timeouts, so runTimeouts() covers both
	timeout_add(_priority, milliseconds, callback) {
		timeouts.set(++lastId, { seconds: milliseconds / 1000, callback });
		return lastId;
	},

	timeout_add_seconds(_priority, seconds, callback) {
		timeouts.set(++lastId, { seconds, callback });
		return lastId;
	},

	// GLib only logs a critical for an id it does not know, here it has to fail the test
	source_remove(id) {
		if (!timeouts.delete(id))
			throw new Error('source_remove: unknown source id ' + id);
	},

	build_filenamev: parts => parts.join('/'),
	get_user_cache_dir: () => '/cache',
	get_user_data_dir: () => '/data',
	mkdir_with_parents: () => 0,
	compute_checksum_for_bytes: (_type, bytes) => createHash('sha256').update(bytes.toArray()).digest('hex'),
	compute_checksum_for_string: (_type, text) => createHash('sha256').update(text).digest('hex'),

	file_set_contents(path, contents) {
		files.set(path, contents);
		return true;
	},
};
