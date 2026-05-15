import { setIcon } from "obsidian";
import type { PluginSettings } from "../settings/types";
import { Matcher, type MatchResult } from "../editor/matcher";

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

	const badge = buildBadge(match, settings);
	const row = buildRow(target, match);
	placeBadge(row, badge);

	li.setAttribute(PROCESSED_ATTR, target.kind);
}

/* ------------------------------------------------------------------------ */
/* Structure                                                                */
/* ------------------------------------------------------------------------ */

/** Classify a list item and locate its label-bearing container.

   The single abstraction the renderer uses for bullets, numbered items, and
   tasks. `contentHost` always points at the element whose direct child run is
   the visible label — either the <li> (tight list) or its leading <p> (loose
   list). The task checkbox, when present, is always a direct child of the
   chosen contentHost.

   Obsidian's reading view prepends a <span class="list-bullet"> (and
   sometimes a <span class="list-collapse-indicator">) to every <li> in a
   <ul>, so the leading <p> in a loose list is *not* the first element child
   of <li>. `findLeadParagraph` scans past those decoration spans rather than
   bailing at the first non-<p> element. */
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
	// Strip the trigger and its trailing space. The badge supplies the gap
	// via its own inline margin (.mr-badge-rv in styles.css), so HTML
	// whitespace collapsing can't swallow it.
	leadText.textContent = (leadText.textContent ?? "").slice(
		match.triggerEnd + match.skipSpace,
	);
}

/* ------------------------------------------------------------------------ */
/* Badge                                                                    */
/* ------------------------------------------------------------------------ */

function buildBadge(match: MatchResult, settings: PluginSettings): HTMLElement {
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
	return badge;
}

/* ------------------------------------------------------------------------ */
/* Row                                                                      */
/* ------------------------------------------------------------------------ */

/** Build the row wrapper and pull this item's top-level inline label run
   into it. Stops at the first block boundary — nested <ul>/<ol>, hard
   breaks, continuation paragraphs, etc. — so the tint can never bleed past
   the item's own label.

   Three kinds, two layout strategies:

   - Bullet / numbered: the row is inserted at the start of contentHost,
     after any Obsidian decoration spans (.list-bullet, .list-collapse-
     indicator) so those stay in the gutter outside the tint.
   - Task: the checkbox is moved into a flex sibling host (.mr-rv-host)
     alongside the row, so the row can claim the remaining content-area
     width with `flex: 1` instead of shrinking to the inline text. The
     checkbox keeps its native gutter offset via a compatibility selector
     in styles.css. */
function buildRow(target: RowTarget, match: MatchResult): HTMLElement {
	const row = document.createElement("span");
	row.className = `mr-rv-row mr-rv-row--${target.kind} mr-line-${match.def.id}`;

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

/** First child of contentHost that's actually part of the label run, skipping
   Obsidian's prepended decoration spans. Keeps .list-bullet and the
   collapse indicator outside the tinted row so they stay in the gutter. */
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

/** Badge sits at the start of the text column for every kind — the row's
   DOM position already handles the checkbox/bullet gutter, so a single
   placement rule suffices. */
function placeBadge(row: HTMLElement, badge: HTMLElement): void {
	row.insertBefore(badge, row.firstChild);
}

/* ------------------------------------------------------------------------ */
/* Traversal helpers                                                        */
/* ------------------------------------------------------------------------ */

/** First non-whitespace text node in the label run for this item, skipping
   the task checkbox. Recurses into inline elements (a <strong>, <a>, or
   <code> may wrap the trigger text). Skips — but does not bail on —
   nested-list and hard-break elements so an unexpected leading element
   (e.g. Obsidian's decoration span variants) doesn't kill the lookup. */
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

/** Elements that never carry the lead text and should be skipped (but not
   bailed on) when scanning for it. Sub-lists and hard breaks come *after*
   the label; PRE/TABLE/HR/headings shouldn't appear inside a list-item's
   inline run at all, but if they do they're not the label. */
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

/** Elements that end the inline label run when walking forward from the row's
   insertion point in `buildRow` — anything block-level that interrupts the
   label flow. */
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
