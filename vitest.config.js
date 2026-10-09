import { resolve } from 'path';

const fake = name => resolve('tests/gi', name + '.js');

export default {
	resolve: {
		alias: {
			'gi://GObject': fake('GObject'),
			'gi://GLib': fake('GLib'),
			'gi://Gio': fake('Gio'),
			'gi://Soup': fake('Soup'),
			'gi://St': fake('St'),
			'resource:///org/gnome/shell/ui/main.js': resolve('tests/shell/main.js'),
			'resource:///org/gnome/shell/misc/animationUtils.js': resolve('tests/shell/animationUtils.js'),
		},
	},
};
