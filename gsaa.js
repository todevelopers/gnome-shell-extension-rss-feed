/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2017 - 2026
 *
 * This file is part of gnome-shell-extension-rss-feed.
 *
 * gnome-shell-extension-rss-feed is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * gnome-shell-extension-rss-feed is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with gnome-shell-extension-rss-feed.  If not, see <http://www.gnu.org/licenses/>.
 */

export class GSAA
{
	constructor(settings, key)
	{
		this._settings = settings;
		this._gsKey = key;
		this._gsData = new Object();

		this.load();
	}

	destroy()
	{
		delete this._gsData;
	}

	load()
	{
		let data = this._settings.get_string(this._gsKey);

		this._gsData = JSON.parse(data);
	}

	dump()
	{
		if (!this._gsData)
			return;

		let data = JSON.stringify(this._gsData);

		this._settings.set_string(this._gsKey, data);
	}

	get(key, subkey)
	{
		let data = this._gsData[key];

		if (!data)
			return undefined;

		return data[subkey];
	}

	set(key, subkey, value)
	{
		this.load();

		let data = this._gsData[key];

		if (!data)
			data = this._gsData[key] = new Object();

		data[subkey] = value;

		this.dump();
	}

	remove(key)
	{
		this.load();

		if (!this._gsData[key])
			return;

		this._gsData[key] = undefined;

		this.dump();
	}

	rename(from, to)
	{
		this.load();

		let data = this._gsData[from];

		if (!data)
			return;

		this._gsData[to] = data;
		delete this._gsData[from];

		this.dump();
	}
}
