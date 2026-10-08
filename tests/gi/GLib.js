import { createHash } from 'crypto';

export const timeouts = new Map();

let lastId = 0;

export function resetTimeouts() {
	timeouts.clear();
}

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

	Uri: {
		escape_string: (text, allowed) => text.replace(/[^A-Za-z0-9\-._~]/gu, c => allowed.includes(c) ? c : encodeURIComponent(c)),
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
	compute_checksum_for_bytes: (_type, bytes) => createHash('sha256').update(bytes.toArray()).digest('hex'),
};
