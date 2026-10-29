import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const MAX_FIND_MATCHES = 500;

interface FindMatch {
	from: number;
	to: number;
}

export interface FindState {
	query: string;
	current: number;
	matches: FindMatch[];
	decorations: DecorationSet;
}

type FindMeta = Partial<Pick<FindState, 'query' | 'current'>>;

export const findPluginKey = new PluginKey<FindState>('notebookFind');

declare module '@tiptap/core' {
	interface Commands<ReturnType> {
		notebookFind: {
			setFindQuery: (query: string) => ReturnType;
			gotoFindMatch: (delta: number) => ReturnType;
		};
	}
}

function findMatches(doc: ProseMirrorNode, query: string): FindMatch[] {
	if (!query.trim()) return [];
	const needle = query.toLowerCase();
	const matches: FindMatch[] = [];
	doc.descendants((node, pos) => {
		if (matches.length >= MAX_FIND_MATCHES) return false;
		if (!node.isTextblock) return true;
		const text = node.textBetween(0, node.content.size, undefined, '￼').toLowerCase();
		let index = text.indexOf(needle);
		while (index !== -1 && matches.length < MAX_FIND_MATCHES) {
			matches.push({ from: pos + 1 + index, to: pos + 1 + index + needle.length });
			index = text.indexOf(needle, index + needle.length);
		}
		return false;
	});
	return matches;
}

function buildFindState(doc: ProseMirrorNode, query: string, current: number): FindState {
	const matches = findMatches(doc, query);
	const bounded = matches.length ? Math.min(current, matches.length - 1) : 0;
	const decorations = DecorationSet.create(
		doc,
		matches.map((match, index) =>
			Decoration.inline(match.from, match.to, {
				class: index === bounded ? 'dk-find-current' : 'dk-find-match'
			})
		)
	);
	return { query, current: bounded, matches, decorations };
}

export const NotebookFind = Extension.create({
	name: 'notebookFind',

	addCommands() {
		return {
			setFindQuery:
				(query) =>
				({ tr, dispatch }) => {
					if (dispatch) tr.setMeta(findPluginKey, { query, current: 0 } satisfies FindMeta);
					return true;
				},
			gotoFindMatch:
				(delta) =>
				({ state, tr, dispatch }) => {
					const find = findPluginKey.getState(state);
					if (!find?.matches.length) return false;
					const current = (find.current + delta + find.matches.length) % find.matches.length;
					const match = find.matches[current];
					if (dispatch) {
						tr.setMeta(findPluginKey, { current } satisfies FindMeta)
							.setSelection(TextSelection.create(tr.doc, match.from, match.to))
							.scrollIntoView();
					}
					return true;
				}
		};
	},

	addProseMirrorPlugins() {
		return [
			new Plugin<FindState>({
				key: findPluginKey,
				state: {
					init: (_, { doc }) => buildFindState(doc, '', 0),
					apply(tr, value) {
						const meta = tr.getMeta(findPluginKey) as FindMeta | undefined;
						if (!meta && !tr.docChanged) return value;
						return buildFindState(
							tr.doc,
							meta?.query ?? value.query,
							meta?.current ?? value.current
						);
					}
				},
				props: {
					decorations: (state) => findPluginKey.getState(state)?.decorations
				}
			})
		];
	}
});
