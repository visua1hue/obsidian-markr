import {
	App,
	ExtraButtonComponent,
	FuzzyMatch,
	FuzzySuggestModal,
	Notice,
	Setting,
	getIcon,
	getIconIds,
	setIcon,
} from "obsidian";

/** Minimal interface for Obsidian's Component.registerDomEvent. */
interface DomEventRegistrar {
	registerDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void;
}
import type MarkrPlugin from "../main";
import { markerCssVars } from "../theme/cssVars";
import {
	makeTrigger,
	type MarkerColor,
	type MarkerDef,
	type PluginSettings,
	type Trigger,
} from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

interface CustomMarkerDraft {
	trigger: string;
	label: string;
	icon: string;
	bg: string;
	fg: string;
	badgeBg?: string;
}

interface CreatorRefs {
	rowEl: HTMLElement;
	previewEl: HTMLElement;
}

// ── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_DRAFT: CustomMarkerDraft = {
	trigger: "",
	label: "",
	icon: "",
	bg: "#E5E7EB",
	fg: "#374151",
};

const PRIORITY_ORDER: Record<
	Extract<MarkerDef, { kind: "priority" }>["id"],
	number
> = { p1: 1, p2: 2, p3: 3 };

// ── Marker list helpers ────────────────────────────────────────────────────

export function priorityMarkers(
	markers: readonly MarkerDef[],
): Extract<MarkerDef, { kind: "priority" }>[] {
	return markers
		.filter(
			(m): m is Extract<MarkerDef, { kind: "priority" }> =>
				m.kind === "priority",
		)
		.sort((a, b) => PRIORITY_ORDER[a.id] - PRIORITY_ORDER[b.id]);
}

export function customMarkers(
	markers: readonly MarkerDef[],
): Extract<MarkerDef, { kind: "custom" }>[] {
	return markers.filter(
		(m): m is Extract<MarkerDef, { kind: "custom" }> => m.kind === "custom",
	);
}

// ── Animation helper ───────────────────────────────────────────────────────

function animateOut(
	el: HTMLElement,
	cls: string,
	onDone: () => void,
	component: DomEventRegistrar,
): void {
	el.addClass(cls);
	let done = false;
	const finish = () => {
		if (done) return;
		done = true;
		onDone();
	};
	component.registerDomEvent(el, "animationend", finish, { once: true });
	setTimeout(finish, 160);
}

// ── Icon picker modal ──────────────────────────────────────────────────────

class IconPickerModal extends FuzzySuggestModal<string> {
	constructor(
		app: App,
		private readonly onSelect: (iconId: string) => void,
	) {
		super(app);
		this.setPlaceholder("Search icons…");
	}

	override getItems(): string[] {
		return ["(none)", ...getIconIds()];
	}

	override getItemText(item: string): string {
		return item === "(none)" ? "No icon" : item;
	}

	override renderSuggestion(
		item: FuzzyMatch<string>,
		el: HTMLElement,
	): void {
		el.addClass("mr-icon-suggestion");
		if (item.item === "(none)") {
			el.createSpan({ text: "No icon", cls: "mr-icon-suggestion-label" });
			return;
		}
		const preview = el.createSpan({ cls: "mr-icon-suggestion-preview" });
		setIcon(preview, item.item);
		el.createSpan({ text: item.item, cls: "mr-icon-suggestion-label" });
	}

	override onChooseItem(
		item: string,
		_evt: MouseEvent | KeyboardEvent,
	): void {
		this.onSelect(item === "(none)" ? "" : item);
	}
}

// ── MarkerEditor ───────────────────────────────────────────────────────────

export class MarkerEditor {
	private creatorOpen = false;
	private creatorDraft: CustomMarkerDraft = { ...DEFAULT_DRAFT };
	private creatorRefs: CreatorRefs | null = null;

	constructor(
		private readonly app: App,
		private readonly plugin: MarkrPlugin,
		private readonly redisplay: () => void,
	) {}

	get isCreatorOpen(): boolean {
		return this.creatorOpen;
	}

	reset(): void {
		this.creatorRefs = null;
	}

	closeCreator(): void {
		this.creatorOpen = false;
		this.creatorDraft = { ...DEFAULT_DRAFT };
		this.creatorRefs = null;
	}

	openCreator(): void {
		if (this.creatorOpen) return;
		this.creatorOpen = true;
		this.redisplay();
	}

	// ── Public: row configurators ──────────────────────────────────────────

	configurePrioritySetting(
		setting: Setting,
		marker: Extract<MarkerDef, { kind: "priority" }>,
	): Setting {
		setting.settingEl.addClass(
			"mr-settings-marker-row",
			"mr-settings-marker-row--priority",
		);

		setting.nameEl.empty();
		setting.descEl.empty();
		setting.nameEl.appendChild(this.buildMarkerBadge(marker));
		setting.settingEl.setCssProps(markerCssVars(marker.color));
		setting.settingEl.addClass("mr-colorized");

		const draft = this.draftFromPriority(marker);
		this.buildRowInputs(setting.controlEl, draft, {
			disabled: true,
			badgeEl: null,
			onBlur: () => {},
		});

		const lockEl = setting.controlEl.createEl("span", {
			cls: "mr-settings-lock-icon",
			attr: { "aria-label": "Built-in marker", "data-tooltip-position": "top" },
		});
		setIcon(lockEl, "lock");

		return setting;
	}

	configureCustomSetting(
		setting: Setting,
		marker: Extract<MarkerDef, { kind: "custom" }>,
	): Setting {
		setting.settingEl.addClass(
			"mr-settings-marker-row",
			"mr-settings-marker-row--custom",
		);

		setting.nameEl.empty();
		setting.descEl.empty();
		const badgeEl = this.buildMarkerBadge(marker);
		setting.nameEl.appendChild(badgeEl);

		const draft = this.draftFromMarker(marker);

		this.buildRowInputs(setting.controlEl, draft, {
			disabled: false,
			badgeEl,
			rowEl: setting.settingEl,
			onBlur: () => { void this.saveOnBlur(marker.id, draft); },
		});

		setting.addExtraButton((button: ExtraButtonComponent) =>
			button
				.setIcon("x")
				.setTooltip("Remove custom marker")
				.onClick(async () => {
					animateOut(
						setting.settingEl,
						"mr-settings-marker-row--removing",
						() => setting.settingEl.remove(),
						this.plugin,
					);
					await this.plugin.updateSettings(
						(settings: PluginSettings) => ({
							...settings,
							markers: settings.markers.filter((e) => e.id !== marker.id),
						}),
					);
				}),
		);

		return setting;
	}

	configureCreatorSetting(setting: Setting): Setting {
		setting.settingEl.addClass(
			"mr-settings-marker-row",
			"mr-settings-marker-row--custom",
			"mr-settings-marker-row--creator",
		);

		setting.nameEl.empty();
		setting.descEl.empty();

		const badgeEl = document.createElement("span");
		badgeEl.className = "mr-badge mr-badge--settings mr-settings-creator-badge";
		badgeEl.setAttribute("aria-hidden", "true");
		setting.nameEl.appendChild(badgeEl);

		this.buildRowInputs(setting.controlEl, this.creatorDraft, {
			disabled: false,
			badgeEl,
			rowEl: setting.settingEl,
			onBlur: () => { void this.maybeCommitCreator(); },
			autofocus: true,
		});

		setting.addExtraButton((button: ExtraButtonComponent) =>
			button
				.setIcon("x")
				.setTooltip("Cancel new marker")
				.onClick(() => this.cancelCreatorInPlace(setting.settingEl)),
		);

		this.creatorRefs = { rowEl: setting.settingEl, previewEl: badgeEl };

		return setting;
	}

	// ── Private: row inputs ────────────────────────────────────────────────

	private buildRowInputs(
		container: HTMLElement,
		draft: CustomMarkerDraft,
		opts: {
			disabled: boolean;
			badgeEl: HTMLElement | null;
			rowEl?: HTMLElement;
			onBlur: () => void;
			autofocus?: boolean;
		},
	): void {
		// Forward-declared so updatePreview closure can reference it.
		let iconBtn!: HTMLButtonElement;

		const colorVars = () =>
			markerCssVars({ kind: "single", value: { bg: draft.bg, fg: draft.fg } }, draft.badgeBg);

		const updatePreview = () => {
			// Badge
			const el = opts.badgeEl;
			if (el) {
				const hasContent = draft.trigger.trim().length > 0 || draft.icon.length > 0;
				if (!hasContent) {
					el.empty();
					el.addClass("mr-settings-creator-badge");
					el.removeClass("mr-colorized", "mr-badge-icon");
					el.removeAttribute("style");
				} else {
					el.removeClass("mr-settings-creator-badge");
					el.addClass("mr-colorized");
					el.setCssProps(colorVars());
					this.applyBadgeContent(el, draft.icon, draft.trigger || "·");
				}
			}

			// Icon button — show icon in the marker's own color when set
			if (!opts.disabled) {
				if (draft.icon) {
					iconBtn.setCssProps(colorVars());
					iconBtn.addClass("mr-colorized");
				} else {
					iconBtn.removeAttribute("style");
					iconBtn.removeClass("mr-colorized");
				}
			}

			// Row background tint
			if (opts.rowEl) {
				const hasDraft = opts.badgeEl
					? draft.trigger.trim().length > 0 || draft.icon.length > 0
					: true;
				if (hasDraft) {
					opts.rowEl.setCssProps(colorVars());
					opts.rowEl.addClass("mr-colorized");
				} else {
					opts.rowEl.removeClass("mr-colorized");
					opts.rowEl.removeAttribute("style");
				}
			}
		};

		const triggerInput = container.createEl("input", {
			cls: "mr-settings-input mr-settings-input--trigger",
			attr: { type: "text", placeholder: "!", "aria-label": "Trigger" },
		});
		triggerInput.value = draft.trigger;
		if (opts.disabled) {
			triggerInput.disabled = true;
		} else {
			this.plugin.registerDomEvent(triggerInput, "input", () => {
				draft.trigger = triggerInput.value;
				updatePreview();
			});
			this.plugin.registerDomEvent(triggerInput, "blur", opts.onBlur);
		}

		const labelInput = container.createEl("input", {
			cls: "mr-settings-input mr-settings-input--label",
			attr: { type: "text", placeholder: "Label", "aria-label": "Label" },
		});
		labelInput.value = draft.label;
		if (opts.disabled) {
			labelInput.disabled = true;
		} else {
			this.plugin.registerDomEvent(labelInput, "input", () => {
				draft.label = labelInput.value;
			});
			this.plugin.registerDomEvent(labelInput, "blur", opts.onBlur);
		}

		if (opts.autofocus) {
			requestAnimationFrame(() => triggerInput.focus());
		}

		iconBtn = container.createEl("button", {
			cls: "mr-settings-icon-btn",
			attr: { type: "button", "aria-label": "Select icon" },
		});
		if (opts.disabled) {
			iconBtn.disabled = true;
		} else {
			this.plugin.registerDomEvent(iconBtn, "click", () => {
				new IconPickerModal(this.app, (icon) => {
					draft.icon = icon;
					this.updateIconButton(iconBtn, icon);
					updatePreview();
					opts.onBlur();
				}).open();
			});
		}
		this.updateIconButton(iconBtn, draft.icon);

		let badgeBgInput!: HTMLInputElement;

		for (const { key, tooltip } of [
			{ key: "bg" as const, tooltip: "Background color" },
			{ key: "fg" as const, tooltip: "Marker color" },
		]) {
			const wrap = container.createDiv({
				cls: "mr-settings-color-wrap",
				attr: { "aria-label": tooltip, "data-tooltip-position": "top" },
			});
			const input = wrap.createEl("input", {
				cls: "mr-settings-input--color",
				attr: { type: "color" },
			});
			input.value = draft[key];
			if (opts.disabled) {
				input.disabled = true;
				wrap.addClass("is-disabled");
			} else {
				this.plugin.registerDomEvent(input, "input", () => {
					draft[key] = input.value;
					updatePreview();
				});
				this.plugin.registerDomEvent(input, "blur", opts.onBlur);
			}
		}

		const badgeBgWrap = container.createDiv({
			cls: "mr-settings-color-wrap",
			attr: { "aria-label": "Badge color", "data-tooltip-position": "top" },
		});
		badgeBgInput = badgeBgWrap.createEl("input", {
			cls: "mr-settings-input--color",
			attr: { type: "color" },
		});
		if (draft.badgeBg !== undefined) {
			badgeBgInput.value = draft.badgeBg;
		} else {
			badgeBgInput.value = "#ffffff";
			badgeBgWrap.addClass("mr-settings-color-wrap--unset");
		}
		if (opts.disabled) {
			badgeBgInput.disabled = true;
			badgeBgWrap.addClass("is-disabled");
		} else {
			this.plugin.registerDomEvent(badgeBgInput, "input", () => {
				draft.badgeBg = badgeBgInput.value;
				badgeBgWrap.removeClass("mr-settings-color-wrap--unset");
				updatePreview();
			});
			this.plugin.registerDomEvent(badgeBgInput, "blur", opts.onBlur);
		}

		// Initialise preview state on first render
		updatePreview();
	}

	private updateIconButton(btn: HTMLElement, iconId: string): void {
		btn.empty();
		if (iconId) {
			setIcon(btn, iconId);
		}
	}

	// ── Private: badge ─────────────────────────────────────────────────────

	private buildMarkerBadge(marker: MarkerDef): HTMLElement {
		const badge = document.createElement("span");
		badge.className = `mr-badge mr-badge--settings mr-colorized mr-badge-${marker.id}`;
		const badgeBg = marker.badgeBg ?? (marker.kind === "priority" ? "var(--mr-marker-bg)" : undefined);
		badge.setCssProps(markerCssVars(marker.color, badgeBg));
		badge.setAttribute("aria-hidden", "true");
		this.applyBadgeContent(badge, marker.icon ?? "", marker.trigger);
		return badge;
	}

	private applyBadgeContent(
		badge: HTMLElement,
		icon: string,
		fallbackText: string,
	): void {
		badge.empty();
		if (icon) {
			const iconEl = getIcon(icon);
			if (iconEl) {
				badge.addClass("mr-badge-icon");
				badge.appendChild(iconEl);
				return;
			}
		}
		badge.removeClass("mr-badge-icon");
		badge.textContent = fallbackText;
	}

	// ── Private: creator ───────────────────────────────────────────────────

	private cancelCreatorInPlace(rowEl: HTMLElement): void {
		this.creatorRefs = null;
		this.creatorOpen = false;
		this.creatorDraft = { ...DEFAULT_DRAFT };
		animateOut(rowEl, "mr-settings-marker-row--removing", () => rowEl.remove(), this.plugin);
	}

	// ── Private: data operations ───────────────────────────────────────────

	private async saveOnBlur(
		markerId: string,
		draft: CustomMarkerDraft,
	): Promise<void> {
		if (!draft.trigger.trim() || !draft.label.trim()) return;

		const marker = customMarkers(this.plugin.settings.markers).find(
			(m) => m.id === markerId,
		);
		if (!marker) return;
		if (this.isDraftEqual(draft, this.draftFromMarker(marker))) return;

		const parsed = this.parseDraft(draft);
		if (!parsed) return;

		if (this.hasTriggerConflict(parsed.trigger, markerId)) {
			new Notice(`Trigger "${parsed.trigger}" is already in use.`);
			return;
		}

		await this.plugin.updateSettings((settings: PluginSettings) => ({
			...settings,
			markers: settings.markers.map((e) =>
				e.kind === "custom" && e.id === markerId
					? {
							...e,
							trigger: parsed.trigger,
							label: parsed.label,
							icon: parsed.icon,
							color: this.colorFromDraft(draft, marker.color),
							badgeBg: draft.badgeBg,
						}
					: e,
			),
		}));
	}

	private async maybeCommitCreator(): Promise<void> {
		if (!this.creatorDraft.trigger.trim() || !this.creatorDraft.label.trim()) return;

		const parsed = this.parseDraft(this.creatorDraft);
		if (!parsed) return;

		if (this.hasTriggerConflict(parsed.trigger)) {
			new Notice(`Trigger "${parsed.trigger}" is already in use.`);
			return;
		}

		const marker: Extract<MarkerDef, { kind: "custom" }> = {
			kind: "custom",
			id: this.nextCustomId(),
			trigger: parsed.trigger,
			label: parsed.label,
			color: this.colorFromDraft(this.creatorDraft),
			icon: parsed.icon,
			badgeBg: this.creatorDraft.badgeBg,
		};

		await this.plugin.updateSettings((settings: PluginSettings) => ({
			...settings,
			markers: [...settings.markers, marker],
		}));

		this.creatorOpen = false;
		this.creatorDraft = { ...DEFAULT_DRAFT };
		this.creatorRefs = null;
		this.redisplay();
	}

	// ── Private: draft utilities ───────────────────────────────────────────

	private parseDraft(
		draft: CustomMarkerDraft,
	): { trigger: Trigger; label: string; icon: string | null } | null {
		const triggerText = draft.trigger.trim();
		const label = draft.label.trim();
		const icon = draft.icon.trim();

		let trigger: Trigger;
		try {
			trigger = makeTrigger(triggerText);
		} catch (e) {
			new Notice(e instanceof Error ? e.message : "Invalid trigger.");
			return null;
		}

		if (!label) {
			new Notice("Label is required.");
			return null;
		}

		return { trigger, label, icon: icon.length > 0 ? icon : null };
	}

	private draftFromMarker(
		marker: Extract<MarkerDef, { kind: "custom" }>,
	): CustomMarkerDraft {
		const colors =
			marker.color.kind === "single" ? marker.color.value : marker.color.light;
		return {
			trigger: marker.trigger,
			label: marker.label,
			icon: marker.icon ?? "",
			bg: colors.bg,
			fg: colors.fg,
			badgeBg: marker.badgeBg,
		};
	}

	private draftFromPriority(
		marker: Extract<MarkerDef, { kind: "priority" }>,
	): CustomMarkerDraft {
		const colors =
			marker.color.kind === "single" ? marker.color.value : marker.color.light;
		return {
			trigger: marker.trigger,
			label: marker.label,
			icon: "",
			bg: colors.bg,
			fg: colors.fg,
			badgeBg: marker.badgeBg ?? colors.bg,
		};
	}

	private colorFromDraft(
		draft: CustomMarkerDraft,
		original?: MarkerColor,
	): MarkerColor {
		if (original?.kind === "split") {
			return {
				kind: "split",
				light: { bg: draft.bg, fg: draft.fg },
				dark: original.dark,
			};
		}
		return { kind: "single", value: { bg: draft.bg, fg: draft.fg } };
	}

	private isDraftEqual(a: CustomMarkerDraft, b: CustomMarkerDraft): boolean {
		return (
			a.trigger === b.trigger &&
			a.label === b.label &&
			a.icon === b.icon &&
			a.bg === b.bg &&
			a.fg === b.fg &&
			a.badgeBg === b.badgeBg
		);
	}

	private hasTriggerConflict(trigger: Trigger, ignoreId?: string): boolean {
		for (const marker of this.plugin.settings.markers) {
			if (ignoreId && marker.id === ignoreId) continue;
			if (marker.kind === "priority" && !this.plugin.settings.priority.enabled)
				continue;
			if (marker.trigger === trigger) return true;
		}
		return false;
	}

	private nextCustomId(): string {
		return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}
}
