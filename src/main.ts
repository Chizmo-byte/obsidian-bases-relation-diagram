import {
	Notice,
	Plugin,
	TFile,
	TFolder,
	getLanguage,
	getLinkpath,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	BasesRelationDiagramSettings,
	BasesRelationDiagramSettingTab,
	FolderPositions,
} from './settings';
import { RelationDiagramView, VIEW_TYPE_RELATION_DIAGRAM } from './view';
import { setFittableText } from './node-text';

/** frontmatter のプロパティ 1 件。値は表示用に文字列化済み。 */
export interface NoteProperty {
	name: string;
	value: string;
}

/** 箱の背景色として選べるキーワード。 */
const NODE_COLORS = ['red', 'blue', 'green', 'yellow', 'purple'] as const;
export type NodeColor = (typeof NODE_COLORS)[number];

/** 値が NODE_COLORS のいずれかに一致するかを調べる型ガード。 */
function isNodeColor(value: unknown): value is NodeColor {
	return (
		typeof value === 'string' &&
		(NODE_COLORS as readonly string[]).includes(value)
	);
}

/** 1 ノート分の Relation 抽出結果。 */
export interface NoteRelations {
	/** ノートのファイル名（拡張子なし）。 */
	id: string;
	/** frontmatter から参照している他ノートのファイル名（拡張子なし）。 */
	relations: string[];
	/** Relation 以外の frontmatter プロパティ。 */
	properties: NoteProperty[];
	/** 箱の背景色。未指定または既定 5 色以外の値なら undefined（既定色のまま）。 */
	color?: NodeColor;
}

/**
 * 箱に表示しない frontmatter プロパティ。
 *
 * tags / cssclasses / aliases は Obsidian が特別扱いするメタ情報で、
 * ノート同士の関係を読み解く上では雑音になる。position は Obsidian が
 * キャッシュに載せる内部情報で、ユーザーが書いたプロパティではない。
 * color は箱の背景色を決める専用プロパティとして別枠で扱うため、
 * 他のプロパティと並べては表示しない。
 */
const HIDDEN_PROPERTIES = new Set([
	'tags',
	'cssclasses',
	'aliases',
	'position',
	'color',
]);

/** frontmatter の値を 1 行で表示できる文字列にする。 */
function formatPropertyValue(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (Array.isArray(value)) {
		return value.map(formatPropertyValue).join(', ');
	}
	if (
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return String(value);
	}
	// ネストしたオブジェクトなど、YAML から来るその他の値。
	// String() だと "[object Object]" になってしまうので JSON で出す
	return JSON.stringify(value) ?? '';
}

/** 描画用の 1 ノード。座標は SVG 座標系（px）。 */
export interface DiagramNode {
	/** ノートのファイル名（拡張子なし）。エッジの接続キーになる。 */
	id: string;
	/** 画面に表示する文字列。今は id と同値だが、後で変更できるよう分けている。 */
	label: string;
	/** ノード矩形の左上 X 座標。レイアウト関数が割り当てる。 */
	x: number;
	/** ノード矩形の左上 Y 座標。レイアウト関数が割り当てる。 */
	y: number;
	/** 参照先ノートの id 配列。 */
	relations: string[];
	/** 箱の中に表示する frontmatter プロパティ。箱の高さもこの件数で決まる。 */
	properties: NoteProperty[];
	/** 箱の背景色。未指定なら既定色のまま描画する。 */
	color?: NodeColor;
}

/** ノード矩形の寸法。レイアウトと描画の両方が参照する。 */
const NODE_WIDTH = 120;
/** ラベルを置く見出し部分の高さ。 */
const NODE_HEADER_HEIGHT = 40;
/** テキスト 1 行分の高さ。 */
const NODE_ROW_HEIGHT = 18;
/**
 * プロパティ 1 件が使う行数。
 *
 * 1 行目にプロパティ名、2 行目に値を置く 2 行形式。値は箱の幅に対して
 * 長くなりがちなので、名前と分けて 1 行まるごと使わせている。
 */
const NODE_PROPERTY_LINES = 2;
/** 値の行の字下げ。名前より内側に置いて、どちらが名前か一目で分かるようにする。 */
const NODE_VALUE_INDENT = 8;
/**
 * 箱の左右の内余白。
 *
 * 角丸（rx=6）の内側に文字を収めるため、半径より大きめに取っている。
 * `NODE_TEXT_WIDTH`（＝文字を描ける幅）もここから引くので、値を変えると
 * 余白と表示文字数の両方が同時に追従する。
 */
const NODE_PADDING_X = 10;
/**
 * 箱の最下部に置く「ページを開く」行の文言。
 *
 * 表示言語ごとの訳。載っていない言語は `NODE_OPEN_LABEL_FALLBACK` に落ちる。
 * 今のところ多言語化はこの 1 文字列だけなので、翻訳ファイルは用意せず
 * ここに直接持たせている。
 */
const NODE_OPEN_LABELS: Record<string, string> = {
	ja: 'ページを開く',
};
const NODE_OPEN_LABEL_FALLBACK = 'Open note';

/** 現在の表示言語に合わせた「ページを開く」の文言。 */
function nodeOpenLabel(): string {
	// getLanguage() は ISO コードを返し、未設定なら 'en'（要 Obsidian 1.8.7）
	return NODE_OPEN_LABELS[getLanguage()] ?? NODE_OPEN_LABEL_FALLBACK;
}
/**
 * 箱の中のフォントサイズ（px）。
 *
 * styles.css の `.relation-diagram-node-label` /
 * `.relation-diagram-node-property` に効く `--font-ui-small` /
 * `--font-ui-smaller` の既定値と揃えている。CSS 変数は実行時にしか
 * 解決できないので、文字数の逆算用にここへ写しを置く。
 * CSS 側を変えたらここも合わせる。
 */
const NODE_LABEL_FONT_SIZE = 13;
const NODE_PROPERTY_FONT_SIZE = 12;

/** 箱の中で文字を描ける幅。左右の内余白を除いた分。 */
const NODE_TEXT_WIDTH = NODE_WIDTH - NODE_PADDING_X * 2;

/**
 * プロパティ数に応じたノード矩形の高さ。
 *
 * 高さが可変になったため、矩形の描画・レイアウトの行送り・線の接続位置・
 * ドラッグのクランプがすべてこの関数を経由する。
 * 最下部の「ページを開く」行は常にあるので、行高 1 つ分を足しておく。
 */
export function nodeHeight(node: DiagramNode): number {
	return (
		NODE_HEADER_HEIGHT +
		node.properties.length * NODE_PROPERTY_LINES * NODE_ROW_HEIGHT +
		NODE_ROW_HEIGHT
	);
}

/**
 * `collectFolderRelations()` の結果を描画用のノード配列に変換する。
 *
 * 座標は割り当てない（0 のまま）。配置はレイアウト関数の責務とし、
 * 呼び出し側で `layoutGrid(toDiagramNodes(...))` のように合成する。
 */
export function toDiagramNodes(notes: NoteRelations[]): DiagramNode[] {
	return notes.map((note) => ({
		id: note.id,
		label: note.id,
		x: 0,
		y: 0,
		// 元データと配列インスタンスを共有しないようコピーする
		relations: [...note.relations],
		properties: [...note.properties],
		color: note.color,
	}));
}

/**
 * ノードを一定数ごとに折り返してグリッド状に配置する。
 *
 * 入力を書き換えず、座標を入れ直した新しい配列を返す。レイアウトアルゴリズムを
 * 差し替えるときは、このシグネチャを保ったまま別の関数に置き換えればよい。
 */
export function layoutGrid(nodes: DiagramNode[]): DiagramNode[] {
	const NODES_PER_ROW = 4;
	// ノード同士が接しないよう、矩形の寸法に余白を足した間隔にする
	const SPACING_X = NODE_WIDTH + 40;
	const ROW_GAP = 60;
	const ORIGIN_X = 40;
	const ORIGIN_Y = 40;

	// 箱の高さが可変なので、行送りは固定値にできない。
	// 各行で一番高いノードを基準に、次の行の上端を決めていく
	const rowTops: number[] = [];
	let rowTop = ORIGIN_Y;
	for (let start = 0; start < nodes.length; start += NODES_PER_ROW) {
		rowTops.push(rowTop);
		const rowNodes = nodes.slice(start, start + NODES_PER_ROW);
		rowTop += Math.max(...rowNodes.map(nodeHeight)) + ROW_GAP;
	}

	return nodes.map((node, index) => ({
		...node,
		x: ORIGIN_X + (index % NODES_PER_ROW) * SPACING_X,
		y: rowTops[Math.floor(index / NODES_PER_ROW)] ?? ORIGIN_Y,
	}));
}

/**
 * 保存済みの座標をノードに反映する。
 *
 * 保存が無いノート（新規追加分など）は、直前の `layoutGrid()` が決めた
 * 位置をそのまま残す。入力は書き換えず新しい配列を返す。
 */
export function applySavedPositions(
	nodes: DiagramNode[],
	saved: FolderPositions,
): DiagramNode[] {
	return nodes.map((node) => {
		const position = saved[node.id];
		if (!position) {
			return node;
		}
		return { ...node, x: position.x, y: position.y };
	});
}

/** 1 本の関係線と、その両端に描く装飾要素。 */
type Edge = {
	line: SVGLineElement;
	/** 参照元側のドット。 */
	dot: SVGCircleElement;
	/** 参照先側の矢印。 */
	arrow: SVGPathElement;
	source: DiagramNode;
	target: DiagramNode;
};

/** 矢印の三角形。頂点を原点に置き +X 方向へ向ける（回転の基準にするため）。 */
const ARROW_PATH = 'M 0 0 L -8 -4 L -8 4 z';

/** 参照元ドットの半径（px）。 */
const SOURCE_DOT_RADIUS = 3;

/**
 * ノード配列を SVG 要素に描画する。関係線とノード（箱＋ラベル）を描き、
 * ノードをドラッグで移動できるようにする。
 *
 * ドラッグ結果は引数 `nodes` の各要素の x / y に書き戻される。呼び出し側が
 * この配列を保持しておけば、移動後の座標をそのまま参照できる。
 *
 * 色や書体は styles.css のクラス側に持たせ、テーマに追従させる。
 *
 * @param onNodeMoved ドラッグ確定時に呼ばれる。座標の永続化はここで行う
 * @param onNodeOpen 「ページを開く」クリック時に呼ばれる。ノートを開くのは
 *                   ワークスペース側の責務なので、ここでは呼び出しだけ行う
 */
export function renderDiagramSvg(
	nodes: DiagramNode[],
	onNodeMoved?: (node: DiagramNode) => void,
	onNodeOpen?: (node: DiagramNode) => void,
): SVGSVGElement {
	const MARGIN = 40;
	// 初期配置ぴったりの viewBox だとノードを動かす余地がないため、
	// 手動配置用の余白を縦横に上乗せする
	const DRAG_SLACK = 400;

	// 初期配置が占める範囲。ノード 0 個でも -Infinity にならないよう 0 を種に置く
	const contentWidth = Math.max(
		0,
		...nodes.map((node) => node.x + NODE_WIDTH),
	);
	const contentHeight = Math.max(
		0,
		...nodes.map((node) => node.y + nodeHeight(node)),
	);

	const width = contentWidth + MARGIN + DRAG_SLACK;
	const height = contentHeight + MARGIN + DRAG_SLACK;

	// ドラッグでノードが viewBox の外へ出ないための上限。余白込みの
	// viewBox から導くので、上の DRAG_SLACK がそのまま可動域になる。
	// 座標はノード矩形の左上基準なので、右端・下端からは寸法分を引く。
	// 高さはノードごとに違うため、Y の上限は各ノードの高さから都度求める
	const MAX_NODE_X = Math.max(0, width - NODE_WIDTH);
	const maxNodeY = (node: DiagramNode) =>
		Math.max(0, height - nodeHeight(node));

	const svg = createSvg('svg', {
		cls: 'relation-diagram',
		attr: {
			viewBox: `0 0 ${width} ${height}`,
			width,
			height,
		},
	});

	// relations の解決を O(1) にするための索引
	const nodesById = new Map<string, DiagramNode>(
		nodes.map((node) => [node.id, node]),
	);

	// ノード id → そこに接続している関係線。ドラッグ中の再描画に使う
	const edgesByNodeId = new Map<string, Edge[]>();
	const registerEdge = (nodeId: string, edge: Edge) => {
		const registered = edgesByNodeId.get(nodeId);
		if (registered) {
			registered.push(edge);
		} else {
			edgesByNodeId.set(nodeId, [edge]);
		}
	};

	// レイヤーを先に作って重なり順を確定させる。SVG は文書順に描画されるので、
	// 中身をどの順で足しても、この 3 つの前後関係は変わらない
	const edgeLayer = svg.createSvg('g', { cls: 'relation-diagram-edges' });
	const nodeLayer = svg.createSvg('g', { cls: 'relation-diagram-nodes' });
	// 端点はノードの箱に隠れないよう、ノードより手前のレイヤーに置く
	const endpointLayer = svg.createSvg('g', {
		cls: 'relation-diagram-endpoints',
	});

	/** 端点座標を計算し、線・ドット・矢印をまとめて配置する。 */
	const drawEdge = (edge: Edge) => {
		// 参照元の右端中央 → 参照先の左端中央
		const x1 = edge.source.x + NODE_WIDTH;
		const y1 = edge.source.y + nodeHeight(edge.source) / 2;
		const x2 = edge.target.x;
		const y2 = edge.target.y + nodeHeight(edge.target) / 2;

		edge.line.setAttribute('x1', String(x1));
		edge.line.setAttribute('y1', String(y1));
		edge.line.setAttribute('x2', String(x2));
		edge.line.setAttribute('y2', String(y2));

		edge.dot.setAttribute('cx', String(x1));
		edge.dot.setAttribute('cy', String(y1));

		// marker の orient="auto" に相当する回転を自前で与える
		const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
		edge.arrow.setAttribute(
			'transform',
			`translate(${x2}, ${y2}) rotate(${angle})`,
		);
	};

	for (const node of nodes) {
		for (const targetId of node.relations) {
			const target = nodesById.get(targetId);
			// 削除済みノートや対象フォルダ外へのリンクは線を引かずに飛ばす
			if (!target) {
				continue;
			}

			const edge: Edge = {
				line: edgeLayer.createSvg('line', {
					cls: 'relation-diagram-edge',
				}),
				dot: endpointLayer.createSvg('circle', {
					cls: 'relation-diagram-source-dot',
					attr: { r: SOURCE_DOT_RADIUS },
				}),
				arrow: endpointLayer.createSvg('path', {
					cls: 'relation-diagram-arrow',
					attr: { d: ARROW_PATH },
				}),
				source: node,
				target,
			};
			drawEdge(edge);

			// 両端どちらが動いても追従できるよう、双方のノードに登録する
			registerEdge(node.id, edge);
			if (target.id !== node.id) {
				registerEdge(target.id, edge);
			}
		}
	}

	/** 値を min〜max に収める。 */
	const clamp = (value: number, min: number, max: number) =>
		Math.min(Math.max(value, min), max);

	/** 画面座標を SVG のユーザー座標に変換する（拡大縮小・スクロールを吸収）。 */
	const toSvgPoint = (evt: PointerEvent) => {
		const ctm = svg.getScreenCTM();
		// 未挿入などで CTM が取れない場合は等倍とみなす
		if (!ctm) {
			return { x: evt.clientX, y: evt.clientY };
		}
		return new DOMPoint(evt.clientX, evt.clientY).matrixTransform(
			ctm.inverse(),
		);
	};

	/** ノードの現在位置に合わせて、接続している線と端点を引き直す。 */
	const updateConnectedEdges = (node: DiagramNode) => {
		for (const edge of edgesByNodeId.get(node.id) ?? []) {
			drawEdge(edge);
		}
	};

	const makeDraggable = (group: SVGGElement, node: DiagramNode) => {
		// ドラッグ中のポインタ ID。null ならドラッグしていない
		let activePointerId: number | null = null;
		// 掴んだ瞬間の「ノード原点からポインタまでのずれ」。これを保つと
		// ノードが掴んだ位置に吸い付かず、自然に動く
		let grabOffsetX = 0;
		let grabOffsetY = 0;

		group.addEventListener('pointerdown', (evt) => {
			// 主ボタン以外（右クリック等）では始めない
			if (evt.button !== 0) {
				return;
			}
			const point = toSvgPoint(evt);
			grabOffsetX = point.x - node.x;
			grabOffsetY = point.y - node.y;
			activePointerId = evt.pointerId;
			// ポインタを捕捉しておくと、ノードの外へ出ても move が届く
			group.setPointerCapture(evt.pointerId);
			group.classList.add('is-dragging');
			evt.preventDefault();
		});

		group.addEventListener('pointermove', (evt) => {
			if (activePointerId !== evt.pointerId) {
				return;
			}
			const point = toSvgPoint(evt);
			// 描画と線の更新は、必ずクランプ後の座標に対して行う
			node.x = clamp(point.x - grabOffsetX, 0, MAX_NODE_X);
			node.y = clamp(point.y - grabOffsetY, 0, maxNodeY(node));
			group.setAttribute('transform', `translate(${node.x}, ${node.y})`);
			updateConnectedEdges(node);
		});

		const endDrag = (evt: PointerEvent, moved: boolean) => {
			if (activePointerId !== evt.pointerId) {
				return;
			}
			group.releasePointerCapture(evt.pointerId);
			activePointerId = null;
			group.classList.remove('is-dragging');
			// 確定した座標は node.x / node.y に入っている
			if (moved) {
				onNodeMoved?.(node);
			}
		};
		group.addEventListener('pointerup', (evt) => endDrag(evt, true));
		// キャンセル時は確定とみなさず、保存もしない
		group.addEventListener('pointercancel', (evt) => endDrag(evt, false));
	};

	/** 箱の最下部に「ページを開く」行を足し、クリックでノートを開けるようにする。 */
	const addOpenLink = (group: SVGGElement, node: DiagramNode) => {
		const rowTop = nodeHeight(node) - NODE_ROW_HEIGHT;

		// プロパティ一覧と操作行の区切り
		group.createSvg('line', {
			cls: 'relation-diagram-node-divider',
			attr: { x1: 0, y1: rowTop, x2: NODE_WIDTH, y2: rowTop },
		});

		const open = group.createSvg('text', {
			cls: 'relation-diagram-node-open',
			attr: {
				x: NODE_WIDTH / 2,
				y: rowTop + NODE_ROW_HEIGHT / 2,
				'text-anchor': 'middle',
				'dominant-baseline': 'middle',
			},
		});
		open.textContent = nodeOpenLabel();

		// ドラッグ判定は箱全体（group）の pointerdown に乗っているので、
		// この行では伝播を止めて掴ませない。こうすると「箱を動かす」と
		// 「ページを開く」が同じ箱の上で衝突しない
		open.addEventListener('pointerdown', (evt) => {
			evt.stopPropagation();
		});
		open.addEventListener('click', (evt) => {
			evt.stopPropagation();
			onNodeOpen?.(node);
		});
	};

	for (const node of nodes) {
		// ノード 1 つ = rect + text。位置は <g> の transform 側に持たせ、
		// 中身はローカル座標で描く。こうするとドラッグ時の更新が transform 1 つで済む
		const group = nodeLayer.createSvg('g', {
			// color が未指定、または既定 5 色以外の値なら isNodeColor で弾かれて
			// undefined になっている。box だけでなくここにも付けておくと、
			// プロパティ名の文字色など、色付きノードに限った CSS の出し分けが
			// 子要素側（box とは別要素）からでも書ける
			cls: node.color
				? ['relation-diagram-node', `is-color-${node.color}`]
				: 'relation-diagram-node',
			attr: { transform: `translate(${node.x}, ${node.y})` },
		});

		group.createSvg('rect', {
			// color が未指定、または既定 5 色以外の値なら isNodeColor で弾かれて
			// undefined になっている。その場合は修飾クラスを付けず既定色のまま
			cls: node.color
				? ['relation-diagram-node-box', `is-color-${node.color}`]
				: 'relation-diagram-node-box',
			attr: {
				x: 0,
				y: 0,
				width: NODE_WIDTH,
				height: nodeHeight(node),
				rx: 6,
			},
		});

		const label = group.createSvg('text', {
			cls: 'relation-diagram-node-label',
			attr: {
				x: NODE_WIDTH / 2,
				y: NODE_HEADER_HEIGHT / 2,
				'text-anchor': 'middle',
				'dominant-baseline': 'middle',
			},
		});
		// ラベルはユーザーのファイル名。長ければ切り詰められ、
		// 全文は <title> のツールチップで読める
		setFittableText(
			label,
			node.label,
			NODE_TEXT_WIDTH,
			NODE_LABEL_FONT_SIZE,
		);

		if (node.properties.length > 0) {
			// 見出しとプロパティ一覧の区切り
			group.createSvg('line', {
				cls: 'relation-diagram-node-divider',
				attr: {
					x1: 0,
					y1: NODE_HEADER_HEIGHT,
					x2: NODE_WIDTH,
					y2: NODE_HEADER_HEIGHT,
				},
			});
		}

		node.properties.forEach((property, index) => {
			// このプロパティに割り当てられた 2 行分の上端
			const blockTop =
				NODE_HEADER_HEIGHT +
				index * NODE_PROPERTY_LINES * NODE_ROW_HEIGHT;
			/** 行の上端 + 行高の半分で、行の縦中央に置く。 */
			const rowCenter = (line: number) =>
				blockTop + line * NODE_ROW_HEIGHT + NODE_ROW_HEIGHT / 2;

			// 1 行目: プロパティ名
			const name = group.createSvg('text', {
				// cls は classList へ渡されるので、複数クラスは配列で渡す
				// （空白区切りの 1 文字列は DOMTokenList が受け付けない）
				cls: [
					'relation-diagram-node-property',
					'relation-diagram-node-property-name',
				],
				attr: {
					x: NODE_PADDING_X,
					y: rowCenter(0),
					'dominant-baseline': 'middle',
				},
			});
			setFittableText(
				name,
				property.name,
				NODE_TEXT_WIDTH,
				NODE_PROPERTY_FONT_SIZE,
			);

			// 2 行目: 値。字下げした分だけ使える幅が狭くなる
			const value = group.createSvg('text', {
				// cls は classList へ渡されるので、複数クラスは配列で渡す
				// （空白区切りの 1 文字列は DOMTokenList が受け付けない）
				cls: [
					'relation-diagram-node-property',
					'relation-diagram-node-property-value',
				],
				attr: {
					x: NODE_PADDING_X + NODE_VALUE_INDENT,
					y: rowCenter(1),
					'dominant-baseline': 'middle',
				},
			});
			setFittableText(
				value,
				property.value,
				NODE_TEXT_WIDTH - NODE_VALUE_INDENT,
				NODE_PROPERTY_FONT_SIZE,
			);
		});

		makeDraggable(group, node);
		addOpenLink(group, node);
	}

	return svg;
}

export default class BasesRelationDiagramPlugin extends Plugin {
	settings!: BasesRelationDiagramSettings;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_RELATION_DIAGRAM,
			(leaf) => new RelationDiagramView(leaf),
		);

		// TODO: 動作確認用の一時コマンド。UI を実装する際に削除する。
		this.addCommand({
			id: 'open-relation-diagram',
			name: 'Open relation diagram',
			callback: async () => {
				const activeFile = this.app.workspace.getActiveFile();
				const folder = activeFile?.parent ?? this.app.vault.getRoot();
				const folderPath = folder.path;
				const notes = this.collectFolderRelations(folder);
				// まず layoutGrid で全ノードに既定位置を与え、保存済みのものだけ上書きする
				const nodes = applySavedPositions(
					layoutGrid(toDiagramNodes(notes)),
					this.settings.nodePositions[folderPath] ?? {},
				);

				const leaf = this.app.workspace.getLeaf('tab');
				await leaf.setViewState({
					type: VIEW_TYPE_RELATION_DIAGRAM,
					active: true,
				});
				// setViewState の active: true でタブが前面に来るため revealLeaf は不要
				if (leaf.view instanceof RelationDiagramView) {
					leaf.view.setSvg(
						renderDiagramSvg(
							nodes,
							(node) => {
								// pointerup は同期なので、保存は投げっぱなしにして
								// 失敗だけ利用者に伝える
								this.saveNodePosition(folderPath, node).catch(
									() => {
										new Notice(
											'Failed to save the node position.',
										);
									},
								);
							},
							(node) => {
								// click も同期。開けなかったときだけ知らせる
								this.openNote(folder, node.id).catch(() => {
									new Notice(`Failed to open "${node.id}".`);
								});
							},
						),
					);
				}

				new Notice(`Rendered ${nodes.length} notes.`);
			},
		});

		this.addSettingTab(new BasesRelationDiagramSettingTab(this.app, this));
	}

	/**
	 * ノード id（拡張子なしのファイル名）に対応するノートを開く。
	 *
	 * ノードは走査対象フォルダ直下のノートから作られるので、同じフォルダの
	 * 子から探せば同名ノートの取り違えが起きない。
	 *
	 * 図のタブを潰さないよう、開き先は新しいタブにする。
	 */
	async openNote(folder: TFolder, id: string): Promise<void> {
		const file = folder.children.find(
			(child): child is TFile =>
				child instanceof TFile &&
				child.extension === 'md' &&
				child.basename === id,
		);
		// 図を描いた後にノートが消された場合など
		if (!file) {
			new Notice(`"${id}" no longer exists.`);
			return;
		}
		await this.app.workspace.getLeaf('tab').openFile(file);
	}

	/**
	 * フォルダ直下の Markdown ノートを走査し、frontmatter の Relation 型プロパティ
	 * （リンク形式で他ノートを参照している値）を抽出する。
	 *
	 * Bases の Relation は frontmatter 内のリンクとして保存されるため、
	 * metadataCache が解析済みの `frontmatterLinks` をそのまま利用する。
	 *
	 * @param folder 走査対象のフォルダ（サブフォルダは辿らない）
	 */
	collectFolderRelations(folder: TFolder): NoteRelations[] {
		const results: NoteRelations[] = [];

		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== 'md') {
				continue;
			}

			const cache = this.app.metadataCache.getFileCache(child);
			const relations: string[] = [];
			// Relation として使われているプロパティ名。表示側では除外する
			const relationKeys = new Set<string>();

			for (const fmLink of cache?.frontmatterLinks ?? []) {
				// 配列要素は "related.0" のようなキーになる。先頭がプロパティ名
				relationKeys.add(fmLink.key.split('.')[0] ?? fmLink.key);

				// 見出し・ブロック参照（#heading, #^block）を落としてパス部分だけにする
				const linkpath = getLinkpath(fmLink.link);
				const dest = this.app.metadataCache.getFirstLinkpathDest(
					linkpath,
					child.path,
				);
				// 未解決リンクはリンクテキストの末尾をファイル名として扱う
				const name = dest
					? dest.basename
					: (linkpath.split('/').pop() ?? '');

				if (name && !relations.includes(name)) {
					relations.push(name);
				}
			}

			const properties: NoteProperty[] = [];
			for (const [name, value] of Object.entries(
				cache?.frontmatter ?? {},
			)) {
				if (relationKeys.has(name) || HIDDEN_PROPERTIES.has(name)) {
					continue;
				}
				properties.push({
					name,
					value: formatPropertyValue(value),
				});
			}

			const rawColor: unknown = cache?.frontmatter?.color;
			const color = isNodeColor(rawColor) ? rawColor : undefined;

			results.push({ id: child.basename, relations, properties, color });
		}

		return results;
	}

	/** 1 ノード分の座標をプラグインのデータファイルに保存する。 */
	async saveNodePosition(folderPath: string, node: DiagramNode) {
		const folderPositions = this.settings.nodePositions[folderPath] ?? {};
		folderPositions[node.id] = { x: node.x, y: node.y };
		this.settings.nodePositions[folderPath] = folderPositions;
		await this.saveSettings();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<BasesRelationDiagramSettings>,
		);
		// Object.assign は浅いコピーなので、保存データに座標が無いと
		// DEFAULT_SETTINGS のオブジェクトを直接書き換えてしまう。複製して切り離す
		this.settings.nodePositions = { ...this.settings.nodePositions };
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
