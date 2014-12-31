
const St = imports.gi.St;
const Main = imports.ui.main;
const Tweener = imports.ui.tweener;

let button;


function init() {
    button = new St.Bin({ style_class: 'panel-button',
                          reactive: true,
                          can_focus: true,
                          x_fill: true,
                          y_fill: false,
                          track_hover: true });
    let icon = new St.Icon({ icon_name: 'application-rss+xml-symbolic',
                             style_class: 'system-status-icon' });

    button.set_child(icon);
}

function enable() {
    Main.panel._rightBox.insert_child_at_index(button, 0);
}

function disable() {
    Main.panel._rightBox.remove_child(button);
}
