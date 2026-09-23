import {
	ItemView,
	IconName,
	Notice,
	ViewStateResult,
	WorkspaceLeaf,
	getLanguage,
} from 'obsidian';
import { fitNodeText } from './node-text';

export const VIEW_TYPE_RELATION_DIAGRAM = 'bases-relation-diagram-view';

/**
 * まだ図が無いときの案内文。
 *
 * main.ts の nodeOpenLabel() と同じ方式（getLanguage() ベースの単純な
 * 辞書引き）。表示言語ごとの訳で、載っていない言語は
 * `EMPTY_STATE_LABEL_FALLBACK` に落ちる。
 */
const EMPTY_STATE_LABELS: Record<string, string> = {
	ja: 'まだ図がありません。右上の再読み込みボタンを押すか、コマンドを実行してください。',
};
const EMPTY_STATE_LABEL_FALLBACK =
	'No diagram yet. Click the refresh button above, or run the relation diagram command.';

/** 現在の表示言語に合わせた、まだ図が無いときの案内文。 */
function emptyStateLabel(): string {
	// getLanguage() は ISO コードを返し、未設定なら 'en'（要 Obsidian 1.8.7）
	return EMPTY_STATE_LABELS[getLanguage()] ?? EMPTY_STATE_LABEL_FALLBACK;
}

/**
 * このビューがワークスペースの状態として保存・復元する内容。
 * 保存対象は「どのフォルダを表示しているか」だけで、SVG 自体は含まない
 * （再起動後は再読み込みボタンで組み立て直す）。
 */
interface RelationDiagramViewState {
	folderPath?: string;
}

/** setState() には型不明の値が来るので、使う前に形を確認する。 */
function isRelationDiagramViewState(
	value: unknown,
): value is RelationDiagramViewState {
	if (typeof value !== 'object' || value === null) {
		return false;
	}
	const folderPath = (value as { folderPath?: unknown }).folderPath;
	return folderPath === undefined || typeof folderPath === 'string';
}

/**
 * 生成済みの SVG を 1 枚表示するだけのビュー。
 *
 * ダイアグラムの組み立ては呼び出し側（コマンド／再読み込みボタン）が行い、
 * このビューは受け取った要素を貼るだけに徹する。こうすることで描画ロジックと
 * ワークスペース連携を分離でき、main.ts との循環 import も避けられる。
 */
export class RelationDiagramView extends ItemView {
	private svg: SVGSVGElement | null = null;
	/** 表示対象フォルダのパス。setState() 経由で復元される。 */
	private folderPath: string | null = null;

	/**
	 * @param renderFolder 再読み込みボタンから呼ばれる。フォルダパスを渡すと
	 *   呼び出し側（main.ts）がノートを読み直し、このビューの SVG を
	 *   差し替える。leaf は呼び出し側が自身のクロージャで持っているので、
	 *   ここでは渡さない
	 */
	constructor(
		leaf: WorkspaceLeaf,
		private readonly renderFolder: (folderPath: string) => void,
	) {
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

	/**
	 * ワークスペースの状態としてフォルダパスを保存する。
	 *
	 * SVG は保存対象に含めない（再構築コストが低く、frontmatter の変化も
	 * 追いたいので、保存済みの見た目をそのまま復元するより毎回読み直す方が
	 * 適切なため）。
	 */
	getState(): Record<string, unknown> {
		return {
			...super.getState(),
			folderPath: this.folderPath ?? undefined,
		};
	}

	/**
	 * コマンド実行時（setViewState の state 経由）と、Obsidian 再起動後の
	 * ワークスペース復元時の両方でここが呼ばれる。どちらの場合も、以後は
	 * このフォルダパスを再読み込みボタンに使う。
	 */
	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		// vault 直下（ボールト全体）を対象にした場合、folderPath は空文字列
		// になる。truthy チェックだと弾かれてしまうので undefined と区別する
		if (
			isRelationDiagramViewState(state) &&
			state.folderPath !== undefined
		) {
			this.folderPath = state.folderPath;
		}
		await super.setState(state, result);
	}

	protected override async onOpen(): Promise<void> {
		// 対象フォルダの再走査＋再描画は呼び出し側（main.ts）に任せる。
		// ここではボタンを置いて、復元済みのフォルダパスで呼ぶだけ。
		// metadataCache の変更監視のような自動検知はあえて実装していない
		this.addAction('refresh-cw', 'Refresh relation diagram', () => {
			// vault 直下が対象の場合 folderPath は空文字列になりうるので、
			// null との比較にする（falsy チェックだと弾いてしまう）
			if (this.folderPath === null) {
				new Notice(
					'No folder is associated with this diagram yet. Run the relation diagram command first.',
				);
				return;
			}
			this.renderFolder(this.folderPath);
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

		// ワークスペース復元直後は描画対象が無い状態でビューだけが開く。
		// フォルダパス自体は setState() で復元済みなので、再読み込みボタンは
		// この時点でも機能する
		if (!this.svg) {
			contentEl.createEl('p', {
				text: emptyStateLabel(),
			});
			return;
		}

		contentEl.appendChild(this.svg);
		// 文字の実寸は DOM に載ってからでないと測れない。描画時の見積もりで
		// 収まりきらなかった分を、ここで実測しながら詰め直す
		fitNodeText(this.svg);
	}
}
