import type { MarkerDef, PluginSettings } from "../settings/types";

export interface MatchResult {
	def: MarkerDef;
	offset: number;
	trigger: string;
}

interface TrieNode {
	def?: MarkerDef;
	children: Map<string, TrieNode>;
}

export class Matcher {
	private root: TrieNode = { children: new Map() };
	private firstChars: Set<string> = new Set();

	constructor(settings: PluginSettings) {
		const priorityOn = settings.priority.enabled;
		for (const def of settings.markers) {
			if (def.kind === "priority" && !priorityOn) continue;
			if (def.kind === "custom" && !def.enabled) continue;
			this.insert(def.trigger, def);
			if (def.kind === "custom") {
				for (const a of def.aliases) this.insert(a, def);
			}
		}
	}

	private insert(trigger: string, def: MarkerDef): void {
		let node = this.root;
		this.firstChars.add(trigger[0]!);
		for (const ch of trigger) {
			let next = node.children.get(ch);
			if (!next) {
				next = { children: new Map() };
				node.children.set(ch, next);
			}
			node = next;
		}
		node.def = def;
	}

	firstCharSet(): Set<string> {
		return this.firstChars;
	}

	/** Longest-match-wins lookup at the given offset within the text. */
	matchAt(text: string, offset: number): MatchResult | null {
		let node = this.root;
		let best: MatchResult | null = null;
		let i = offset;
		while (i < text.length) {
			const ch = text[i]!;
			const next = node.children.get(ch);
			if (!next) break;
			node = next;
			i++;
			if (node.def) {
				best = { def: node.def, offset, trigger: text.slice(offset, i) };
			}
		}
		return best;
	}
}

/** Returns marker match for a list-item line, or null. */
export function matchListLine(text: string, matcher: Matcher): (MatchResult & { contentStart: number }) | null {
	// List marker (bullet or numbered), with optional task checkbox:
	// "- ", "* [x] ", "1. ", "2) [ ] ", etc.
	const m = /^(\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)/.exec(text);
	if (!m) return null;
	const contentStart = m[0].length;
	const firstChar = text[contentStart];
	if (!firstChar || !matcher.firstCharSet().has(firstChar)) return null;
	const result = matcher.matchAt(text, contentStart);
	if (!result) return null;
	// Trigger must be followed by whitespace or end of line — otherwise
	// "!!!!" or "!hello" shouldn't match a priority trigger.
	const after = text[result.offset + result.trigger.length];
	if (after !== undefined && !/\s/.test(after)) return null;
	return { ...result, contentStart };
}
