import type { App } from "obsidian";

// Undocumented App members that core and many plugins use. Every access is
// feature-checked so a future Obsidian change degrades to a no-op.

interface SettingModal {
	open(): void;
	openTabById(id: string): unknown;
	activeTab: { setQuery?(query: string): void } | null;
}

interface HotkeyManager {
	printHotkeyForCommand(commandId: string): string;
}

interface AppInternals {
	setting?: Partial<SettingModal>;
	hotkeyManager?: Partial<HotkeyManager>;
}

function internals(app: App): AppInternals {
	return app as unknown as AppInternals;
}

/** Opens the settings modal on a tab. False when the API is unavailable. */
export function openSettingsTab(app: App, tabId: string): boolean {
	const { setting } = internals(app);
	if (
		typeof setting?.open !== "function" ||
		typeof setting.openTabById !== "function"
	) {
		return false;
	}
	setting.open();
	setting.openTabById(tabId);
	return true;
}

/** Opens the Hotkeys tab with its search set to `query`. */
export function openHotkeysFor(app: App, query: string): boolean {
	if (!openSettingsTab(app, "hotkeys")) return false;
	internals(app).setting?.activeTab?.setQuery?.(query);
	return true;
}

/** The command's hotkey as Obsidian prints it, or "" when none is set. */
export function printHotkey(app: App, commandId: string): string {
	const manager = internals(app).hotkeyManager;
	if (typeof manager?.printHotkeyForCommand !== "function") return "";
	return manager.printHotkeyForCommand(commandId);
}
