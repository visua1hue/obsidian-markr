import { WidgetType } from "@codemirror/view";
import { setIcon } from "obsidian";
import type { MarkerDef } from "../settings/types";
import type { MarkerCssVars } from "../theme/cssVars";
import { drawPriorityGlyph } from "../theme/priorityGlyph";

/** What the badge draws in place of the trigger text. */
export type BadgeContent =
	| { kind: "icon"; icon: string }
	| { kind: "priority"; id: Extract<MarkerDef, { kind: "priority" }>["id"] };

export class BadgeWidget extends WidgetType {
	constructor(
		private readonly defId: string,
		private readonly content: BadgeContent,
		private readonly label: string,
		private readonly tooltip: boolean,
		private readonly cssVars: MarkerCssVars,
	) {
		super();
	}

	eq(other: BadgeWidget): boolean {
		return (
			other.defId === this.defId &&
			other.content.kind === this.content.kind &&
			(other.content.kind === "icon"
				? this.content.kind === "icon" &&
					other.content.icon === this.content.icon
				: this.content.kind === "priority" &&
					other.content.id === this.content.id) &&
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
		const el = createSpan();
		el.className = `mr-badge mr-badge-${this.defId} mr-colorized`;
		el.setCssProps(this.cssVars);
		if (this.content.kind === "icon") {
			el.addClass("mr-badge-icon");
			setIcon(el, this.content.icon);
		} else {
			el.addClass("mr-badge-drawn");
			el.appendChild(drawPriorityGlyph(this.content.id));
		}

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
