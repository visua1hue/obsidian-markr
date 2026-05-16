import { setIcon } from "obsidian";
import type { PluginSettings } from "../settings/types";
import { Matcher, type MatchResult } from "../editor/matcher";
import { markerCssVars } from "../theme/cssVars";

/** Marker set on a processed <li> so a re-run of the post-processor (Obsidian
   may invoke it on the same DOM after a re-render) doesn't strip text twice
   or stack a second badge. */
const PROCESSED_ATTR = "data-mr-row";

type RowKind = "task" | "bullet" | "numbered";

interface RowTarget {
	li: HTMLLIElement;
	kind: RowKind;
	/** Element whose direct children hold this item's visible label run. The
     <li> itself in tight lists; the leading <p> child in loose lists. */
	contentHost: HTMLElement;
	/** Task-checkbox <input>, when this item is a task. Stays as a sibling of
     .mr-rv-row inside contentHost — the row is inserted immediately after
     it, so the tint never paints under the checkbox. */
	checkbox: HTMLInputElement | null;
}

export function buildPostProcessor(getSettings: () => PluginSettings) {
	return (el: HTMLElement): void => {
		const settings = getSettings();
		if (!settings.performance.applyInReadingView) return;
		const matcher = new Matcher(settings);

		el.querySelectorAll<HTMLLIElement>("li").forEach((li) => {
			renderRow(li, matcher, settings);
		});
	};
}

function renderRow(
	li: HTMLLIElement,
	matcher: Matcher,
	settings: PluginSettings,
): void {
	if (li.hasAttribute(PROCESSED_ATTR)) return;

	const target = describe(li);
	if (!target) return;

	const leadText = firstLabelTextNode(target.contentHost, target.checkbox);
	if (!leadText || !leadText.textContent) return;

	const match = matchTrigger(leadText.textContent, matcher);
	if (!match) return;

	stripTrigger(leadText, match);

	const row = buildRow(target, match);
	const badge = buildBadge(match, settings);

	placeBadge(row, badge);

	li.setAttribute(PROCESSED_ATTR, target.kind);
}

/* ------------------------------------------------------------------------ */
/* Structure                                                                */
/* ------------------------------------------------------------------------ */

function describe(li: HTMLLIElement): RowTarget | null {
	let contentHost: HTMLElement = li;
	let checkbox = directCheckbox(li);

	if (!checkbox) {
		const leadP = findLeadParagraph(li);
		if (leadP) {
			contentHost = leadP;
			checkbox = directCheckbox(leadP);
		}
	}

	const inOl = li.parentElement?.tagName === "OL";
	const kind: RowKind = checkbox ? "task" : inOl ? "numbered" : "bullet";

	return { li, kind, contentHost, checkbox };
}

function directCheckbox(host: Element): HTMLInputElement | null {
	return host.querySelector<HTMLInputElement>(
		":scope > input.task-list-item-checkbox",
	);
}

function findLeadParagraph(li: HTMLLIElement): HTMLElement | null {
	for (const child of Array.from(li.children)) {
		const tag = child.tagName;
		if (tag === "UL" || tag === "OL") return null;
		if (tag === "P") return child as HTMLElement;
	}
	return null;
}

/* ------------------------------------------------------------------------ */
/* Match + strip                                                            */
/* ------------------------------------------------------------------------ */

function matchTrigger(
	text: string,
	matcher: Matcher,
): (MatchResult & { triggerEnd: number; skipSpace: number }) | null {
	const leading = /^\s*/.exec(text)![0].length;
	const firstChar = text[leading];
	if (!firstChar || !matcher.firstCharSet().has(firstChar)) return null;

	const match = matcher.matchAt(text, leading);
	if (!match) return null;
	const triggerEnd = match.offset + match.trigger.length;
	const after = text[triggerEnd];
	if (after !== undefined && !/\s/.test(after)) return null;

	const skipSpace = after === " " ? 1 : 0;
	return { ...match, triggerEnd, skipSpace };
}

function stripTrigger(
	leadText: Text,
	match: { triggerEnd: number; skipSpace: number },
): void {
	leadText.textContent = (leadText.textContent ?? "").slice(
		match.triggerEnd + match.skipSpace,
	);
}

/* ------------------------------------------------------------------------ */
/* Badge                                                                    */
/* ------------------------------------------------------------------------ */

function buildBadge(match: MatchResult, settings: PluginSettings): HTMLElement {
	const badge = document.createElement("span");
	badge.className = `mr-badge mr-badge-rv mr-badge-${match.def.id} mr-colorized`;
	const badgeBg =
		match.def.badgeBg ??
		(match.def.kind === "priority" ? "var(--mr-marker-bg)" : undefined);
	badge.setCssProps(markerCssVars(match.def.color, badgeBg));

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

	return badge;
}

/* ------------------------------------------------------------------------ */
/* Row                                                                      */
/* ------------------------------------------------------------------------ */

function buildRow(target: RowTarget, match: MatchResult): HTMLElement {
	const row = document.createElement("span");
	row.className = `mr-rv-row mr-rv-row--${target.kind} mr-line-${match.def.id} mr-colorized`;
	row.setCssProps(markerCssVars(match.def.color));

	if (
		target.kind === "task" &&
		target.checkbox &&
		target.checkbox.parentNode === target.contentHost
	) {
		return assembleTaskRow(target, row);
	}
	return assemblePlainRow(target, row);
}

function assembleTaskRow(target: RowTarget, row: HTMLElement): HTMLElement {
	const host = document.createElement("span");
	host.className = "mr-rv-host";
	const checkbox = target.checkbox!;

	target.contentHost.insertBefore(host, checkbox);
	host.appendChild(checkbox);
	host.appendChild(row);

	let node: ChildNode | null = host.nextSibling;
	while (node && !isBlockBoundary(node)) {
		const next = node.nextSibling;
		row.appendChild(node);
		node = next;
	}
	return row;
}

function assemblePlainRow(target: RowTarget, row: HTMLElement): HTMLElement {
	const anchor = firstLabelAnchor(target.contentHost);
	target.contentHost.insertBefore(row, anchor);

	let node: ChildNode | null = row.nextSibling;
	while (node && !isBlockBoundary(node)) {
		const next = node.nextSibling;
		row.appendChild(node);
		node = next;
	}
	return row;
}

function firstLabelAnchor(host: HTMLElement): Node | null {
	for (const child of Array.from(host.childNodes)) {
		if (child.nodeType === Node.ELEMENT_NODE) {
			const el = child as Element;
			if (
				el.classList.contains("list-bullet") ||
				el.classList.contains("list-collapse-indicator")
			) {
				continue;
			}
		}
		return child;
	}
	return null;
}

function placeBadge(row: HTMLElement, badge: HTMLElement): void {
	row.insertBefore(badge, row.firstChild);
}

/* ------------------------------------------------------------------------ */
/* Traversal helpers                                                        */
/* ------------------------------------------------------------------------ */

function firstLabelTextNode(
	host: Element,
	checkbox: HTMLInputElement | null,
): Text | null {
	for (const child of Array.from(host.childNodes)) {
		if (child === checkbox) continue;
		if (child.nodeType === Node.TEXT_NODE) {
			const t = child as Text;
			if ((t.textContent ?? "").trim().length > 0) return t;
			continue;
		}
		if (child.nodeType !== Node.ELEMENT_NODE) continue;

		const childEl = child as Element;
		if (SKIP_INSIDE_LABEL.has(childEl.tagName)) continue;
		if (
			childEl.classList.contains("mr-badge") ||
			childEl.classList.contains("mr-rv-row")
		) {
			continue;
		}
		const inner = firstLabelTextNode(childEl, null);
		if (inner) return inner;
	}
	return null;
}

const SKIP_INSIDE_LABEL = new Set([
	"UL",
	"OL",
	"BR",
	"HR",
	"PRE",
	"TABLE",
	"BLOCKQUOTE",
	"H1",
	"H2",
	"H3",
	"H4",
	"H5",
	"H6",
]);

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
