import { ItemView, IconName, WorkspaceLeaf } from 'obsidian';

export const VIEW_TYPE_RELATION_DIAGRAM = 'bases-relation-diagram-view';

/**
 * 生成済みの SVG を 1 枚表示するだけのビュー。
 *
 * ダイアグラムの組み立ては呼び出し側（コマンド）が行い、このビューは
 * 受け取った要素を貼るだけに徹する。こうすることで描画ロジックと
 * ワークスペース連携を分離でき、main.ts との循環 import も避けられる。
 */
export class RelationDiagramView extends ItemView {
	private svg: SVGSVGElement | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_RELATION_DIAGRAM;
	}

	getDisplayText(): string {
		return 'Relation diagram';
	}

	getIcon(): IconName {
		return 'git-fork';
	}

	/** 表示する SVG を差し替える。 */
	setSvg(svg: SVGSVGElement) {
		this.svg = svg;
		this.draw();
	}

	protected override async onOpen(): Promise<void> {
		this.draw();
	}

	protected override async onClose(): Promise<void> {
		this.contentEl.empty();
		this.svg = null;
	}

	private draw() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('relation-diagram-view');

		// ワークスペース復元直後は描画対象が無い状態でビューだけが開く
		if (!this.svg) {
			contentEl.createEl('p', {
				text: 'No diagram yet. Run the relation diagram command to render a folder.',
			});
			return;
		}

		contentEl.appendChild(this.svg);
	}
}
