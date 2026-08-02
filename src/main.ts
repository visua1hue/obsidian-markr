import { Plugin } from "obsidian";
import { DEFAULT_SETTINGS, type PluginSettings } from "./settings/types";
import { MarkrSettingTab } from "./settings";
import { buildMarkrExtension } from "./editor/viewPlugin";
import { buildPostProcessor } from "./reading/postProcessor";
import { registerCommands, syncCustomMarkerCommands } from "./commands";

export default class MarkrPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;
	private readonly customCommandIds = new Set<string>();

	async onload(): Promise<void> {
		const loaded = (await this.loadData()) as Partial<PluginSettings> | null;
		this.settings = loaded
			? {
					...DEFAULT_SETTINGS,
					...loaded,
					priority: { ...DEFAULT_SETTINGS.priority, ...(loaded.priority ?? {}) },
					behavior: { ...DEFAULT_SETTINGS.behavior, ...(loaded.behavior ?? {}) },
					performance: { ...DEFAULT_SETTINGS.performance, ...(loaded.performance ?? {}) },
				}
			: DEFAULT_SETTINGS;

		// styles.css gates on body[data-markr] -- every window needs it, not
		// just the main one onload alone would reach.
		document.body.dataset.markr = "";
		this.app.workspace.onLayoutReady(() => {
			this.app.workspace.iterateAllLeaves((leaf) => {
				leaf.view.containerEl.doc.body.dataset.markr = "";
			});
		});
		this.registerEvent(
			this.app.workspace.on("window-open", (_, win) => {
				win.document.body.dataset.markr = "";
			}),
		);

		this.registerEditorExtension(buildMarkrExtension(() => this.settings));
		this.registerMarkdownPostProcessor(
			buildPostProcessor(() => this.settings),
		);
		this.addSettingTab(new MarkrSettingTab(this.app, this));

		registerCommands(this, () => this.settings);
		syncCustomMarkerCommands(this, () => this.settings, this.customCommandIds);
	}

	onunload(): void {
		delete document.body.dataset.markr;
		this.app.workspace.iterateAllLeaves((leaf) => {
			delete leaf.view.containerEl.doc.body.dataset.markr;
		});
	}

	async updateSettings(
		updater: (s: PluginSettings) => PluginSettings,
	): Promise<void> {
		this.settings = updater(this.settings);
		await this.saveData(this.settings);
		this.app.workspace.updateOptions();
		syncCustomMarkerCommands(this, () => this.settings, this.customCommandIds);
	}

	async resetSettings(): Promise<void> {
		await this.updateSettings(() => DEFAULT_SETTINGS);
	}
}
