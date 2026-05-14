import { WidgetType } from "@codemirror/view";
import { setIcon } from "obsidian";

/** Renders an icon marker's badge. Priority markers are styled in place with a
    `Decoration.mark` (they stay editable text), so this widget is icon-only. */
export class BadgeWidget extends WidgetType {
	constructor(
		private readonly defId: string,
		private readonly icon: string,
		private readonly label: string,
		private readonly tooltip: boolean,
	) {
		super();
	}

	eq(other: BadgeWidget): boolean {
		return (
			other.defId === this.defId &&
			other.icon === this.icon &&
			other.label === this.label &&
			other.tooltip === this.tooltip
		);
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.className = `mr-badge mr-badge-${this.defId} mr-badge-icon`;
		setIcon(el, this.icon);
		if (this.tooltip) {
			el.setAttribute("aria-label", this.label);
			el.setAttribute("data-tooltip-position", "top");
		} else {
			el.setAttribute("aria-hidden", "true");
		}
		return el;
	}

	ignoreEvent(): boolean {
		return true;
	}
}
