/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2015 - 2026
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

export function getParametersAsJson(url)
{
	let l2o = url.indexOf('?');

	if (l2o == -1)
		return "{}";

	let urlParams = url.substr(l2o + 1);
	let params = urlParams.split('&');

	let jsonObj = "{";
	for (let i = 0; i < params.length; i++)
	{
		let pair = params[i].split('=');
		jsonObj += '"' + pair[0] + '":' + '"' + pair[1] + '"';
		if (i != params.length - 1)
			jsonObj += ',';
	}
	jsonObj += "}";

	return jsonObj;
}

export function buildUrl(baseUrl, params)
{
	let paramObj = JSON.parse(params);
	let keys = Object.keys(paramObj);

	if (!keys.length)
		return baseUrl;

	let query = keys.map(k => encodeURIComponent(k) + '=' + encodeURIComponent(paramObj[k])).join('&');
	return baseUrl + '?' + query;
}
