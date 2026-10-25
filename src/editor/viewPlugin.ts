import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
} from "@codemirror/view";
import { type EditorState, RangeSetBuilder } from "@codemirror/state";
import type { MarkerDef, PluginSettings } from "../settings/types";
import { Matcher, matchListLine } from "./matcher";
import { type BadgeContent, BadgeWidget } from "./widgets";
import { markerCssVars, markerStyleAttr } from "../theme/cssVars";

interface MarkerDecorations {
	line: Decoration;
	/** Badge styling over the raw trigger text. */
	mark: Decoration;
	/** Replace-widget: drawn priority marks or the marker's icon. */
	widget: Decoration | null;
}

function buildMarkerDecorations(
	def: MarkerDef,
	showTooltips: boolean,
): MarkerDecorations {
	const badgeBg =
		def.badgeBg ??
		(def.kind === "priority" ? "var(--mr-marker-bg)" : undefined);
	const cssVars = markerCssVars(def.color, badgeBg);
	const style = markerStyleAttr(def.color, badgeBg);
	const content: BadgeContent | null =
		def.kind === "priority"
			? { kind: "priority", id: def.id }
			: def.icon
				? { kind: "icon", icon: def.icon }
				: null;

	return {
		line: Decoration.line({
			attributes: { class: `mr-line mr-line-${def.id} mr-colorized`, style },
		}),
		mark: Decoration.mark({
			attributes: { class: `mr-badge mr-badge-${def.id} mr-colorized`, style },
		}),
		widget: content
			? Decoration.replace({
					widget: new BadgeWidget(
						def.id,
						content,
						def.label,
						showTooltips,
						cssVars,
					),
				})
			: null,
	};
}

function cursorLineOf(state: EditorState): number {
	return state.doc.lineAt(state.selection.main.head).number;
}

export function buildMarkrExtension(getSettings: () => PluginSettings) {
	return ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			matcher: Matcher;
			settingsRef: PluginSettings;
			/** Built once per marker per settings object, reused on every line. */
			markerDecorations = new Map<string, MarkerDecorations>();
			cursorLine = -1;

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
					this.markerDecorations.clear();
				}

				// Only the cursor's line decides icon vs raw trigger, so moves
				// within a line leave the decorations as they are.
				const cursorLineChanged =
					u.selectionSet &&
					currentSettings.behavior.hideMarkerWhenCursorAway &&
					cursorLineOf(u.state) !== this.cursorLine;

				if (
					!settingsChanged &&
					!u.docChanged &&
					!u.viewportChanged &&
					!cursorLineChanged
				) {
					return;
				}

				this.decorations = this.build(u.view);
			}

			destroy(): void {}

			private decorationsFor(def: MarkerDef): MarkerDecorations {
				let decorations = this.markerDecorations.get(def.id);
				if (!decorations) {
					decorations = buildMarkerDecorations(
						def,
						this.settingsRef.behavior.showTooltips,
					);
					this.markerDecorations.set(def.id, decorations);
				}
				return decorations;
			}

			private build(view: EditorView): DecorationSet {
				const builder = new RangeSetBuilder<Decoration>();
				const hideOnCursor =
					this.settingsRef.behavior.hideMarkerWhenCursorAway;
				this.cursorLine = cursorLineOf(view.state);

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
							const decorations = this.decorationsFor(match.def);
							const markerFrom = line.from + match.offset;
							const markerTo = markerFrom + match.trigger.length;
							const showWidget =
								!hideOnCursor || line.number !== this.cursorLine;

							builder.add(line.from, line.from, decorations.line);
							builder.add(
								markerFrom,
								markerTo,
								decorations.widget && showWidget
									? decorations.widget
									: decorations.mark,
							);
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
