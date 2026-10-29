<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { Editor } from '@tiptap/core';
	import type { NotebookSourceItem } from '#lib/types';
	import { citationSpacing, notebookCitationLink } from '#lib/utils/notebook-citations';
	import { runClipboardAction, type ClipboardAction } from './notebook-clipboard';
	import { notebookEditorExtensions } from './notebook-editor-extensions';
	import {
		formattingState,
		runEditorCommand,
		type EditorCommand,
		type FormattingState
	} from './notebook-editing';
	import { findPluginKey } from './notebook-find';
	import NotebookEditorContextMenu from './NotebookEditorContextMenu.svelte';
	import NotebookEditorFindBar from './NotebookEditorFindBar.svelte';
	import NotebookEditorRibbon from './NotebookEditorRibbon.svelte';

	interface Props {
		characterCount: number;
		findOpen?: boolean;
		notes: string;
		onInput: () => void;
	}

	let {
		characterCount,
		findOpen = $bindable(false),
		notes = $bindable(),
		onInput
	}: Props = $props();

	let editorHost = $state<HTMLElement | null>(null);
	let editor = $state.raw<Editor | null>(null);
	let formatting = $state.raw<FormattingState>({
		active: new Set(),
		available: new Set(),
		blockStyle: null,
		color: null,
		hasSelection: false,
		highlight: null,
		inTable: false,
		linkHref: null
	});
	let findQuery = $state('');
	let findCount = $state(0);
	let findCurrent = $state(0);
	let emitted: string | null = null;

	onMount(() => {
		emitted = notes;
		editor = new Editor({
			element: editorHost,
			extensions: notebookEditorExtensions({
				onOpenFind: () => (findOpen = true),
				onEscape: () => {
					if (!findOpen) return false;
					closeFind();
					return true;
				}
			}),
			content: notes,
			contentType: 'markdown',
			editorProps: {
				attributes: {
					'aria-label': 'Notebook notes',
					'aria-multiline': 'true',
					class:
						'markdown-content prose prose-sm min-h-full max-w-none px-4 pt-3 pb-9 dark:prose-invert focus:outline-none'
				}
			},
			onUpdate: ({ editor: instance, transaction }) => {
				if (!transaction.docChanged) return;
				emitted = instance.getMarkdown();
				notes = emitted;
				onInput();
			},
			onTransaction: ({ editor: instance }) => syncEditorState(instance)
		});
		syncEditorState(editor);
	});

	onDestroy(() => editor?.destroy());

	$effect(() => {
		const value = notes;
		if (!editor || value === emitted) return;
		emitted = value;
		editor.commands.setContent(value, { contentType: 'markdown', emitUpdate: false });
	});

	$effect(() => {
		const query = findOpen ? findQuery : '';
		if (!editor || findPluginKey.getState(editor.state)?.query === query) return;
		editor.commands.setFindQuery(query);
	});

	function syncEditorState(instance: Editor): void {
		formatting = formattingState(instance);
		const find = findPluginKey.getState(instance.state);
		findCount = find?.matches.length ?? 0;
		findCurrent = find?.current ?? 0;
	}

	function runCommand(command: EditorCommand): void {
		if (editor) runEditorCommand(editor, command);
	}

	function runClipboard(action: ClipboardAction): void {
		if (!editor) return;
		runClipboardAction(editor, action).catch((error: unknown) => {
			toast.error(`Clipboard unavailable: ${error instanceof Error ? error.message : error}`);
		});
	}

	function focusEditor(): void {
		editor?.commands.focus();
	}

	function closeFind(): void {
		findOpen = false;
		focusEditor();
	}

	export function insertCitation(source: NotebookSourceItem): boolean {
		if (!editor) return false;
		const { label, href } = notebookCitationLink(source);
		const { doc, selection } = editor.state;
		const { prefix, suffix } = citationSpacing(
			doc.textBetween(Math.max(0, selection.from - 1), selection.from),
			doc.textBetween(selection.to, Math.min(doc.content.size, selection.to + 1))
		);
		return editor
			.chain()
			.focus()
			.insertContent([
				{ type: 'text', text: `${prefix}(` },
				{ type: 'text', text: label, marks: [{ type: 'link', attrs: { href } }] },
				{ type: 'text', text: `)${suffix}` }
			])
			.run();
	}
</script>

<div class="grid min-h-0 grid-rows-[auto_1fr]">
	<NotebookEditorRibbon {formatting} onCommand={runCommand} onFocusEditor={focusEditor} />
	<div class="relative min-h-0">
		<NotebookEditorContextMenu
			{formatting}
			onClipboard={runClipboard}
			onCommand={runCommand}
			onFocusEditor={focusEditor}
		>
			{#snippet children(props)}
				<div {...props} bind:this={editorHost} class="h-full min-h-0 overflow-auto"></div>
			{/snippet}
		</NotebookEditorContextMenu>
		{#if findOpen}
			<div class="absolute right-3 bottom-8 z-10">
				<NotebookEditorFindBar
					activeIndex={findCount ? findCurrent + 1 : 0}
					count={findCount}
					onClose={closeFind}
					onNext={() => editor?.commands.gotoFindMatch(1)}
					onPrev={() => editor?.commands.gotoFindMatch(-1)}
					bind:query={findQuery}
				/>
			</div>
		{/if}
		<div
			class="pointer-events-none absolute right-3 bottom-2 text-[11px] text-muted-foreground"
			role="status"
			aria-live="polite"
		>
			{characterCount.toLocaleString()} characters
		</div>
	</div>
</div>
