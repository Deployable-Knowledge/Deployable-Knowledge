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
	const lines = text.split('\n');
	const section = findCitationsSection(lines);
	const rows = section ? [...section.rows] : [];
	const keys = new Set(rows.map(rowKey));
	for (const source of sources) {
		const row = tableRow(source);
		const key = rowKey(row);
		if (keys.has(key)) continue;
		keys.add(key);
		rows.push(row);
	}
	if (!rows.length) return text;
	const table = formatTable([...TABLE_HEADER_ROWS, ...rows].join('\n'), 0).text;
	const block = `${CITATIONS_HEADING}\n\n${table}`;
	if (!section) return [text.trimEnd(), block].filter(Boolean).join('\n\n');
	let next = section.end;
	while (next < lines.length && !lines[next].trim()) next++;
	const before = lines.slice(0, section.start).join('\n').trimEnd();
	const after = lines.slice(next).join('\n');
	return [before, block, after].filter(Boolean).join('\n\n');
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

interface CitationsSection {
	start: number;
	end: number;
	rows: string[];
}

// The section is the last `## Citations` heading line whose first following
// non-blank line is the citations table header; it ends at the first line after
// that table that is not a table row, so content below it is left untouched.
function findCitationsSection(lines: readonly string[]): CitationsSection | null {
	for (let start = lines.length - 1; start >= 0; start--) {
		if (lines[start].trim() !== CITATIONS_HEADING) continue;
		let header = start + 1;
		while (header < lines.length && !lines[header].trim()) header++;
		const headerLine = lines[header]?.trim() ?? '';
		if (!TABLE_ROW.test(headerLine) || rowKey(headerLine) !== rowKey(TABLE_HEADER_ROWS[0])) {
			continue;
		}
		let end = header;
		while (end < lines.length && TABLE_ROW.test(lines[end].trim())) end++;
		const rows = lines.slice(header + TABLE_HEADER_ROWS.length, end).map((line) => line.trim());
		return { start, end, rows };
	}
	return null;
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
