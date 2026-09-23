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
	nodePositions: SavedPositions;
}

export const DEFAULT_SETTINGS: BasesRelationDiagramSettings = {
	nodePositions: {},
};
