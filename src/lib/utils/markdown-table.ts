import { eastAsianWidth } from 'get-east-asian-width';

type ColumnAlignment = 'none' | 'left' | 'center' | 'right';
type TableMove = 'next' | 'previous' | 'down';
export type TableAction = TableMove | 'delete-row' | 'delete-column';

interface TableEdit {
	text: string;
	cursor: number;
}

interface Segment {
	from: number;
	to: number;
}

interface CellPosition {
	row: number;
	column: number;
	offset: number;
}

interface RenderedRow {
	text: string;
	starts: number[];
}

const DELIMITER_ROW = 1;
const MIN_COLUMN_WIDTH = 3;

// Mirrors @lezer/markdown's row parser: cells split on unescaped pipes, and a
// leading or trailing pipe only frames the row rather than opening a cell.
function rowSegments(line: string): Segment[] {
	const pipes: number[] = [];
	let escaped = false;
	for (let index = 0; index < line.length; index += 1) {
		const char = line[index];
		if (char === '|' && !escaped) pipes.push(index);
		escaped = !escaped && char === '\\';
	}

	const segments: Segment[] = [-1, ...pipes].map((pipe, index) => ({
		from: pipe + 1,
		to: pipes[index] ?? line.length
	}));
	if (!pipes.length) return segments;
	if (!line.slice(0, pipes[0]).trim()) segments.shift();
	if (segments.length && !line.slice(pipes[pipes.length - 1] + 1).trim()) segments.pop();
	return segments;
}

export function tableRowCells(line: string): string[] {
	return rowSegments(line).map(({ from, to }) => line.slice(from, to).trim());
}

function alignmentOf(cell: string): ColumnAlignment {
	if (!/^:?-+:?$/.test(cell)) return 'none';
	const left = cell.startsWith(':');
	const right = cell.endsWith(':');
	if (left && right) return 'center';
	if (right) return 'right';
	return left ? 'left' : 'none';
}

function displayWidth(text: string): number {
	let width = 0;
	for (const char of text) width += eastAsianWidth(char.codePointAt(0) ?? 0);
	return width;
}

function delimiterCell(width: number, alignment: ColumnAlignment): string {
	if (alignment === 'center') return `:${'-'.repeat(width - 2)}:`;
	if (alignment === 'left') return `:${'-'.repeat(width - 1)}`;
	if (alignment === 'right') return `${'-'.repeat(width - 1)}:`;
	return '-'.repeat(width);
}

function leftPadding(space: number, alignment: ColumnAlignment): number {
	if (alignment === 'right') return space;
	if (alignment === 'center') return Math.floor(space / 2);
	return 0;
}

function renderRow(cells: string[], widths: number[], alignments: ColumnAlignment[]): RenderedRow {
	let text = '|';
	const starts: number[] = [];
	const columnCount = Math.max(cells.length, widths.length);
	for (let column = 0; column < columnCount; column += 1) {
		const content = cells[column] ?? '';
		const space = (widths[column] ?? displayWidth(content)) - displayWidth(content);
		const before = leftPadding(space, alignments[column] ?? 'none');
		starts.push(text.length + 1 + before);
		text += ` ${' '.repeat(before)}${content}${' '.repeat(space - before)} |`;
	}
	return { text, starts };
}

function locateCursor(lines: string[], cursor: number): CellPosition {
	let lineStart = 0;
	let row = 0;
	while (row < lines.length - 1 && cursor > lineStart + lines[row].length) {
		lineStart += lines[row].length + 1;
		row += 1;
	}

	const line = lines[row];
	const column = cursor - lineStart;
	const segments = rowSegments(line);
	if (!segments.length) return { row, column: 0, offset: 0 };

	let index = segments.findIndex((segment) => column <= segment.to);
	if (index < 0) index = segments.length - 1;
	const segment = segments[index];
	const raw = line.slice(segment.from, segment.to);
	const contentStart = segment.from + (raw.length - raw.trimStart().length);
	const contentLength = raw.trim().length;
	return {
		row,
		column: index,
		offset: Math.min(Math.max(column - contentStart, 0), contentLength)
	};
}

function nextPosition(position: CellPosition, move: TableMove, columnCount: number): CellPosition {
	const row = position.row === DELIMITER_ROW ? 0 : position.row;
	const rowBelow = row === 0 ? DELIMITER_ROW + 1 : row + 1;
	const rowAbove = row === DELIMITER_ROW + 1 ? 0 : row - 1;

	if (move === 'down') return { row: rowBelow, column: position.column, offset: 0 };
	if (move === 'next') {
		if (position.column < columnCount - 1) return { row, column: position.column + 1, offset: 0 };
		return { row: rowBelow, column: 0, offset: 0 };
	}
	if (position.column > 0) return { row, column: position.column - 1, offset: 0 };
	if (row === 0) return { row: 0, column: 0, offset: 0 };
	return { row: rowAbove, column: columnCount - 1, offset: 0 };
}

// The header and delimiter rows, and a table's only column, are what make it
// a table, so deleting them is a no-op rather than breaking the markdown.
function deleteRow(cells: string[][], position: CellPosition): CellPosition {
	if (position.row <= DELIMITER_ROW) return position;
	cells.splice(position.row, 1);
	const row = Math.min(position.row, cells.length - 1);
	return { row: row === DELIMITER_ROW ? 0 : row, column: position.column, offset: 0 };
}

function deleteColumn(cells: string[][], position: CellPosition): CellPosition {
	if (cells[0].length <= 1 || position.column >= cells[0].length) return position;
	for (const row of cells) row.splice(position.column, 1);
	return { row: position.row, column: Math.min(position.column, cells[0].length - 1), offset: 0 };
}

export function formatTable(source: string, cursor: number, action?: TableAction): TableEdit {
	const lines = source.split('\n');
	if (lines.length <= DELIMITER_ROW) return { text: source, cursor };

	const cells = lines.map(tableRowCells);
	if (!cells[0].length) return { text: source, cursor };

	let position = locateCursor(lines, cursor);
	if (action === 'delete-row') {
		position = deleteRow(cells, position);
	} else if (action === 'delete-column') {
		position = deleteColumn(cells, position);
	} else if (action) {
		position = nextPosition(position, action, cells[0].length);
		if (position.row >= cells.length) cells.push(Array<string>(cells[0].length).fill(''));
	}

	const columnCount = cells[0].length;
	const alignments = cells[0].map((_, column) => alignmentOf(cells[DELIMITER_ROW][column] ?? ''));
	const widths = cells[0].map((_, column) =>
		cells.reduce(
			(widest, row, index) =>
				index === DELIMITER_ROW ? widest : Math.max(widest, displayWidth(row[column] ?? '')),
			MIN_COLUMN_WIDTH
		)
	);
	cells[DELIMITER_ROW] = [
		...widths.map((width, column) => delimiterCell(width, alignments[column])),
		...cells[DELIMITER_ROW].slice(columnCount)
	];

	const rendered = cells.map((row) => renderRow(row, widths, alignments));

	const lineStart = rendered
		.slice(0, position.row)
		.reduce((offset, row) => offset + row.text.length + 1, 0);
	const target = rendered[position.row];
	const column = Math.min(position.column, target.starts.length - 1);
	const contentLength = (cells[position.row][column] ?? '').length;
	return {
		text: rendered.map((row) => row.text).join('\n'),
		cursor: lineStart + target.starts[column] + Math.min(position.offset, contentLength)
	};
}
