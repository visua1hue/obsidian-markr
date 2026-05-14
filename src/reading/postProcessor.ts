import { setIcon } from "obsidian";
import type { PluginSettings } from "../settings/types";
import { Matcher } from "../editor/matcher";

export function buildPostProcessor(getSettings: () => PluginSettings) {
	return (el: HTMLElement): void => {
		const settings = getSettings();
		if (!settings.performance.applyInReadingView) return;
		const matcher = new Matcher(settings);

		el.querySelectorAll("li").forEach((li) => {
			const first = firstTextNode(li);
			if (!first || !first.textContent) return;

			const text = first.textContent;
			const leading = /^\s*/.exec(text)![0].length;
			const firstChar = text[leading];
			if (!firstChar || !matcher.firstCharSet().has(firstChar)) return;

			const match = matcher.matchAt(text, leading);
			if (!match) return;
			const after = text[match.offset + match.trigger.length];
			if (after !== undefined && !/\s/.test(after)) return;

			const skipSpace = after === " " ? 1 : 0;
			// Strip the trigger (+ one space) from the first text node.
			first.textContent = text.slice(match.offset + match.trigger.length + skipSpace);

			// Line background — a class on the <li> itself.
			li.classList.add("mr-line", `mr-line-${match.def.id}`);

			// Trigger badge prepended to the list item.
			const badge = document.createElement("span");
			badge.className = `mr-badge mr-badge-${match.def.id}`;
			if (match.def.icon) {
				badge.classList.add("mr-badge-icon");
				setIcon(badge, match.def.icon);
			} else {
				badge.textContent = match.trigger;
			}
			if (settings.behavior.showTooltips) {
				badge.setAttribute("aria-label", match.def.label);
				badge.setAttribute("data-tooltip-position", "top");
			} else {
				badge.setAttribute("aria-hidden", "true");
			}
			li.prepend(badge);
		});
	};
}

function firstTextNode(el: Node): Text | null {
	for (const child of Array.from(el.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) {
			const t = child as Text;
			if (t.textContent && t.textContent.trim().length > 0) return t;
		}
		if (child.nodeType === Node.ELEMENT_NODE) {
			const tag = (child as Element).tagName;
			if (tag === "UL" || tag === "OL") continue;
			const inner = firstTextNode(child);
			if (inner) return inner;
		}
	}
	return null;
}
