export type Trigger = string & { readonly __brand: "Trigger" };

export function makeTrigger(s: string): Trigger {
	if (s.length < 1 || s.length > 3)
		throw new Error(`Invalid trigger length: "${s}"`);
	if (/\s/.test(s))
		throw new Error(`Trigger may not contain whitespace: "${s}"`);
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
			readonly badgeBg?: string;
	  }
	| {
			readonly kind: "custom";
			readonly id: string;
			readonly trigger: Trigger;
			readonly label: string;
			readonly color: MarkerColor;
			readonly icon: string | null;
			readonly badgeBg?: string;
	  };

export interface PluginSettings {
	readonly markers: readonly MarkerDef[];
	readonly priority: { readonly enabled: boolean };
	readonly performance: {
		readonly applyInReadingView: boolean;
	};
	readonly behavior: {
		readonly hideMarkerWhenCursorAway: boolean;
		readonly showTooltips: boolean;
	};
}

export const DEFAULT_SETTINGS: PluginSettings = {
	markers: [
		{
			kind: "priority",
			id: "p3",
			trigger: makeTrigger("!!!"),
			label: "Critical",
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
			label: "Urgent",
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
	],
	priority: { enabled: true },
	performance: { applyInReadingView: true },
	behavior: {
		hideMarkerWhenCursorAway: true,
		showTooltips: false,
	},
};
