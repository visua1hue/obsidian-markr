import {
	App,
	ExtraButtonComponent,
	PluginSettingTab,
	Setting,
	SettingGroup,
	ToggleComponent,
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
	private pendingScrollTop: number | null = null;

	constructor(app: App, plugin: MarkrPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.editor = new MarkerEditor(app, plugin, () =>
			this.redisplayPreservingScroll(),
		);
	}

	display(): void {
		const { containerEl } = this;
		const restoreScrollTop = this.pendingScrollTop;
		this.pendingScrollTop = null;
		this.editor.reset();

		containerEl.empty();

		this.renderDefaultSettings(containerEl);
		this.renderMarkerConfiguration(containerEl);

		if (restoreScrollTop !== null) {
			requestAnimationFrame(() => {
				const scroller = this.getScrollContainer();
				if (scroller) scroller.scrollTop = restoreScrollTop;
			});
		}
	}

	private renderDefaultSettings(containerEl: HTMLElement): void {
		const group = new SettingGroup(containerEl);
		group.setHeading("Defaults");

		group.addSetting((setting: Setting) => {
			setting
				.setName("Enable priority markers")
				.setDesc("Enables the built-in priority triggers: !, !!, !!!")
				.addToggle((toggle: ToggleComponent) =>
					toggle
						.setValue(this.plugin.settings.priority.enabled)
						.onChange((value: boolean) => {
							void this.plugin.updateSettings(
								(settings: PluginSettings) => ({
									...settings,
									priority: { enabled: value },
								}),
							);
						}),
				);
		});

		group.addSetting((setting: Setting) => {
			setting
				.setName("Reveal trigger on active line")
				.setDesc("Show raw trigger instead of icon on the active line.")
				.addToggle((toggle: ToggleComponent) =>
					toggle
						.setValue(
							this.plugin.settings.behavior.hideMarkerWhenCursorAway,
						)
						.onChange((value: boolean) => {
							void this.plugin.updateSettings(
								(settings: PluginSettings) => ({
									...settings,
									behavior: {
										...settings.behavior,
										hideMarkerWhenCursorAway: value,
									},
								}),
							);
						}),
				);
		});

		group.addSetting((setting: Setting) => {
			setting
				.setName("Show tooltips on markers")
				.setDesc(
					"Show the marker label when hovering a rendered marker badge.",
				)
				.addToggle((toggle: ToggleComponent) =>
					toggle
						.setValue(this.plugin.settings.behavior.showTooltips)
						.onChange((value: boolean) => {
							void this.plugin.updateSettings(
								(settings: PluginSettings) => ({
									...settings,
									behavior: {
										...settings.behavior,
										showTooltips: value,
									},
								}),
							);
						}),
				);
		});

		group.addSetting((setting: Setting) => {
			setting
				.setName("Apply in reading view")
				.setDesc(
					"May impact performance. Switch views to apply.",
				)
				.addToggle((toggle: ToggleComponent) =>
					toggle
						.setValue(
							this.plugin.settings.performance.applyInReadingView,
						)
						.onChange((value: boolean) => {
							void this.plugin.updateSettings(
								(settings: PluginSettings) => ({
									...settings,
									performance: {
										...settings.performance,
										applyInReadingView: value,
									},
								}),
							);
						}),
				);
		});
	}

	private renderMarkerConfiguration(containerEl: HTMLElement): void {
		const group = new SettingGroup(containerEl);
		group.setHeading("Personalize Markers");

		group.addExtraButton((button: ExtraButtonComponent) => {
			button.setIcon("plus").setTooltip("Add custom marker");
			button.onClick(() => this.editor.openCreator());
		});

		for (const marker of priorityMarkers(this.plugin.settings.markers)) {
			group.addSetting((setting: Setting) => {
				this.editor.configurePrioritySetting(setting, marker);
			});
		}

		for (const marker of customMarkers(this.plugin.settings.markers)) {
			group.addSetting((setting: Setting) => {
				this.editor.configureCustomSetting(setting, marker);
			});
		}

		if (this.editor.isCreatorOpen) {
			group.addSetting((setting: Setting) => {
				this.editor.configureCreatorSetting(setting);
			});
		}
	}

	private getScrollContainer(): Element | null {
		return this.containerEl.closest(".vertical-tab-content");
	}

	private redisplayPreservingScroll(): void {
		this.pendingScrollTop = this.getScrollContainer()?.scrollTop ?? null;
		this.display();
	}
}
