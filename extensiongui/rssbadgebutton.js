import Clutter from 'gi://Clutter';
import GObject from 'gi://GObject';
import St from 'gi://St';

export const RssBadgeButton = GObject.registerClass(
class RssBadgeButton extends St.Button
{
	_init(styleClass, defaultChild)
	{
		super._init(
		{
			style_class: styleClass,
			track_hover: true,
			can_focus: false,
			y_align: Clutter.ActorAlign.CENTER,
		});
		this._defaultChild = defaultChild;
		this._confirmIcon = new St.Icon(
		{
			icon_name: 'object-select-symbolic',
			icon_size: 14,
			x_align: Clutter.ActorAlign.CENTER,
			y_align: Clutter.ActorAlign.CENTER,
			style_class: 'rss-badge-confirm-icon',
		});
		this.set_child(defaultChild);
		this._confirmMode = false;
		this.onConfirm = null;
		this.onEnterConfirm = null;

		this.connect('clicked', () =>
		{
			console.debug('rss-feed: badge clicked, confirmMode=' + this._confirmMode);
			if (this._confirmMode)
			{
				if (this.onConfirm)
					this.onConfirm();
				this.exitConfirm();
			}
			else
			{
				this.enterConfirm();
				if (this.onEnterConfirm)
					this.onEnterConfirm(this);
			}
		});

		this.connect_after('button-release-event', () => Clutter.EVENT_STOP);
	}

	enterConfirm()
	{
		if (this._confirmMode)
			return;
		this._confirmMode = true;
		this.set_child(this._confirmIcon);
	}

	exitConfirm()
	{
		if (!this._confirmMode)
			return;
		this._confirmMode = false;
		this.set_child(this._defaultChild);
	}
});
