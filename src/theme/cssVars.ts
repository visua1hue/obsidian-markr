import type { ColorPair, MarkerColor, PluginSettings } from "../settings/types";

function resolveColor(color: MarkerColor): { light: ColorPair; dark: ColorPair } {
	if (color.kind === "single") return { light: color.value, dark: color.value };
	return { light: color.light, dark: color.dark };
}

export function renderVars(settings: PluginSettings): string {
	const lines: string[] = [];
	for (const m of settings.markers) {
		if (m.kind === "priority" && !settings.priority.enabled) continue;
		if (m.kind === "custom" && !m.enabled) continue;
		const c = resolveColor(m.color);
		const sel = `.mr-line-${m.id}, .mr-badge-${m.id}`;
		lines.push(
			`body.theme-light[data-markr] :is(${sel}) { --mr-marker-bg: ${c.light.bg}; --mr-marker-fg: ${c.light.fg}; }`,
		);
		lines.push(
			`body.theme-dark[data-markr] :is(${sel}) { --mr-marker-bg: ${c.dark.bg}; --mr-marker-fg: ${c.dark.fg}; }`,
		);
	}
	return lines.join("\n");
}
