import { ItemView, IconName, WorkspaceLeaf } from 'obsidian';
import { fitNodeText } from './node-text';

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
	/** ヘッダーの再読み込みボタンから呼ぶハンドラ。描画元（main.ts）が都度差し替える。 */
	private onRefresh: (() => void) | null = null;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	/** ヘッダーの再読み込みボタンの挙動を登録する。 */
	setRefreshHandler(handler: () => void) {
		this.onRefresh = handler;
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
		// 対象フォルダの再走査＋再描画は main.ts 側の renderFolderDiagram に
		// 任せる。ここではボタンを置いてハンドラを呼ぶだけ。metadataCache の
		// 変更監視のような自動検知はあえて実装していない
		this.addAction('refresh-cw', 'Refresh relation diagram', () => {
			this.onRefresh?.();
		});
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
		// 文字の実寸は DOM に載ってからでないと測れない。描画時の見積もりで
		// 収まりきらなかった分を、ここで実測しながら詰め直す
		fitNodeText(this.svg);
	}
}
