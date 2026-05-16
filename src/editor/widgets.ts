import { WidgetType } from "@codemirror/view";
import { setIcon } from "obsidian";
import type { MarkerCssVars } from "../theme/cssVars";

export class BadgeWidget extends WidgetType {
	constructor(
		private readonly defId: string,
		private readonly icon: string,
		private readonly label: string,
		private readonly tooltip: boolean,
		private readonly cssVars: MarkerCssVars,
	) {
		super();
	}

	eq(other: BadgeWidget): boolean {
		return (
			other.defId === this.defId &&
			other.icon === this.icon &&
			other.label === this.label &&
			other.tooltip === this.tooltip &&
			other.cssVars["--mr-marker-bg-light"] ===
				this.cssVars["--mr-marker-bg-light"] &&
			other.cssVars["--mr-marker-fg-light"] ===
				this.cssVars["--mr-marker-fg-light"] &&
			other.cssVars["--mr-marker-bg-dark"] ===
				this.cssVars["--mr-marker-bg-dark"] &&
			other.cssVars["--mr-marker-fg-dark"] ===
				this.cssVars["--mr-marker-fg-dark"] &&
			other.cssVars["--mr-badge-bg"] === this.cssVars["--mr-badge-bg"]
		);
	}

	toDOM(): HTMLElement {
		const el = document.createElement("span");
		el.className = `mr-badge mr-badge-${this.defId} mr-badge-icon mr-colorized`;
		el.setCssProps(this.cssVars);
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
