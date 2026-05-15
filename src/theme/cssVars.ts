import type { ColorPair, MarkerColor } from "../settings/types";

export type MarkerCssVars = {
	"--mr-marker-bg-light": string;
	"--mr-marker-fg-light": string;
	"--mr-marker-bg-dark": string;
	"--mr-marker-fg-dark": string;
};

function resolveColor(color: MarkerColor): {
	light: ColorPair;
	dark: ColorPair;
} {
	if (color.kind === "single")
		return { light: color.value, dark: color.value };
	return { light: color.light, dark: color.dark };
}

export function markerCssVars(color: MarkerColor): MarkerCssVars {
	const c = resolveColor(color);
	return {
		"--mr-marker-bg-light": c.light.bg,
		"--mr-marker-fg-light": c.light.fg,
		"--mr-marker-bg-dark": c.dark.bg,
		"--mr-marker-fg-dark": c.dark.fg,
	};
}

export function markerStyleAttr(color: MarkerColor): string {
	const vars = markerCssVars(color);
	return (
		`--mr-marker-bg-light: ${vars["--mr-marker-bg-light"]}; ` +
		`--mr-marker-fg-light: ${vars["--mr-marker-fg-light"]}; ` +
		`--mr-marker-bg-dark: ${vars["--mr-marker-bg-dark"]}; ` +
		`--mr-marker-fg-dark: ${vars["--mr-marker-fg-dark"]};`
	);
}
