import { APP_PREVIEW } from '#lib/constants';
import type { NotebookSourceItem } from '#lib/types';
import { formatTable, tableRowCells } from './markdown-table';

export interface CitationInsertion {
	text: string;
	cursor: number;
}

const CITATIONS_HEADING = '## Citations';
const TABLE_HEADER_ROWS = ['| Source | Page |', '| --- | ---: |'];
const TABLE_ROW = /^\|.*\|$/;

export function insertNotebookSourceCitation(
	text: string,
	source: NotebookSourceItem,
	selectionStart = text.length,
	selectionEnd = selectionStart
): CitationInsertion {
	const page = source.pageIndex + 1;
	const title = escapeLabel(source.documentTitle.trim() || 'Source');
	const href = APP_PREVIEW.page(source.documentId, source.pageIndex);
	const citation = `([${title}, p. ${page}](${href}))`;
	const start = clamp(selectionStart, 0, text.length);
	const end = clamp(selectionEnd, start, text.length);
	const before = text.slice(0, start);
	const after = text.slice(end);
	const prefix = before && !/[\s([{]$/.test(before) ? ' ' : '';
	const suffix = after && !/^[\s.,;:!?)}\]]/.test(after) ? ' ' : '';
	const insertion = `${prefix}${citation}${suffix}`;
	return {
		text: `${before}${insertion}${after}`,
		cursor: before.length + insertion.length
	};
}

export function insertNotebookCitationsTable(
	text: string,
	sources: readonly NotebookSourceItem[]
): string {
	const rows = extractRows(text);
	const keys = new Set(rows.map(rowKey));
	for (const source of sources) {
		const row = tableRow(source);
		const key = rowKey(row);
		if (keys.has(key)) continue;
		keys.add(key);
		rows.push(row);
	}
	if (!rows.length) return text;
	const body = removeTable(text).trimEnd();
	const table = formatTable([...TABLE_HEADER_ROWS, ...rows].join('\n'), 0).text;
	return `${body}\n\n${CITATIONS_HEADING}\n\n${table}`;
}

export function notebookSourceHeading(title: string, href: string, location: string): string {
	return `**[${escapeLabel(title.trim() || 'Source')}](${href})** — ${location}`;
}

function tableRow(source: NotebookSourceItem): string {
	const href = APP_PREVIEW.page(source.documentId, source.pageIndex);
	return `| [${escapeTable(source.documentTitle)}](${href}) | ${source.pageIndex + 1} |`;
}

// Rows compare by trimmed cells, since aligning the table re-pads them
function rowKey(row: string): string {
	return tableRowCells(row).join('\n');
}

function tableLines(text: string): string[] {
	return text
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => TABLE_ROW.test(line));
}

function citationsStart(text: string): number {
	const start = text.lastIndexOf(CITATIONS_HEADING);
	if (start < 0) return -1;
	const [header] = tableLines(text.slice(start));
	return header && rowKey(header) === rowKey(TABLE_HEADER_ROWS[0]) ? start : -1;
}

function extractRows(text: string): string[] {
	const start = citationsStart(text);
	if (start < 0) return [];
	return tableLines(text.slice(start)).slice(TABLE_HEADER_ROWS.length);
}

function removeTable(text: string): string {
	const start = citationsStart(text);
	return start < 0 ? text : text.slice(0, start);
}

function escapeLabel(value: string): string {
	return value.replace(/([\\[\]])/g, '\\$1');
}

function escapeTable(value: string): string {
	return escapeLabel(value.replace(/\s+/g, ' ').trim()).replace(/\|/g, '\\|');
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}
