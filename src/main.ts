import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type PluginSettings } from "./settings/types";
import { MarkrSettingTab } from "./settings/tab";
import { buildMarkrExtension } from "./editor/viewPlugin";
import { buildPostProcessor } from "./reading/postProcessor";
import { registerCommands } from "./commands";

export default class MarkrPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	async onload(): Promise<void> {
		const loaded = (await this.loadData()) as { version?: unknown } | null;
		this.settings =
			loaded && loaded.version === DEFAULT_SETTINGS.version
				? (loaded as PluginSettings)
				: DEFAULT_SETTINGS;

		document.body.dataset.markr = "";

		this.registerEditorExtension(buildMarkrExtension(() => this.settings));
		this.registerMarkdownPostProcessor(
			buildPostProcessor(() => this.settings),
		);
		this.addSettingTab(new MarkrSettingTab(this.app, this));

		registerCommands(this, () => this.settings);
	}

	onunload(): void {
		delete document.body.dataset.markr;
	}

	async updateSettings(
		updater: (s: PluginSettings) => PluginSettings,
	): Promise<void> {
		this.settings = updater(this.settings);
		await this.saveData(this.settings);
		this.app.workspace.updateOptions();
	}

	async resetSettings(): Promise<void> {
		await this.updateSettings(() => DEFAULT_SETTINGS);
	}
}
