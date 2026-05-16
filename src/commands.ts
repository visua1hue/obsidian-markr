import { type Editor, Plugin } from "obsidian";
import type { MarkerDef, PluginSettings } from "./settings/types";
import { Matcher, matchListLine } from "./editor/matcher";

const LIST_PREFIX = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/;
const PRIORITY_ORDER = ["p1", "p2", "p3"] as const;

interface LineParts {
	prefix: string;
	body: string;
	existing: { def: MarkerDef; trigger: string } | null;
}

function parseLine(text: string, matcher: Matcher): LineParts | null {
	const m = LIST_PREFIX.exec(text);
	if (!m) return null;
	const prefix = m[0];
	const rest = text.slice(prefix.length);
	const match = matchListLine(text, matcher);
	if (match) {
		const after = match.offset + match.trigger.length;
		const skip = text[after] === " " ? 1 : 0;
		return {
			prefix,
			body: text.slice(after + skip),
			existing: { def: match.def, trigger: match.trigger },
		};
	}
	return { prefix, body: rest, existing: null };
}

/**
 * Rewrites the trigger region of a line while preserving cursor position
 * in the body. Uses replaceRange on just the changed range so CM6 keeps
 * the cursor stable when it's outside that range.
 */
function rewriteTriggerRegion(
	editor: Editor,
	lineNum: number,
	oldPrefix: string,
	oldTriggerWithSpace: string,
	newTriggerWithSpace: string,
): void {
	const from = { line: lineNum, ch: oldPrefix.length };
	const to = {
		line: lineNum,
		ch: oldPrefix.length + oldTriggerWithSpace.length,
	};
	const cursor = editor.getCursor();
	editor.replaceRange(newTriggerWithSpace, from, to);

	const delta = newTriggerWithSpace.length - oldTriggerWithSpace.length;
	if (cursor.line === lineNum) {
		if (cursor.ch >= to.ch) {
			editor.setCursor({ line: lineNum, ch: cursor.ch + delta });
		} else if (cursor.ch > from.ch) {
			editor.setCursor({
				line: lineNum,
				ch: from.ch + newTriggerWithSpace.length,
			});
		} else {
			editor.setCursor(cursor);
		}
	}
}

function applyMarker(
	editor: Editor,
	def: MarkerDef,
	getSettings: () => PluginSettings,
): void {
	const lineNum = editor.getCursor().line;
	const text = editor.getLine(lineNum);
	const parts = parseLine(text, new Matcher(getSettings()));
	if (!parts) return;
	const oldChunk = parts.existing ? `${parts.existing.trigger} ` : "";
	rewriteTriggerRegion(
		editor,
		lineNum,
		parts.prefix,
		oldChunk,
		`${def.trigger} `,
	);
}

function removeMarker(editor: Editor, getSettings: () => PluginSettings): void {
	const lineNum = editor.getCursor().line;
	const text = editor.getLine(lineNum);
	const parts = parseLine(text, new Matcher(getSettings()));
	if (!parts || !parts.existing) return;
	rewriteTriggerRegion(
		editor,
		lineNum,
		parts.prefix,
		`${parts.existing.trigger} `,
		"",
	);
}

const PRIORITY_CYCLE = ["", "!", "!!", "!!!"] as const;

function cyclePriority(
	editor: Editor,
	dir: 1 | -1,
	getSettings: () => PluginSettings,
): void {
	const settings = getSettings();
	if (!settings.priority.enabled) return;
	const lineNum = editor.getCursor().line;
	const text = editor.getLine(lineNum);
	const parts = parseLine(text, new Matcher(settings));
	if (!parts) return;

	const current =
		parts.existing && parts.existing.def.kind === "priority"
			? parts.existing.trigger
			: "";
	const idx = PRIORITY_CYCLE.indexOf(
		current as (typeof PRIORITY_CYCLE)[number],
	);
	const baseIdx = idx === -1 ? 0 : idx;
	const nextIdx =
		(baseIdx + dir + PRIORITY_CYCLE.length) % PRIORITY_CYCLE.length;
	const nextTrigger = PRIORITY_CYCLE[nextIdx]!;

	const oldChunk = parts.existing ? `${parts.existing.trigger} ` : "";
	const newChunk = nextTrigger === "" ? "" : `${nextTrigger} `;
	rewriteTriggerRegion(editor, lineNum, parts.prefix, oldChunk, newChunk);
}

function findPriorityDef(
	settings: PluginSettings,
	id: (typeof PRIORITY_ORDER)[number],
): Extract<MarkerDef, { kind: "priority" }> | null {
	for (const def of settings.markers) {
		if (def.kind === "priority" && def.id === id) return def;
	}
	return null;
}

export function syncCustomMarkerCommands(
	plugin: Plugin,
	getSettings: () => PluginSettings,
	registeredIds: Set<string>,
): void {
	for (const id of registeredIds) {
		plugin.removeCommand(id);
	}
	registeredIds.clear();

	for (const marker of getSettings().markers) {
		if (marker.kind !== "custom") continue;
		const id = `apply-custom-${marker.id}`;
		plugin.addCommand({
			id,
			name: `Apply "${marker.label}" marker`,
			editorCallback: (editor) => {
				applyMarker(editor, marker, getSettings);
			},
		});
		registeredIds.add(id);
	}
}

export function registerCommands(
	plugin: Plugin,
	getSettings: () => PluginSettings,
): void {
	const initial = getSettings();

	for (const id of PRIORITY_ORDER) {
		const def = findPriorityDef(initial, id);
		if (!def) continue;

		plugin.addCommand({
			id: `apply-${def.id}`,
			name: `Apply "${def.label}" marker`,
			editorCallback: (editor) => {
				if (!getSettings().priority.enabled) return;
				applyMarker(editor, def, getSettings);
			},
		});
	}

	plugin.addCommand({
		id: "cycle-priority",
		name: "Cycle priority",
		editorCallback: (editor) => cyclePriority(editor, 1, getSettings),
	});

	plugin.addCommand({
		id: "remove",
		name: "Remove marker from line",
		editorCallback: (editor) => removeMarker(editor, getSettings),
	});
}
