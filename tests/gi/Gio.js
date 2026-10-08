import { files } from './GLib.js';

// the async methods return promises right away, so _promisify has nothing to wrap
class File {
	constructor(path) {
		this._path = path;
	}

	static new_for_path(path) {
		return new File(path);
	}

	async load_contents_async() {
		if (!files.has(this._path))
			throw new Error('No such file: ' + this._path);

		return [new TextEncoder().encode(files.get(this._path)), null];
	}

	async replace_contents_bytes_async(bytes) {
		files.set(this._path, new TextDecoder().decode(bytes.toArray()));
		return [true, null];
	}

	async delete_async() {
		if (!files.delete(this._path))
			throw new Error('No such file: ' + this._path);

		return true;
	}
}

class Cancellable {
	constructor() {
		this._cancelled = false;
	}

	cancel() {
		this._cancelled = true;
	}

	is_cancelled() {
		return this._cancelled;
	}
}

export const networkMonitor = {
	network_available: true,
	handlers: [],

	connectObject(signal, callback, owner) {
		this.handlers.push({ signal, callback, owner });
	},

	disconnectObject(owner) {
		this.handlers = this.handlers.filter(h => h.owner !== owner);
	},
};

export function resetNetworkMonitor() {
	networkMonitor.network_available = true;
	networkMonitor.handlers = [];
}

export function setNetworkAvailable(available) {
	networkMonitor.network_available = available;

	for (let handler of [...networkMonitor.handlers])
		handler.callback(networkMonitor, available);
}

const IOErrorEnum = { CANCELLED: 19 };

export const cancelledError = { message: 'Operation was cancelled', matches: (_domain, code) => code === IOErrorEnum.CANCELLED };

export default {
	Cancellable,
	File,
	FileCreateFlags: { REPLACE_DESTINATION: 2 },
	IOErrorEnum,
	_promisify() {},
	NetworkMonitor: { get_default: () => networkMonitor },
};
