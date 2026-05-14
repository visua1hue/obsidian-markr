import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { RangeSetBuilder } from "@codemirror/state";
import type { PluginSettings } from "../settings/types";
import { Matcher, matchListLine } from "./matcher";
import { BadgeWidget } from "./widgets";

export function buildMarkrExtension(getSettings: () => PluginSettings) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			matcher: Matcher;
			settingsRef: PluginSettings;

			constructor(view: EditorView) {
				this.settingsRef = getSettings();
				this.matcher = new Matcher(this.settingsRef);
				this.decorations = this.build(view);
			}

			update(u: ViewUpdate): void {
				const currentSettings = getSettings();
				const settingsChanged = currentSettings !== this.settingsRef;
				if (settingsChanged) {
					this.settingsRef = currentSettings;
					this.matcher = new Matcher(currentSettings);
				}
				// Only icon markers depend on cursor position (reveal-on-cursor);
				// priority badges are always-on, so the cursor only matters when
				// hide-on-cursor is enabled.
				const cursorMatters =
					currentSettings.behavior.hideMarkerWhenCursorAway;
				const cursorRelevant = u.selectionSet && cursorMatters;
				if (
					!settingsChanged &&
					!u.docChanged &&
					!u.viewportChanged &&
					!cursorRelevant
				) {
					return;
				}
				this.decorations = this.build(u.view);
			}

			destroy(): void {}

			private build(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const settings = this.settingsRef;

				if (settings.performance.maxFileSizeKB > 0) {
					if (
						view.state.doc.length >
						settings.performance.maxFileSizeKB * 1024
					) {
						return builder.finish();
					}
				}

				const cursorLine = view.state.doc.lineAt(
					view.state.selection.main.head,
				).number;
				const hideOnCursor = settings.behavior.hideMarkerWhenCursorAway;
				const showTooltips = settings.behavior.showTooltips;

				const seenLines = new Set<number>();
				for (const { from, to } of view.visibleRanges) {
					let pos = from;
					while (pos <= to) {
						const line = view.state.doc.lineAt(pos);
						if (seenLines.has(line.number)) {
							pos = line.to + 1;
							continue;
						}
						seenLines.add(line.number);
						const match = matchListLine(line.text, this.matcher);
						if (match) {
							const { def, offset, trigger } = match;
							const markerFrom = line.from + offset;
							const markerTo = markerFrom + trigger.length;

							// Line background — a class on the block-level line element.
							builder.add(
								line.from,
								line.from,
								Decoration.line({
									attributes: {
										class: `mr-line mr-line-${def.id}`,
									},
								}),
							);

							// Trigger badge.
							if (def.icon) {
								// Icon markers replace the trigger with an icon widget when
								// the cursor is away. On cursor-enter they reveal the raw
								// trigger char — but as a Decoration.mark in the same
								// .mr-badge chip, not bare text, so the box width is
								// identical to the widget and the body text doesn't jump.
								const cursorHere = line.number === cursorLine;
								const showIcon = !hideOnCursor || !cursorHere;
								if (showIcon) {
									builder.add(
										markerFrom,
										markerTo,
										Decoration.replace({
											widget: new BadgeWidget(
												def.id,
												def.icon,
												def.label,
												showTooltips,
											),
										}),
									);
								} else {
									builder.add(
										markerFrom,
										markerTo,
										Decoration.mark({
											class: `mr-badge mr-badge-${def.id}`,
										}),
									);
								}
							} else {
								// Priority markers stay editable text — a Decoration.mark
								// doesn't block editing — so the padded chip is always-on.
								// No swap means no body-text jump.
								builder.add(
									markerFrom,
									markerTo,
									Decoration.mark({
										class: `mr-badge mr-badge-${def.id}`,
									}),
								);
							}
						}
						pos = line.to + 1;
					}
				}
				return builder.finish();
			}
		},
		{ decorations: (v) => v.decorations },
	);
}
