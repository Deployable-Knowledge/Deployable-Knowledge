import { Extension, mergeAttributes, type Extensions, type MarkdownToken } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { TaskItem, TaskList } from '@tiptap/extension-list';
import { TableCell, TableHeader, TableKit } from '@tiptap/extension-table';
import { BackgroundColor, Color, TextStyle } from '@tiptap/extension-text-style';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import { NotebookFind } from './notebook-find';

export interface NotebookEditorHooks {
	onOpenFind(): void;
	onEscape(): boolean;
}

const COLOR_VALUE = /^(#[0-9a-f]{3,8}|[a-z]{1,25}|(rgb|hsl)a?\([\d\s.,%/]+\))$/i;

const STYLE_SPAN = /^<span style="([^"]*)">((?:(?!<\/?span\b)[\s\S])*?)<\/span>/;

const UNSAFE_HREF = /^\s*(javascript|data|vbscript):/i;

export function openLink(href: string): boolean {
	if (UNSAFE_HREF.test(href)) return false;
	window.open(href, '_blank', 'noopener,noreferrer');
	return true;
}

interface SpanStyle {
	color: string | null;
	backgroundColor: string | null;
}

function parseSpanStyle(style: string): SpanStyle {
	const result: SpanStyle = { color: null, backgroundColor: null };
	for (const declaration of style.split(';')) {
		const [property = '', value = ''] = declaration.split(':').map((part) => part.trim());
		if (!COLOR_VALUE.test(value)) continue;
		if (property === 'color') result.color = value;
		if (property === 'background-color') result.backgroundColor = value;
	}
	return result;
}

function spanStyleDeclarations({ color, backgroundColor }: Record<string, unknown>): string[] {
	const declarations: string[] = [];
	if (typeof color === 'string' && COLOR_VALUE.test(color)) declarations.push(`color:${color}`);
	if (typeof backgroundColor === 'string' && COLOR_VALUE.test(backgroundColor)) {
		declarations.push(`background-color:${backgroundColor}`);
	}
	return declarations;
}

const NotebookTextStyle = TextStyle.extend({
	markdownTokenName: 'styleSpan',
	markdownTokenizer: {
		name: 'styleSpan',
		level: 'inline',
		start: '<span style=',
		tokenize(src, _tokens, lexer): MarkdownToken | undefined {
			const match = STYLE_SPAN.exec(src);
			if (!match) return undefined;
			const style = parseSpanStyle(match[1]);
			if (!style.color && !style.backgroundColor) return undefined;
			return { type: 'styleSpan', raw: match[0], ...style, tokens: lexer.inlineTokens(match[2]) };
		}
	},
	parseMarkdown: (token, helpers) =>
		helpers.applyMark('textStyle', helpers.parseInline(token.tokens ?? []), {
			color: token.color,
			backgroundColor: token.backgroundColor
		}),
	renderMarkdown(node, helpers) {
		const content = helpers.renderChildren(node.content ?? []);
		const declarations = spanStyleDeclarations(node.attrs ?? {});
		if (!declarations.length) return content;
		return `<span style="${declarations.join(';')}">${content}</span>`;
	},
	renderHTML({ mark, HTMLAttributes }) {
		const highlight = mark.attrs.backgroundColor ? { class: 'dk-text-highlight' } : {};
		return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, highlight), 0];
	}
});

const NotebookInteractions = Extension.create({
	name: 'notebookInteractions',

	addProseMirrorPlugins() {
		const editor = this.editor;
		return [
			new Plugin({
				props: {
					handleClick(view, pos, event) {
						if (!event.ctrlKey && !event.metaKey) return false;
						const href: unknown = view.state.doc
							.nodeAt(pos)
							?.marks.find((mark) => mark.type.name === 'link')?.attrs.href;
						return typeof href === 'string' && openLink(href);
					},
					handlePaste(view, event) {
						const data = event.clipboardData;
						if (!data || data.types.includes('text/html')) return false;
						if (view.state.selection.$from.parent.type.spec.code) return false;
						const text = data.getData('text/plain');
						if (!text) return false;
						return editor.commands.insertContent(text, { contentType: 'markdown' });
					},
					handleDOMEvents: {
						contextmenu(view, event) {
							const target = view.posAtCoords({ left: event.clientX, top: event.clientY });
							const { from, to } = view.state.selection;
							if (!target || (target.pos >= from && target.pos <= to)) return false;
							const $pos = view.state.doc.resolve(target.pos);
							view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
							return false;
						}
					}
				}
			})
		];
	}
});

export function notebookEditorExtensions(hooks: NotebookEditorHooks): Extensions {
	return [
		StarterKit.configure({
			underline: false,
			link: { openOnClick: false, autolink: true }
		}),
		TableKit.configure({ table: { resizable: false }, tableCell: false, tableHeader: false }),
		TableCell.extend({ content: 'paragraph' }),
		TableHeader.extend({ content: 'paragraph' }),
		TaskList,
		TaskItem.configure({ nested: true }),
		NotebookTextStyle,
		Color,
		BackgroundColor,
		Image.configure({ inline: true }),
		Placeholder.configure({ placeholder: 'Write notes here…' }),
		Markdown.configure({ markedOptions: { gfm: true } }),
		NotebookFind,
		NotebookInteractions,
		Extension.create({
			name: 'notebookKeymap',
			priority: 1000,
			addKeyboardShortcuts() {
				return {
					'Mod-f': () => {
						hooks.onOpenFind();
						return true;
					},
					Escape: () => hooks.onEscape(),
					Enter: () => this.editor.isActive('table') && this.editor.commands.setHardBreak()
				};
			}
		})
	];
}
