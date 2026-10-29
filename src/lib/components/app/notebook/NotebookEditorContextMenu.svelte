<script lang="ts">
	import ClipboardPaste from '@lucide/svelte/icons/clipboard-paste';
	import Copy from '@lucide/svelte/icons/copy';
	import ExternalLink from '@lucide/svelte/icons/external-link';
	import RemoveFormatting from '@lucide/svelte/icons/remove-formatting';
	import Scissors from '@lucide/svelte/icons/scissors';
	import Unlink from '@lucide/svelte/icons/unlink';
	import type { Snippet } from 'svelte';
	import * as ContextMenu from '#lib/components/ui/context-menu';
	import type { ClipboardAction } from './notebook-clipboard';
	import type { EditorCommand, FormattingState } from './notebook-editing';
	import { openLink } from './notebook-editor-extensions';
	import { TABLE_EDIT_GROUPS } from './notebook-table-edits';

	interface Props {
		children: Snippet<[Record<string, unknown>]>;
		formatting: FormattingState;
		onClipboard: (action: ClipboardAction) => void;
		onCommand: (command: EditorCommand) => void;
		onFocusEditor: () => void;
	}

	let { children, formatting, onClipboard, onCommand, onFocusEditor }: Props = $props();

	let pendingAction: (() => void) | null = null;

	function choose(action: () => void): void {
		pendingAction = action;
	}

	function runPendingAction(open: boolean): void {
		if (open) return;
		const action = pendingAction;
		pendingAction = null;
		action?.();
	}

	function returnFocusToEditor(event: Event): void {
		event.preventDefault();
		onFocusEditor();
	}
</script>

<ContextMenu.Root onOpenChangeComplete={runPendingAction}>
	<ContextMenu.Trigger>
		{#snippet child({ props })}
			{@render children(props)}
		{/snippet}
	</ContextMenu.Trigger>
	<ContextMenu.Content class="w-52" onCloseAutoFocus={returnFocusToEditor}>
		<ContextMenu.Item
			disabled={!formatting.hasSelection}
			onSelect={() => choose(() => onClipboard('cut'))}
		>
			<Scissors />
			Cut
		</ContextMenu.Item>
		<ContextMenu.Item
			disabled={!formatting.hasSelection}
			onSelect={() => choose(() => onClipboard('copy'))}
		>
			<Copy />
			Copy
		</ContextMenu.Item>
		<ContextMenu.Item onSelect={() => choose(() => onClipboard('paste'))}>
			<ClipboardPaste />
			Paste
		</ContextMenu.Item>
		{#if formatting.linkHref !== null}
			{@const href = formatting.linkHref}
			<ContextMenu.Separator />
			<ContextMenu.Item onSelect={() => choose(() => openLink(href))}>
				<ExternalLink />
				Open link
			</ContextMenu.Item>
			<ContextMenu.Item onSelect={() => choose(() => onCommand({ link: null }))}>
				<Unlink />
				Remove link
			</ContextMenu.Item>
		{/if}
		{#if formatting.inTable}
			{#each TABLE_EDIT_GROUPS as group, index (index)}
				<ContextMenu.Separator />
				{#each group as edit (edit.command)}
					<ContextMenu.Item
						disabled={!formatting.available.has(edit.command)}
						onSelect={() => choose(() => onCommand(edit.command))}
						variant={edit.destructive ? 'destructive' : 'default'}
					>
						<edit.icon />
						{edit.label}
					</ContextMenu.Item>
				{/each}
			{/each}
		{/if}
		<ContextMenu.Separator />
		<ContextMenu.Item
			disabled={!formatting.available.has('clear-formatting')}
			onSelect={() => choose(() => onCommand('clear-formatting'))}
		>
			<RemoveFormatting />
			Clear formatting
		</ContextMenu.Item>
	</ContextMenu.Content>
</ContextMenu.Root>
