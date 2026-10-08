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
	IOErrorEnum,
	NetworkMonitor: { get_default: () => networkMonitor },
};
