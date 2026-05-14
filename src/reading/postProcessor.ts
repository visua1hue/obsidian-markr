import { setIcon } from "obsidian";
import type { PluginSettings } from "../settings/types";
import { Matcher } from "../editor/matcher";

export function buildPostProcessor(getSettings: () => PluginSettings) {
	return (el: HTMLElement): void => {
		const settings = getSettings();
		if (!settings.performance.applyInReadingView) return;
		const matcher = new Matcher(settings);

		el.querySelectorAll("li").forEach((li) => {
			// Skip list items we've already marked — the post-processor can run
			// again on the same DOM, and re-processing would strip more text
			// and stack a second badge. (mr-line now lives on the wrapper span,
			// so the <li> carries a dedicated done-flag class instead.)
			if (li.classList.contains("mr-line-done")) return;

			const first = firstTextNode(li);
			if (!first || !first.textContent) return;

			const text = first.textContent;
			const leading = /^\s*/.exec(text)![0].length;
			const firstChar = text[leading];
			if (!firstChar || !matcher.firstCharSet().has(firstChar)) return;

			const match = matcher.matchAt(text, leading);
			if (!match) return;
			const triggerEnd = match.offset + match.trigger.length;
			const after = text[triggerEnd];
			if (after !== undefined && !/\s/.test(after)) return;

			// Strip the trigger and its trailing space. The gap between badge
			// and body text is restored with a margin on the badge itself (the
			// `.mr-badge-rv` class below) rather than left-as-text, so it can't
			// be lost to HTML whitespace collapsing.
			const skipSpace = after === " " ? 1 : 0;
			first.textContent = text.slice(triggerEnd + skipSpace);

			// Trigger badge. `mr-badge-rv` carries the reading-view-only end
			// margin (the editor uses the real space character instead — see
			// styles.css).
			const badge = document.createElement("span");
			badge.className = `mr-badge mr-badge-rv mr-badge-${match.def.id}`;
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

			// Task-list items have an inline checkbox <input> that Obsidian
			// positions in the gutter (where a bullet would be). A block-level
			// wrapper would break onto its own line after the checkbox, and
			// swallowing the checkbox into the wrapper drags it out of the
			// gutter — so for task items we tint the <li> directly and leave
			// the checkbox untouched.
			const taskCheckbox = li.querySelector(
				":scope > input.task-list-item-checkbox",
			);
			if (taskCheckbox) {
				li.classList.add(
					"mr-line",
					"mr-line-rv-li",
					`mr-line-${match.def.id}`,
				);
				first.parentNode?.insertBefore(badge, first);
				li.classList.add("mr-line-done");
				return;
			}

			// Non-task items — a block-level wrapper holding the lead line's
			// inline run only. It stops at the first block boundary, so the tint
			// never spans continuation paragraphs, hard breaks, or nested
			// sub-lists. `first.parentNode` is the <li> in a tight list or the
			// wrapping <p> in a loose list — a <span> wrapper is valid in both
			// (a <div> would be invalid inside the <p>).
			const container = first.parentNode;
			if (!container) return;
			const wrapper = document.createElement("span");
			wrapper.className = `mr-line mr-line-rv mr-line-${match.def.id}`;
			const checkboxEl = container.querySelector<HTMLInputElement>(
				'input[type="checkbox"].task-list-item-checkbox',
			);
			const insertBefore = checkboxEl
				? checkboxEl.nextSibling
				: container.firstChild;
			container.insertBefore(wrapper, insertBefore);

			// Pull the leading inline run into the wrapper, up to the first
			// block boundary.
			let node: ChildNode | null = wrapper.nextSibling;
			while (node && !isBlockBoundary(node)) {
				const next = node.nextSibling;
				wrapper.appendChild(node);
				node = next;
			}
			// Badge sits right before its text node.
			wrapper.insertBefore(badge, first);
			li.classList.add("mr-line-done");
		});
	};
}

/** Block-level tags that end the lead line's inline run. */
const BLOCK_BOUNDARY_TAGS = new Set([
	"UL",
	"OL",
	"P",
	"DIV",
	"BLOCKQUOTE",
	"PRE",
	"TABLE",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
	"BR",
]);

function isBlockBoundary(node: Node): boolean {
	return (
		node.nodeType === Node.ELEMENT_NODE &&
		BLOCK_BOUNDARY_TAGS.has((node as Element).tagName)
	);
}

function firstTextNode(el: Node): Text | null {
	for (const child of Array.from(el.childNodes)) {
		if (child.nodeType === Node.TEXT_NODE) {
			const t = child as Text;
			if (t.textContent && t.textContent.trim().length > 0) return t;
		}
		if (child.nodeType === Node.ELEMENT_NODE) {
			const childEl = child as Element;
			const tag = childEl.tagName;
			if (tag === "UL" || tag === "OL") continue;
			// Don't descend into output from a previous pass — a text-marker
			// badge's textContent is the trigger char (would re-match), and a
			// line wrapper already holds processed content.
			if (
				childEl.classList.contains("mr-badge") ||
				childEl.classList.contains("mr-line")
			) {
				continue;
			}
			const inner = firstTextNode(child);
			if (inner) return inner;
		}
	}
	return null;
}
