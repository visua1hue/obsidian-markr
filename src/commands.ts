import { type Editor, type MarkdownView, type Command, Plugin } from "obsidian";
import type { MarkerDef, PluginSettings } from "./settings/types";
import { Matcher, matchListLine } from "./editor/matcher";

const LIST_PREFIX = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/;

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
	const to = { line: lineNum, ch: oldPrefix.length + oldTriggerWithSpace.length };
	const cursor = editor.getCursor();
	editor.replaceRange(newTriggerWithSpace, from, to);
	// If the cursor was inside the rewritten region, snap it to the new region's end.
	// If it was after, shift by the delta. If before, leave it alone.
	const delta = newTriggerWithSpace.length - oldTriggerWithSpace.length;
	if (cursor.line === lineNum) {
		if (cursor.ch >= to.ch) {
			editor.setCursor({ line: lineNum, ch: cursor.ch + delta });
		} else if (cursor.ch > from.ch) {
			editor.setCursor({ line: lineNum, ch: from.ch + newTriggerWithSpace.length });
		} else {
			editor.setCursor(cursor);
		}
	}
}

function applyMarker(editor: Editor, def: MarkerDef, getSettings: () => PluginSettings): void {
	const lineNum = editor.getCursor().line;
	const text = editor.getLine(lineNum);
	const parts = parseLine(text, new Matcher(getSettings()));
	if (!parts) return;
	const oldChunk = parts.existing ? `${parts.existing.trigger} ` : "";
	rewriteTriggerRegion(editor, lineNum, parts.prefix, oldChunk, `${def.trigger} `);
}

function removeMarker(editor: Editor, getSettings: () => PluginSettings): void {
	const lineNum = editor.getCursor().line;
	const text = editor.getLine(lineNum);
	const parts = parseLine(text, new Matcher(getSettings()));
	if (!parts || !parts.existing) return;
	rewriteTriggerRegion(editor, lineNum, parts.prefix, `${parts.existing.trigger} `, "");
}

const PRIORITY_CYCLE = ["", "!", "!!", "!!!"] as const;

function cyclePriority(editor: Editor, dir: 1 | -1, getSettings: () => PluginSettings): void {
	const settings = getSettings();
	if (!settings.priority.enabled) return;
	const lineNum = editor.getCursor().line;
	const text = editor.getLine(lineNum);
	const parts = parseLine(text, new Matcher(settings));
	if (!parts) return;

	const current =
		parts.existing && parts.existing.def.kind === "priority" ? parts.existing.trigger : "";
	const idx = PRIORITY_CYCLE.indexOf(current as (typeof PRIORITY_CYCLE)[number]);
	const baseIdx = idx === -1 ? 0 : idx;
	const nextIdx = (baseIdx + dir + PRIORITY_CYCLE.length) % PRIORITY_CYCLE.length;
	const nextTrigger = PRIORITY_CYCLE[nextIdx]!;

	const oldChunk = parts.existing ? `${parts.existing.trigger} ` : "";
	const newChunk = nextTrigger === "" ? "" : `${nextTrigger} `;
	rewriteTriggerRegion(editor, lineNum, parts.prefix, oldChunk, newChunk);
}

export function registerCommands(plugin: Plugin, getSettings: () => PluginSettings): void {
	const settings = getSettings();

	if (settings.priority.enabled) {
		for (const def of settings.markers) {
			if (def.kind !== "priority") continue;
			const cmd: Command = {
				id: `apply-${def.id}`,
				name: `Apply ${def.label.toLowerCase()}`,
				editorCallback: (editor: Editor, _view: MarkdownView) => {
					applyMarker(editor, def, getSettings);
				},
			};
			plugin.addCommand(cmd);
		}

		plugin.addCommand({
			id: "cycle-priority",
			name: "Cycle priority",
			editorCallback: (editor) => cyclePriority(editor, 1, getSettings),
		});
	}

	plugin.addCommand({
		id: "remove",
		name: "Remove marker from line",
		editorCallback: (editor) => removeMarker(editor, getSettings),
	});
}
