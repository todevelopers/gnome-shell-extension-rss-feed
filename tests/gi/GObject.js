export const TYPE_JSOBJECT = 'jsobject';

class GObject {
	constructor(...args) {
		this._handlers = [];
		this._init(...args);
	}

	_init() {}

	connectObject(...args) {
		let owner = args.pop();
		for (let i = 0; i < args.length; i += 2)
			this._handlers.push({ name: args[i], callback: args[i + 1], owner });
	}

	disconnectObject(owner) {
		this._handlers = this._handlers.filter(h => h.owner !== owner);
	}

	emit(name, ...args) {
		for (let handler of this._handlers.filter(h => h.name === name))
			handler.callback(this, ...args);
	}
}

export default {
	Object: GObject,
	TYPE_JSOBJECT,
	registerClass: (_meta, cls) => cls,
};
