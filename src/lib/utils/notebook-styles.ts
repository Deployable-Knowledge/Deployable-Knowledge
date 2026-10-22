// The notebook's styled-span syntax, `[text]{color=red hl=yellow}`, and
// its translation to and from the `<span style>` HTML used in exported
// Markdown. The editor parser, the markdown-it renderer, the ribbon and the
// server all share this one grammar.

import {
	NOTEBOOK_HIGHLIGHTS,
	NOTEBOOK_TEXT_COLORS,
	type NotebookHighlight,
	type NotebookTextColor
} from '#lib/constants';

export interface NotebookTextStyle {
	color?: NotebookTextColor;
	highlight?: NotebookHighlight;
}

export interface StyledSpanMatch {
	/** Index of the opening `[`. */
	open: number;
	/** Index of the closing `]`. */
	close: number;
	/** Index just past the closing `}`. */
	end: number;
	style: NotebookTextStyle;
}

interface TextEdit {
	from: number;
	to: number;
	insert: string;
}

interface PaletteEntry {
	name: string;
	hex: string;
}

type Rgb = [number, number, number];

const TEXT_COLOR_NAMES = new Set<string>(NOTEBOOK_TEXT_COLORS.map(({ name }) => name));
const HIGHLIGHT_NAMES = new Set<string>(NOTEBOOK_HIGHLIGHTS.map(({ name }) => name));
const TEXT_COLOR_HEX = new Map<string, string>(NOTEBOOK_TEXT_COLORS.map((c) => [c.name, c.hex]));
const HIGHLIGHT_HEX = new Map<string, string>(NOTEBOOK_HIGHLIGHTS.map((c) => [c.name, c.hex]));

const CODE_MASK = '\u0001';
const BLANK_LINE = /\n[ \t]*\n/y;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const BLOCK_PREFIX = /^[ \t]*(?:>[ \t]?)*[ \t]*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)?/;
const INNERMOST_SPAN = /<span\b([^>]*)>((?:(?!<\/?span\b)[\s\S])*?)<\/span>/gi;
const STYLE_ATTRIBUTE = /^\s*style\s*=\s*(?:"([^"]*)"|'([^']*)')\s*$/i;

export function parseTextStyle(raw: string): NotebookTextStyle | null {
	const style: NotebookTextStyle = {};
	for (const entry of raw.trim().toLowerCase().split(/\s+/)) {
		const [key, value, extra] = entry.split('=');
		if (!value || extra !== undefined) return null;
		if (key === 'color' && !style.color && TEXT_COLOR_NAMES.has(value)) {
			style.color = value as NotebookTextColor;
		} else if (key === 'hl' && !style.highlight && HIGHLIGHT_NAMES.has(value)) {
			style.highlight = value as NotebookHighlight;
		} else {
			return null;
		}
	}
	return style.color || style.highlight ? style : null;
}

export function formatTextStyle({ color, highlight }: NotebookTextStyle): string {
	const attributes: string[] = [];
	if (color) attributes.push(`color=${color}`);
	if (highlight) attributes.push(`hl=${highlight}`);
	return attributes.join(' ');
}

export function textStyleClasses({ color, highlight }: NotebookTextStyle): string {
	const classes: string[] = [];
	if (color) classes.push(`nb-color-${color}`);
	if (highlight) classes.push(`nb-highlight-${highlight}`);
	return classes.join(' ');
}

function blankLineAt(text: string, index: number): boolean {
	BLANK_LINE.lastIndex = index;
	return BLANK_LINE.test(text);
}

// Index just past the backtick run that closes the code span opening at
// `start`, or -1 when the run has no partner and is literal text
function codeSpanEnd(text: string, start: number, limit: number): number {
	let index = start;
	while (text[index] === '`') index += 1;
	const length = index - start;
	while (index < limit) {
		if (text[index] === '\n' && blankLineAt(text, index)) return -1;
		if (text[index] !== '`') {
			index += 1;
			continue;
		}
		const run = index;
		while (text[index] === '`') index += 1;
		if (index - run === length) return index;
	}
	return -1;
}

function styleAfter(text: string, open: number, close: number): StyledSpanMatch | null {
	if (close === open + 1 || text[close + 1] !== '{') return null;
	const brace = text.indexOf('}', close + 2);
	if (brace === -1) return null;
	const raw = text.slice(close + 2, brace);
	if (/[\n{]/.test(raw)) return null;
	const style = parseTextStyle(raw);
	return style ? { open, close, end: brace + 1, style } : null;
}

/**
 * Matches a styled span whose `[` sits at `open`: the balanced closing `]`
 * (skipping escapes and code spans, never crossing a blank line) must be
 * followed directly by a valid `{…}` style.
 */
export function matchStyledSpan(text: string, open: number): StyledSpanMatch | null {
	if (text[open] !== '[') return null;
	let depth = 0;
	for (let index = open; index < text.length; index += 1) {
		const char = text[index];
		if (char === '\\') {
			index += 1;
		} else if (char === '`') {
			const end = codeSpanEnd(text, index, text.length);
			if (end !== -1) index = end - 1;
			else while (text[index + 1] === '`') index += 1;
		} else if (char === '\n' && blankLineAt(text, index)) {
			return null;
		} else if (char === '[') {
			depth += 1;
		} else if (char === ']') {
			depth -= 1;
			if (depth === 0) return styleAfter(text, open, index);
		}
	}
	return null;
}

function inlineCodeRanges(text: string, from: number, to: number, ranges: [number, number][]) {
	for (let index = from; index < to; index += 1) {
		if (text[index] === '\\') {
			index += 1;
		} else if (text[index] === '`') {
			const end = codeSpanEnd(text, index, to);
			if (end !== -1) {
				ranges.push([index, end]);
				index = end - 1;
			} else {
				while (text[index + 1] === '`') index += 1;
			}
		}
	}
}

function codeRanges(text: string): [number, number][] {
	const ranges: [number, number][] = [];
	let fence: { marker: string; from: number } | null = null;
	let proseFrom = 0;
	let offset = 0;
	for (const line of text.split('\n')) {
		const lineEnd = offset + line.length;
		if (fence) {
			const closing = FENCE_CLOSE.exec(line)?.[1];
			if (closing?.[0] === fence.marker[0] && closing.length >= fence.marker.length) {
				ranges.push([fence.from, lineEnd]);
				fence = null;
				proseFrom = lineEnd;
			}
		} else {
			const opening = FENCE_OPEN.exec(line)?.[1];
			if (opening) {
				inlineCodeRanges(text, proseFrom, offset, ranges);
				fence = { marker: opening, from: offset };
			}
		}
		offset = lineEnd + 1;
	}
	if (fence) ranges.push([fence.from, text.length]);
	else inlineCodeRanges(text, proseFrom, text.length, ranges);
	return ranges;
}

// Same length as the input with code blanked out, so offsets found in the mask
// address the original text
function maskCode(text: string): string {
	let masked = '';
	let cursor = 0;
	for (const [from, to] of codeRanges(text)) {
		masked += text.slice(cursor, from) + text.slice(from, to).replace(/[^\n]/g, CODE_MASK);
		cursor = to;
	}
	return masked + text.slice(cursor);
}

function applyEdits(text: string, edits: TextEdit[]): string {
	let result = '';
	let cursor = 0;
	for (const edit of [...edits].sort((left, right) => left.from - right.from)) {
		result += text.slice(cursor, edit.from) + edit.insert;
		cursor = edit.to;
	}
	return result + text.slice(cursor);
}

export function findStyledSpans(text: string): StyledSpanMatch[] {
	const masked = maskCode(text);
	const spans: StyledSpanMatch[] = [];
	for (let index = 0; index < masked.length; index += 1) {
		if (masked[index] === '\\') {
			index += 1;
			continue;
		}
		if (masked[index] !== '[' || masked[index - 1] === '!') continue;
		const span = matchStyledSpan(masked, index);
		if (span) spans.push(span);
	}
	return spans;
}

/**
 * The innermost styled span the ribbon should restyle: one holding the caret,
 * or one whose whole content the selection covers.
 */
export function styledSpanAt(text: string, start: number, end: number): StyledSpanMatch | null {
	let innermost: StyledSpanMatch | null = null;
	for (const span of findStyledSpans(text)) {
		const holds =
			start === end
				? start > span.open && start <= span.close
				: start >= span.open && start <= span.open + 1 && end >= span.close && end <= span.end;
		if (holds && (!innermost || span.end - span.open < innermost.end - innermost.open)) {
			innermost = span;
		}
	}
	return innermost;
}

export function skipBlockPrefix(text: string, position: number): number {
	const lineStart = text.lastIndexOf('\n', position - 1) + 1;
	const lineEnd = text.indexOf('\n', lineStart);
	const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
	return Math.max(position, lineStart + (BLOCK_PREFIX.exec(line)?.[0].length ?? 0));
}

function escapeUnbalancedBrackets(segment: string): string {
	const masked = maskCode(segment);
	const brackets: number[] = [];
	let depth = 0;
	let balanced = true;
	for (let index = 0; index < masked.length; index += 1) {
		const char = masked[index];
		if (char === '\\') {
			index += 1;
			continue;
		}
		if (char !== '[' && char !== ']') continue;
		brackets.push(index);
		depth += char === '[' ? 1 : -1;
		if (depth < 0) balanced = false;
	}
	if (balanced && depth === 0) return segment;
	return applyEdits(
		segment,
		brackets.map((index) => ({ from: index, to: index, insert: '\\' }))
	);
}

// A segment that already is one whole styled span gains the new attributes
// instead of a second layer of brackets. `override` lets the new style replace
// an attribute the span already sets; otherwise such a clash nests, which keeps
// the inner color visible exactly as the nested HTML showed it.
function wrapSegment(segment: string, style: NotebookTextStyle, override: boolean): string {
	const whole = matchStyledSpan(segment, 0);
	if (whole?.end === segment.length) {
		const clashes =
			(style.color && whole.style.color) || (style.highlight && whole.style.highlight);
		if (override || !clashes) {
			const merged = override ? { ...whole.style, ...style } : { ...style, ...whole.style };
			return `${segment.slice(0, whole.close + 1)}{${formatTextStyle(merged)}}`;
		}
	}
	return `[${escapeUnbalancedBrackets(segment)}]{${formatTextStyle(style)}}`;
}

/**
 * Wraps text in a styled span. The syntax is inline-only, so text spanning
 * several lines is wrapped line by line, after each later line's list, quote
 * or heading marker.
 */
export function wrapStyledLines(
	content: string,
	style: NotebookTextStyle,
	{ override = false }: { override?: boolean } = {}
): string {
	return content
		.split('\n')
		.map((line, index) => {
			const prefix = index === 0 ? '' : (BLOCK_PREFIX.exec(line)?.[0] ?? '');
			const body = line.slice(prefix.length);
			const trimmed = body.trim();
			if (!trimmed) return line;
			const leading = body.length - body.trimStart().length;
			return (
				prefix +
				body.slice(0, leading) +
				wrapSegment(trimmed, style, override) +
				body.slice(leading + trimmed.length)
			);
		})
		.join('\n');
}

function inlineStyle({ color, highlight }: NotebookTextStyle): string {
	const declarations: string[] = [];
	if (color) declarations.push(`color:${TEXT_COLOR_HEX.get(color)}`);
	if (highlight) declarations.push(`background-color:${HIGHLIGHT_HEX.get(highlight)}`);
	return declarations.join(';');
}

export function styledSyntaxToSpans(text: string): string {
	const edits: TextEdit[] = [];
	for (const span of findStyledSpans(text)) {
		edits.push({
			from: span.open,
			to: span.open + 1,
			insert: `<span style="${inlineStyle(span.style)}">`
		});
		edits.push({ from: span.close, to: span.end, insert: '</span>' });
	}
	return edits.length ? applyEdits(text, edits) : text;
}

function parseCssColor(value: string): Rgb | null {
	const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(value)?.[1];
	if (hex) {
		const full = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join('') : hex;
		return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16)) as Rgb;
	}
	const rgb = /^rgba?\(\s*(\d{1,3})\s*,?\s*(\d{1,3})\s*,?\s*(\d{1,3})\b/.exec(value);
	return rgb ? [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])] : null;
}

// Colors written by other apps snap to the closest palette entry
function paletteMatch<Entry extends PaletteEntry>(
	palette: readonly Entry[],
	value: string
): Entry['name'] | null {
	const normalized = value.trim().toLowerCase();
	const named = palette.find(({ name }) => name === normalized);
	if (named) return named.name;
	const rgb = parseCssColor(normalized);
	if (!rgb) return null;
	let nearest = palette[0];
	let nearestDistance = Infinity;
	for (const entry of palette) {
		const [r, g, b] = parseCssColor(entry.hex) as Rgb;
		const distance = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
		if (distance < nearestDistance) {
			nearest = entry;
			nearestDistance = distance;
		}
	}
	return nearest.name;
}

// Only spans styled purely by color and background color convert; any other
// attribute or CSS keeps the span as HTML
function styleFromSpanAttributes(attributes: string): NotebookTextStyle | null {
	const match = STYLE_ATTRIBUTE.exec(attributes);
	if (!match) return null;
	const style: NotebookTextStyle = {};
	for (const declaration of (match[1] ?? match[2]).split(';')) {
		if (!declaration.trim()) continue;
		const separator = declaration.indexOf(':');
		if (separator === -1) return null;
		const property = declaration.slice(0, separator).trim().toLowerCase();
		const value = declaration.slice(separator + 1);
		if (property === 'color') {
			const color = paletteMatch(NOTEBOOK_TEXT_COLORS, value);
			if (!color) return null;
			style.color = color;
		} else if (property === 'background-color') {
			const highlight = paletteMatch(NOTEBOOK_HIGHLIGHTS, value);
			if (!highlight) return null;
			style.highlight = highlight;
		} else {
			return null;
		}
	}
	return style.color || style.highlight ? style : null;
}

function convertInnermostSpans(text: string): string {
	const edits: TextEdit[] = [];
	for (const match of maskCode(text).matchAll(INNERMOST_SPAN)) {
		const style = styleFromSpanAttributes(match[1]);
		if (!style) continue;
		const from = match.index;
		const to = from + match[0].length;
		const content = text.slice(from + match[0].indexOf('>') + 1, to - '</span>'.length);
		edits.push({ from, to, insert: wrapStyledLines(content, style) });
	}
	return edits.length ? applyEdits(text, edits) : text;
}

// Nested spans convert from the inside out, so an outer color span around an
// inner highlight span merges into one `{color=… hl=…}`
export function spansToStyledSyntax(text: string): string {
	let current = text;
	for (;;) {
		const next = convertInnermostSpans(current);
		if (next === current) return current;
		current = next;
	}
}
