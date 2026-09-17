import { App, PluginSettingTab, Setting } from 'obsidian';
import BasesRelationDiagramPlugin from './main';

/** 手動配置されたノードの座標。 */
export interface NodePosition {
	x: number;
	y: number;
}

/**
 * ノート名 → 座標。
 *
 * ノート名（basename）が一意なのは 1 フォルダの中だけなので、
 * 別フォルダの同名ノートと混ざらないようフォルダ単位で名前空間を分ける。
 */
export type FolderPositions = Record<string, NodePosition>;

/** フォルダパス → そのフォルダ内の座標表。 */
export type SavedPositions = Record<string, FolderPositions>;

export interface BasesRelationDiagramSettings {
	mySetting: string;
	nodePositions: SavedPositions;
}

export const DEFAULT_SETTINGS: BasesRelationDiagramSettings = {
	mySetting: 'default',
	nodePositions: {},
};

export class BasesRelationDiagramSettingTab extends PluginSettingTab {
	plugin: BasesRelationDiagramPlugin;

	constructor(app: App, plugin: BasesRelationDiagramPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Settings #1')
			.setDesc("It's a secret")
			.addText((text) =>
				text
					.setPlaceholder('Enter your secret')
					.setValue(this.plugin.settings.mySetting)
					.onChange(async (value) => {
						this.plugin.settings.mySetting = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
