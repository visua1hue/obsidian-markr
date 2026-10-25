import type { MarkerDef } from "../settings/types";

type PriorityId = Extract<MarkerDef, { kind: "priority" }>["id"];

/** Bar width and gap per level, in the 12-unit viewBox. Fewer marks get
 *  wider bars so every level fills the chip evenly. */
const BARS: Record<PriorityId, { count: number; width: number; gap: number }> = {
	p1: { count: 1, width: 3, gap: 0 },
	p2: { count: 2, width: 2.6, gap: 3.2 },
	p3: { count: 3, width: 2.2, gap: 2.4 },
};

/** Draws `!`, `!!` or `!!!` as rounded bars and dots, filled with currentColor. */
export function drawPriorityGlyph(id: PriorityId): SVGSVGElement {
	const { count, width, gap } = BARS[id];
	const start = (12 - (count * width + (count - 1) * gap)) / 2;
	const svg = createSvg("svg", {
		attr: { viewBox: "0 0 12 12", "aria-hidden": "true" },
	});
	for (let i = 0; i < count; i++) {
		const x = start + i * (width + gap);
		svg.createSvg("rect", {
			attr: { x, y: 1, width, height: 7, rx: width / 2 },
		});
		svg.createSvg("circle", {
			attr: { cx: x + width / 2, cy: 10.2, r: width / 2 },
		});
	}
	return svg;
}
