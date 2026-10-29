import { APP_PREVIEW } from '#lib/constants';
import type { NotebookSourceItem } from '#lib/types';

export interface CitationLink {
	label: string;
	href: string;
}

export interface CitationSpacing {
	prefix: string;
	suffix: string;
}

const CITATIONS_HEADING = '## Citations';
const TABLE_HEADER_ROWS = ['| Source | Page |', '| --- | ---: |'];
const TABLE_HEADER = /^\|\s*Source\s*\|\s*Page\s*\|$/;
const TABLE_ROW = /^\|.*\|$/;
const LINK_TARGET = /\]\(([^)\s]+)\)/;

export function notebookCitationLink(source: NotebookSourceItem): CitationLink {
	return {
		label: `${source.documentTitle.trim() || 'Source'}, p. ${source.pageIndex + 1}`,
		href: APP_PREVIEW.page(source.documentId, source.pageIndex)
	};
}

export function citationSpacing(before: string, after: string): CitationSpacing {
	return {
		prefix: before && !/[\s([{]$/.test(before) ? ' ' : '',
		suffix: after && !/^[\s.,;:!?)}\]]/.test(after) ? ' ' : ''
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
	const block = `${CITATIONS_HEADING}\n\n${[...TABLE_HEADER_ROWS, ...rows].join('\n')}`;
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

function rowKey(row: string): string {
	return LINK_TARGET.exec(row)?.[1] ?? row.replace(/\s+/g, ' ').trim();
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
		if (!TABLE_HEADER.test(lines[header]?.trim() ?? '')) continue;
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
