import type { ChainedCommands, Editor } from '@tiptap/core';

const TOGGLE_COMMANDS = [
	'bold',
	'italic',
	'strikethrough',
	'code',
	'bullet-list',
	'ordered-list',
	'task-list',
	'quote',
	'code-block'
] as const;

const ACTION_COMMANDS = [
	'undo',
	'redo',
	'indent',
	'outdent',
	'horizontal-rule',
	'clear-formatting'
] as const;

const TABLE_COMMANDS = [
	'insert-table',
	'add-row-above',
	'add-row-below',
	'add-column-left',
	'add-column-right',
	'delete-row',
	'delete-column',
	'delete-table'
] as const;

const BLOCK_STYLES = ['paragraph', 'h1', 'h2', 'h3', 'h4'] as const;

export type ToggleCommand = (typeof TOGGLE_COMMANDS)[number];
export type ActionCommand = (typeof ACTION_COMMANDS)[number];
export type TableCommand = (typeof TABLE_COMMANDS)[number];
export type BlockStyle = (typeof BLOCK_STYLES)[number];
type NamedCommand = ToggleCommand | ActionCommand | TableCommand;

type StyleCommand = { color: string | null } | { highlight: string | null };

export type EditorCommand =
	| NamedCommand
	| StyleCommand
	| { block: BlockStyle }
	| { link: string | null };

export interface FormattingState {
	active: ReadonlySet<ToggleCommand>;
	available: ReadonlySet<NamedCommand | BlockStyle>;
	blockStyle: BlockStyle | null;
	color: string | null;
	hasSelection: boolean;
	highlight: string | null;
	inTable: boolean;
	linkHref: string | null;
}

type ChainStep = (chain: ChainedCommands, editor: Editor) => ChainedCommands;

function listItemType(editor: Editor): string {
	return editor.isActive('taskItem') ? 'taskItem' : 'listItem';
}

const NAMED_COMMANDS: Record<NamedCommand, ChainStep> = {
	bold: (chain) => chain.toggleBold(),
	italic: (chain) => chain.toggleItalic(),
	strikethrough: (chain) => chain.toggleStrike(),
	code: (chain) => chain.toggleCode(),
	'bullet-list': (chain) => chain.toggleBulletList(),
	'ordered-list': (chain) => chain.toggleOrderedList(),
	'task-list': (chain) => chain.toggleTaskList(),
	quote: (chain) => chain.toggleBlockquote(),
	'code-block': (chain) => chain.toggleCodeBlock(),
	undo: (chain) => chain.undo(),
	redo: (chain) => chain.redo(),
	indent: (chain, editor) => chain.sinkListItem(listItemType(editor)),
	outdent: (chain, editor) => chain.liftListItem(listItemType(editor)),
	'horizontal-rule': (chain) => chain.setHorizontalRule(),
	'clear-formatting': (chain) => chain.unsetAllMarks().clearNodes(),
	'insert-table': (chain) => chain.insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
	'add-row-above': (chain) => chain.addRowBefore(),
	'add-row-below': (chain) => chain.addRowAfter(),
	'add-column-left': (chain) => chain.addColumnBefore(),
	'add-column-right': (chain) => chain.addColumnAfter(),
	'delete-row': (chain) => chain.deleteRow(),
	'delete-column': (chain) => chain.deleteColumn(),
	'delete-table': (chain) => chain.deleteTable()
};

const BLOCK_STYLE_COMMANDS: Record<BlockStyle, (chain: ChainedCommands) => ChainedCommands> = {
	paragraph: (chain) => chain.setParagraph(),
	h1: (chain) => chain.setHeading({ level: 1 }),
	h2: (chain) => chain.setHeading({ level: 2 }),
	h3: (chain) => chain.setHeading({ level: 3 }),
	h4: (chain) => chain.setHeading({ level: 4 })
};

const TOGGLE_TARGETS: Record<ToggleCommand, string> = {
	bold: 'bold',
	italic: 'italic',
	strikethrough: 'strike',
	code: 'code',
	'bullet-list': 'bulletList',
	'ordered-list': 'orderedList',
	'task-list': 'taskList',
	quote: 'blockquote',
	'code-block': 'codeBlock'
};

const BLOCK_STYLE_TARGETS: Record<BlockStyle, [name: string, attributes?: { level: number }]> = {
	paragraph: ['paragraph'],
	h1: ['heading', { level: 1 }],
	h2: ['heading', { level: 2 }],
	h3: ['heading', { level: 3 }],
	h4: ['heading', { level: 4 }]
};

function applyLink(editor: Editor, href: string | null): boolean {
	const chain = editor.chain().focus();
	if (!href) return chain.extendMarkRange('link').unsetLink().run();
	if (editor.state.selection.empty && !editor.isActive('link')) {
		return chain
			.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
			.run();
	}
	return chain.extendMarkRange('link').setLink({ href }).run();
}

function styleText(chain: ChainedCommands, command: StyleCommand): ChainedCommands {
	if ('highlight' in command) {
		return command.highlight
			? chain.setBackgroundColor(command.highlight)
			: chain.unsetBackgroundColor();
	}
	return command.color ? chain.setColor(command.color) : chain.unsetColor();
}

export function runEditorCommand(editor: Editor, command: EditorCommand): boolean {
	if (typeof command === 'object' && 'link' in command) return applyLink(editor, command.link);
	const chain = editor.chain().focus();
	if (typeof command === 'string') return NAMED_COMMANDS[command](chain, editor).run();
	if ('block' in command) return BLOCK_STYLE_COMMANDS[command.block](chain).run();
	return styleText(chain, command).run();
}

function stringAttribute(value: unknown): string | null {
	return typeof value === 'string' && value ? value : null;
}

function availableCommands(editor: Editor): Set<NamedCommand | BlockStyle> {
	const named = [...TOGGLE_COMMANDS, ...ACTION_COMMANDS, ...TABLE_COMMANDS].filter((command) =>
		NAMED_COMMANDS[command](editor.can().chain(), editor).run()
	);
	const styles = BLOCK_STYLES.filter(
		(style) =>
			editor.isActive(...BLOCK_STYLE_TARGETS[style]) ||
			BLOCK_STYLE_COMMANDS[style](editor.can().chain()).run()
	);
	return new Set([...named, ...styles]);
}

export function formattingState(editor: Editor): FormattingState {
	const textStyle = editor.getAttributes('textStyle');
	return {
		active: new Set(TOGGLE_COMMANDS.filter((command) => editor.isActive(TOGGLE_TARGETS[command]))),
		available: availableCommands(editor),
		blockStyle:
			BLOCK_STYLES.find((style) => editor.isActive(...BLOCK_STYLE_TARGETS[style])) ?? null,
		color: stringAttribute(textStyle.color),
		hasSelection: !editor.state.selection.empty,
		highlight: stringAttribute(textStyle.backgroundColor),
		inTable: editor.isActive('table'),
		linkHref: stringAttribute(editor.getAttributes('link').href)
	};
}
