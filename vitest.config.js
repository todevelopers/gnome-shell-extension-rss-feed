import { resolve } from 'path';

const fake = name => resolve('tests/gi', name + '.js');

export default {
	resolve: {
		alias: {
			'gi://GObject': fake('GObject'),
			'gi://GLib': fake('GLib'),
			'gi://Gio': fake('Gio'),
			'gi://Soup': fake('Soup'),
		},
	},
};
