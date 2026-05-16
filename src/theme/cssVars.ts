import type { ColorPair, MarkerColor } from "../settings/types";

export type MarkerCssVars = {
	"--mr-marker-bg-light": string;
	"--mr-marker-fg-light": string;
	"--mr-marker-bg-dark": string;
	"--mr-marker-fg-dark": string;
	[key: string]: string;
};

function resolveColor(color: MarkerColor): {
	light: ColorPair;
	dark: ColorPair;
} {
	if (color.kind === "single")
		return { light: color.value, dark: color.value };
	return { light: color.light, dark: color.dark };
}

export function markerCssVars(color: MarkerColor, badgeBg?: string): MarkerCssVars {
	const c = resolveColor(color);
	const vars: MarkerCssVars = {
		"--mr-marker-bg-light": c.light.bg,
		"--mr-marker-fg-light": c.light.fg,
		"--mr-marker-bg-dark": c.dark.bg,
		"--mr-marker-fg-dark": c.dark.fg,
	};
	if (badgeBg !== undefined) vars["--mr-badge-bg"] = badgeBg;
	return vars;
}

export function markerStyleAttr(color: MarkerColor, badgeBg?: string): string {
	const vars = markerCssVars(color, badgeBg);
	let style =
		`--mr-marker-bg-light: ${vars["--mr-marker-bg-light"]}; ` +
		`--mr-marker-fg-light: ${vars["--mr-marker-fg-light"]}; ` +
		`--mr-marker-bg-dark: ${vars["--mr-marker-bg-dark"]}; ` +
		`--mr-marker-fg-dark: ${vars["--mr-marker-fg-dark"]};`;
	if (vars["--mr-badge-bg"] !== undefined) {
		style += ` --mr-badge-bg: ${vars["--mr-badge-bg"]};`;
	}
	return style;
}
