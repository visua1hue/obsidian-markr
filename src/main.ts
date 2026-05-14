import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type PluginSettings } from "./settings/types";
import { MarkrSettingTab } from "./settings/tab";
import { buildMarkrExtension } from "./editor/viewPlugin";
import { buildPostProcessor } from "./reading/postProcessor";
import { renderVars } from "./theme/cssVars";
import { registerCommands } from "./commands";

export default class MarkrPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private themeEl: HTMLStyleElement | null = null;

	async onload(): Promise<void> {
		const loaded = (await this.loadData()) as { version?: unknown } | null;
		this.settings =
			loaded && loaded.version === DEFAULT_SETTINGS.version
				? (loaded as PluginSettings)
				: DEFAULT_SETTINGS;

		document.body.dataset.markr = "";
		this.themeEl = document.head.createEl("style", { attr: { id: "mr-vars" } });
		this.refreshTheme();

		this.registerEditorExtension(buildMarkrExtension(() => this.settings));
		this.registerMarkdownPostProcessor(buildPostProcessor(() => this.settings));
		this.addSettingTab(new MarkrSettingTab(this.app, this));

		registerCommands(this, () => this.settings);
	}

	onunload(): void {
		this.themeEl?.remove();
		this.themeEl = null;
		delete document.body.dataset.markr;
	}

	async updateSettings(updater: (s: PluginSettings) => PluginSettings): Promise<void> {
		this.settings = updater(this.settings);
		await this.saveData(this.settings);
		this.refreshTheme();
		this.app.workspace.updateOptions();
	}

	async resetSettings(): Promise<void> {
		await this.updateSettings(() => DEFAULT_SETTINGS);
	}

	private refreshTheme(): void {
		if (this.themeEl) this.themeEl.textContent = renderVars(this.settings);
	}
}
