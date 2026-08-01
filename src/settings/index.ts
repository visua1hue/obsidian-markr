import {
	App,
	ExtraButtonComponent,
	PluginSettingTab,
	Setting,
	type SettingDefinitionItem,
	type SettingGroupItem,
} from "obsidian";
import type MarkrPlugin from "../main";
import {
	MarkerEditor,
	customMarkers,
	priorityMarkers,
} from "./editor";
import type { PluginSettings } from "./types";

export class MarkrSettingTab extends PluginSettingTab {
	plugin: MarkrPlugin;
	private readonly editor: MarkerEditor;

	constructor(app: App, plugin: MarkrPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.editor = new MarkerEditor(app, plugin, () =>
			this.redisplayPreservingScroll(),
		);
		// Scoping hook for styles.css — containerEl is generic
		// (.vertical-tab-content) with nothing tab-specific to key off.
		this.containerEl.addClass("mr-settings-tab");
	}

	override hide(): void {
		this.editor.closeCreator();
	}

	// Bridge for declarative `control` definitions: PluginSettings is nested +
	// readonly, so the framework's default `plugin.settings[key]` binding can't
	// read/write it directly. Dot-path keys route through updateSettings instead.
	override getControlValue(key: string): unknown {
		switch (key) {
			case "priority.enabled":
				return this.plugin.settings.priority.enabled;
			case "behavior.hideMarkerWhenCursorAway":
				return this.plugin.settings.behavior.hideMarkerWhenCursorAway;
			case "behavior.showTooltips":
				return this.plugin.settings.behavior.showTooltips;
			case "performance.applyInReadingView":
				return this.plugin.settings.performance.applyInReadingView;
			default:
				return undefined;
		}
	}

	override async setControlValue(key: string, value: unknown): Promise<void> {
		switch (key) {
			case "priority.enabled":
				await this.plugin.updateSettings((settings: PluginSettings) => ({
					...settings,
					priority: { enabled: value as boolean },
				}));
				return;
			case "behavior.hideMarkerWhenCursorAway":
				await this.plugin.updateSettings((settings: PluginSettings) => ({
					...settings,
					behavior: {
						...settings.behavior,
						hideMarkerWhenCursorAway: value as boolean,
					},
				}));
				return;
			case "behavior.showTooltips":
				await this.plugin.updateSettings((settings: PluginSettings) => ({
					...settings,
					behavior: { ...settings.behavior, showTooltips: value as boolean },
				}));
				return;
			case "performance.applyInReadingView":
				await this.plugin.updateSettings((settings: PluginSettings) => ({
					...settings,
					performance: {
						...settings.performance,
						applyInReadingView: value as boolean,
					},
				}));
				return;
		}
	}

	override getSettingDefinitions(): SettingDefinitionItem[] {
		this.editor.reset();
		return [
			{
				type: "group",
				heading: "Defaults",
				items: [
					{
						name: "Enable priority markers",
						desc: "Enables the built-in priority triggers: !, !!, !!!",
						control: { type: "toggle", key: "priority.enabled" },
					},
					{
						name: "Reveal trigger on active line",
						desc: "Show raw trigger instead of icon on the active line.",
						control: {
							type: "toggle",
							key: "behavior.hideMarkerWhenCursorAway",
						},
					},
					{
						name: "Show tooltips on markers",
						desc: "Show the marker label when hovering a rendered marker badge.",
						control: { type: "toggle", key: "behavior.showTooltips" },
					},
					{
						name: "Apply in reading view",
						desc: "May impact performance. Switch views to apply.",
						control: {
							type: "toggle",
							key: "performance.applyInReadingView",
						},
					},
				],
			},
			{
				type: "group",
				heading: "Personalize Markers",
				extraButtons: [
					(button: ExtraButtonComponent) => {
						button.setIcon("plus").setTooltip("Add custom marker");
						button.onClick(() => this.editor.openCreator());
					},
				],
				items: this.markerItems(),
			},
		];
	}

	private markerItems(): SettingGroupItem[] {
		const items: SettingGroupItem[] = [];

		for (const marker of priorityMarkers(this.plugin.settings.markers)) {
			items.push({
				name: marker.label,
				searchable: false,
				visible: () => this.plugin.settings.priority.enabled,
				render: (setting: Setting) => {
					this.editor.configurePrioritySetting(setting, marker);
				},
			});
		}

		for (const marker of customMarkers(this.plugin.settings.markers)) {
			items.push({
				name: marker.label,
				searchable: false,
				render: (setting: Setting) => {
					this.editor.configureCustomSetting(setting, marker);
				},
			});
		}

		if (this.editor.isCreatorOpen) {
			items.push({
				name: "New marker",
				searchable: false,
				render: (setting: Setting) => {
					this.editor.configureCreatorSetting(setting);
				},
			});
		}

		return items;
	}

	private getScrollContainer(): Element | null {
		return this.containerEl.closest(".vertical-tab-content");
	}

	private redisplayPreservingScroll(): void {
		const restoreScrollTop = this.getScrollContainer()?.scrollTop ?? null;
		this.update();
		if (restoreScrollTop !== null) {
			requestAnimationFrame(() => {
				const scroller = this.getScrollContainer();
				if (scroller) scroller.scrollTop = restoreScrollTop;
			});
		}
	}
}
