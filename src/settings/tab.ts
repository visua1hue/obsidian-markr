import { App, PluginSettingTab, Setting } from "obsidian";
import type MarkrPlugin from "../main";

export class MarkrSettingTab extends PluginSettingTab {
	plugin: MarkrPlugin;

	constructor(app: App, plugin: MarkrPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl).setName("Debug").setHeading();

		new Setting(containerEl)
			.setName("Enable priority markers")
			.setDesc("Use priority markers (!, !!, !!!) at the start of list items.")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.priority.enabled).onChange(async (v) => {
					await this.plugin.updateSettings((s) => ({ ...s, priority: { enabled: v } }));
				}),
			);

		new Setting(containerEl)
			.setName("Reveal icon markers when editing the line")
			.setDesc("Show the editable ~/@ text instead of the icon while the cursor is on the line. Priority markers stay editable in place.")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.behavior.hideMarkerWhenCursorAway)
					.onChange(async (v) => {
						await this.plugin.updateSettings((s) => ({
							...s,
							behavior: { ...s.behavior, hideMarkerWhenCursorAway: v },
						}));
					}),
			);

		new Setting(containerEl)
			.setName("Show tooltips on markers")
			.addToggle((t) =>
				t.setValue(this.plugin.settings.behavior.showTooltips).onChange(async (v) => {
					await this.plugin.updateSettings((s) => ({
						...s,
						behavior: { ...s.behavior, showTooltips: v },
					}));
				}),
			);

		new Setting(containerEl)
			.setName("Reset settings to defaults")
			.addButton((b) =>
				b
					.setButtonText("Reset")
					.setWarning()
					.onClick(async () => {
						await this.plugin.resetSettings();
						this.display();
					}),
			);

		new Setting(containerEl).setName("Markers").setHeading();

		for (const m of this.plugin.settings.markers) {
			const triggerLabel = m.kind === "priority" ? `${m.trigger} (priority)` : m.trigger;
			const desc = m.icon ? `Icon: ${m.icon}` : "No icon";
			new Setting(containerEl).setName(`${triggerLabel} — ${m.label}`).setDesc(desc);
		}

		new Setting(containerEl).setName("Performance").setHeading();

		new Setting(containerEl)
			.setName("Apply in reading view")
			.addToggle((t) =>
				t
					.setValue(this.plugin.settings.performance.applyInReadingView)
					.onChange(async (v) => {
						await this.plugin.updateSettings((s) => ({
							...s,
							performance: { ...s.performance, applyInReadingView: v },
						}));
					}),
			);

		new Setting(containerEl)
			.setName("Max file size in kilobytes")
			.setDesc("Disable rendering above this size. 0 = unlimited.")
			.addText((t) =>
				t
					.setValue(String(this.plugin.settings.performance.maxFileSizeKB))
					.onChange(async (v) => {
						const n = Number(v);
						if (!Number.isFinite(n) || n < 0) return;
						await this.plugin.updateSettings((s) => ({
							...s,
							performance: { ...s.performance, maxFileSizeKB: n },
						}));
					}),
			);

	}
}
