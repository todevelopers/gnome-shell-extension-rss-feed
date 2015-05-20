/*
 * RSS Feed extension for GNOME Shell
 *
 * Copyright (C) 2015
 *     Tomas Gazovic <gazovic.tomasgmail.com>,
 *     Janka Gazovicova <jana.gazovicova@gmail.com>
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

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Log = Me.imports.logger;
const XML = Me.imports.rexml;
const Feedburner = Me.imports.parsers.feedburner;
const Rdf = Me.imports.parsers.rdf;
const Atom = Me.imports.parsers.atom;
const Rss = Me.imports.parsers.rss;

/*
 *  Factory function that initialize correct parser class instance
 */
function createRssParser(rawXml) {

    try {
        // remove XML declarations because the REXML library is not able to parse it
        // more lines possibility
        let cleanXml = rawXml.split(/\<\?\s*xml(.*?).*\?\>/).join('');

        // remove HTML comments. REXML library could not handle it (especially when couple of lines are commented)
        cleanXml = cleanXml.split(/<!--[\s\S]*?-->/g).join('');

        let xdoc = new XML.REXML(cleanXml);

        if (xdoc.rootElement.attribute('xmlns:feedburner') == 'http://rssnamespace.org/feedburner/ext/1.0')
            return new Feedburner.FeedburnerParser(xdoc.rootElement);

        let test;

        test = 'rdf:RDF';
        if (xdoc.rootElement.name.slice(0, test.length) == test)
            return new Rdf.RdfParser(xdoc.rootElement);

        test = 'feed';
        if (xdoc.rootElement.name.toLowerCase().slice(0, test.length) == test)
            return new Atom.AtomParser(xdoc.rootElement);

        test = 'rss';
        if (xdoc.rootElement.name.toLowerCase().slice(0, test.length) == test)
            return new Rss.RssParser(xdoc.rootElement);
    }
    catch (e) {
        Log.Error(e);
    }

    return null;
}
