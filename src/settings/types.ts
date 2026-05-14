export type Trigger = string & { readonly __brand: "Trigger" };

export function makeTrigger(s: string): Trigger {
	if (s.length < 1 || s.length > 3) throw new Error(`Invalid trigger length: "${s}"`);
	if (/\s/.test(s)) throw new Error(`Trigger may not contain whitespace: "${s}"`);
	return s as Trigger;
}

export interface ColorPair {
	readonly bg: string;
	readonly fg: string;
}

export type MarkerColor =
	| { kind: "single"; value: ColorPair }
	| { kind: "split"; light: ColorPair; dark: ColorPair };

export type MarkerDef =
	| {
		readonly kind: "priority";
		readonly id: "p1" | "p2" | "p3";
		readonly trigger: Trigger;
		readonly label: string;
		readonly color: MarkerColor;
		readonly icon: string | null;
	}
	| {
		readonly kind: "custom";
		readonly id: string;
		readonly trigger: Trigger;
		readonly aliases: readonly Trigger[];
		readonly label: string;
		readonly color: MarkerColor;
		readonly icon: string | null;
		readonly enabled: boolean;
	};

export interface PluginSettings {
	readonly version: 6;  // bump on shape change to discard stale saved data
	readonly markers: readonly MarkerDef[];
	readonly priority: { readonly enabled: boolean };
	readonly performance: {
		readonly maxFileSizeKB: number;
		readonly applyInReadingView: boolean;
	};
	readonly behavior: {
		readonly hideMarkerWhenCursorAway: boolean;
		readonly showTooltips: boolean;
		readonly nestedInheritance: boolean;
		readonly enableAutosuggest: boolean;
	};
}

export const DEFAULT_SETTINGS: PluginSettings = {
	version: 6,
	markers: [
		{
			kind: "priority",
			id: "p3",
			trigger: makeTrigger("!!!"),
			label: "Highest priority",
			color: {
				kind: "split",
				light: { bg: "#FFC4CA", fg: "#7A1F25" },
				dark: { bg: "#5A1F25", fg: "#FFC4CA" },
			},
			icon: null,
		},
		{
			kind: "priority",
			id: "p2",
			trigger: makeTrigger("!!"),
			label: "High priority",
			color: {
				kind: "split",
				light: { bg: "#FFC4CA", fg: "#7A1F25" },
				dark: { bg: "#5A1F25", fg: "#FFC4CA" },
			},
			icon: null,
		},
		{
			kind: "priority",
			id: "p1",
			trigger: makeTrigger("!"),
			label: "Important",
			color: {
				kind: "split",
				light: { bg: "#FFC4CA", fg: "#7A1F25" },
				dark: { bg: "#5A1F25", fg: "#FFC4CA" },
			},
			icon: null,
		},
		{
			kind: "custom",
			id: "question",
			trigger: makeTrigger("?"),
			aliases: [],
			label: "Question",
			color: {
				kind: "split",
				light: { bg: "#DBEAFE", fg: "#1E40AF" },
				dark: { bg: "#1E293B", fg: "#93C5FD" },
			},
			icon: "circle-help",
			enabled: true,
		},
		{
			kind: "custom",
			id: "idea",
			trigger: makeTrigger("~"),
			aliases: [],
			label: "Idea",
			color: {
				kind: "split",
				light: { bg: "#FEF3C7", fg: "#92400E" },
				dark: { bg: "#3F2D0F", fg: "#FCD34D" },
			},
			icon: "lightbulb",
			enabled: true,
		},
		{
			kind: "custom",
			id: "person",
			trigger: makeTrigger("@"),
			aliases: [],
			label: "Person",
			color: {
				kind: "split",
				light: { bg: "#D1FAE5", fg: "#065F46" },
				dark: { bg: "#143025", fg: "#6EE7B7" },
			},
			icon: "user",
			enabled: true,
		},
	],
	priority: { enabled: true },
	performance: { maxFileSizeKB: 0, applyInReadingView: true },
	behavior: {
		hideMarkerWhenCursorAway: true,
		showTooltips: true,
		nestedInheritance: false,
		enableAutosuggest: false,
	},
};
