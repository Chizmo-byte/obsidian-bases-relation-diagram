/**
 * ノードの箱に入れる文字列を、固定幅の箱に収める。
 *
 * 2 段構えになっている。
 *
 * 1. 描画時は見積もり幅で切る（`setFittableText`）。SVG は DOM に載るまで
 *    文字の実寸が測れないため、まずは概算で当てる。
 * 2. DOM に載った後に実測で詰め直す（`fitNodeText`）。
 *    `getComputedTextLength()` は実際に使われている書体・字送りを反映するので、
 *    見積もりでは吸収しきれない差（書体差・カーニング）もここで消える。
 *
 * どちらの段でも、切り詰めが起きたら `<title>` を付けて全文をツールチップで
 * 読めるようにする。切り詰めていなければ `<title>` は付けない。
 *
 * main.ts / view.ts の双方から使うため、循環 import を避けて独立させている。
 */

/** 切り詰めたことを示す記号。 */
const ELLIPSIS = '…';

/** `<title>` を作るための名前空間。 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * フォントサイズに対する、半角文字 1 字の想定字幅の比率。
 *
 * 実際の字幅は文字ごとに違う（Inter だと小文字はおよそ 0.5em、数字・大文字で
 * 0.6em 前後）。溢れるよりは短めに出る方が安全なので、広めに倒してある。
 */
const HALF_WIDTH_RATIO = 0.68;

/** 全角文字 1 字の想定字幅の比率。全角は原則としてフォントサイズと等幅。 */
const FULL_WIDTH_RATIO = 1;

/**
 * 全角として扱う文字。
 *
 * East Asian Width の Wide / Fullwidth をおおまかに拾う範囲。`…` は
 * Ambiguous だが、和文フォントでは全角送りになるため広い方に寄せている。
 */
const FULL_WIDTH_PATTERN =
	/[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦…]/;

/** データ属性のキー。実測で詰め直すときに元の文字列と上限幅を復元するために使う。 */
const FIT_WIDTH = 'data-fit-width';
const FIT_TEXT = 'data-fit-text';

/**
 * 書記素ではなくコードポイント単位に分割する。
 *
 * `slice()` は UTF-16 単位なので、絵文字などのサロゲートペアを
 * 途中で割ってしまう。切り詰めは必ずこの配列を通して行う。
 */
function toChars(text: string): string[] {
	return Array.from(text);
}

/** 1 文字の見積もり幅（px）。 */
function estimateCharWidth(char: string, fontSize: number): number {
	const ratio = FULL_WIDTH_PATTERN.test(char)
		? FULL_WIDTH_RATIO
		: HALF_WIDTH_RATIO;
	return fontSize * ratio;
}

/**
 * 文字列全体の見積もり幅（px）。
 *
 * 切り詰め計算以外にも、値の行の先頭に置く記号のように「この文字列が
 * 大体どれくらいの幅を取るか」を先に知りたい箇所（main.ts）から再利用する。
 */
export function estimateTextWidth(text: string, fontSize: number): number {
	return toChars(text).reduce(
		(total, char) => total + estimateCharWidth(char, fontSize),
		0,
	);
}

/**
 * 見積もり幅が `maxWidth` に収まるまで切り詰め、末尾に省略記号を付ける。
 *
 * 省略記号自身も幅を持つので、その分を先に予算から引いてから詰める。
 */
function truncateToWidth(
	text: string,
	maxWidth: number,
	fontSize: number,
): string {
	if (estimateTextWidth(text, fontSize) <= maxWidth) {
		return text;
	}

	const budget = maxWidth - estimateCharWidth(ELLIPSIS, fontSize);
	const chars = toChars(text);
	let used = 0;
	let kept = 0;
	for (const char of chars) {
		const width = estimateCharWidth(char, fontSize);
		if (used + width > budget) {
			break;
		}
		used += width;
		kept += 1;
	}
	// 省略記号しか置けない場合でも、何の文字だったか分かるよう 1 文字は残す
	return `${chars.slice(0, Math.max(1, kept)).join('')}${ELLIPSIS}`;
}

/**
 * 表示文字列を流し込み、切り詰めていれば `<title>` で全文を添える。
 *
 * `textContent` の代入は子要素ごと差し替わるので、`<title>` は毎回
 * この関数で付け直す。全文が出ているときは付けない（不要なツールチップが
 * 出ないようにするため）。
 */
function applyText(el: SVGTextElement, shown: string, full: string): void {
	// ユーザー由来の文字列。マークアップとして解釈させない
	el.textContent = shown;
	if (shown === full) {
		return;
	}
	const title = el.ownerDocument.createElementNS(SVG_NS, 'title');
	title.textContent = full;
	el.appendChild(title);
}

/**
 * 切り詰め対象のテキストを描き込む。
 *
 * ここで入るのは見積もりによる暫定値で、DOM 挿入後に `fitNodeText()` が
 * 実測幅で詰め直す。再計算に必要な情報は要素自身に持たせておく。
 *
 * @param maxWidth この要素が使ってよい幅（px）
 */
export function setFittableText(
	el: SVGTextElement,
	text: string,
	maxWidth: number,
	fontSize: number,
): void {
	el.setAttribute(FIT_WIDTH, String(maxWidth));
	el.setAttribute(FIT_TEXT, text);
	applyText(el, truncateToWidth(text, maxWidth, fontSize), text);
}

/** 描画済みテキストの実寸（px）。まだ描画されていなければ 0。 */
function measure(el: SVGTextElement): number {
	try {
		return el.getComputedTextLength();
	} catch {
		// 未挿入・非表示などで測れない場合
		return 0;
	}
}

/**
 * 1 要素を実測しながら、上限幅に収まる最大の文字数まで切り詰める。
 *
 * 1 文字ずつ削ると文字数に比例して測定が増えるので、二分探索で詰める。
 */
function fitTextElement(el: SVGTextElement): void {
	const maxWidth = Number(el.getAttribute(FIT_WIDTH));
	const full = el.getAttribute(FIT_TEXT) ?? '';
	if (!Number.isFinite(maxWidth) || maxWidth <= 0) {
		return;
	}

	// 測定中は <title> が消えるので、元に戻せるよう今の表示を控えておく
	const shown = el.textContent ?? '';
	el.textContent = full;
	const fullWidth = measure(el);
	// 0 は「まだ測れない」の意味。描画時の見積もりのまま据え置く
	if (fullWidth === 0) {
		applyText(el, shown, full);
		return;
	}
	if (fullWidth <= maxWidth) {
		applyText(el, full, full);
		return;
	}

	const chars = toChars(full);
	const render = (kept: number) =>
		`${chars.slice(0, kept).join('')}${ELLIPSIS}`;
	const fits = (kept: number) => {
		el.textContent = render(kept);
		return measure(el) <= maxWidth;
	};

	// lo = 収まると分かっている文字数、hi = 収まる可能性が残る上限。
	// 元の長さでは収まらないと確定しているので、探索は 1 文字短い所から始める
	let lo = 0;
	let hi = chars.length - 1;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (fits(mid)) {
			lo = mid;
		} else {
			hi = mid - 1;
		}
	}
	// 探索の途中経過が残っているので、確定した文字数で描き直す
	applyText(el, render(Math.max(1, lo)), full);
}

/**
 * SVG 内の切り詰め対象を、実測幅にもとづいて詰め直す。
 *
 * `getComputedTextLength()` は要素が DOM に載って初めて値を返すので、
 * 呼び出しは SVG を挿入した後に行う必要がある。
 */
export function fitNodeText(svg: SVGSVGElement): void {
	const targets = svg.querySelectorAll<SVGTextElement>(`[${FIT_WIDTH}]`);
	for (const el of Array.from(targets)) {
		fitTextElement(el);
	}
}
