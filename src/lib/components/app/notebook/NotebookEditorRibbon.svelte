<script lang="ts">
	import Ban from '@lucide/svelte/icons/ban';
	import Baseline from '@lucide/svelte/icons/baseline';
	import Bold from '@lucide/svelte/icons/bold';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Code from '@lucide/svelte/icons/code';
	import Grid2x2Plus from '@lucide/svelte/icons/grid-2x2-plus';
	import Highlighter from '@lucide/svelte/icons/highlighter';
	import Italic from '@lucide/svelte/icons/italic';
	import Link from '@lucide/svelte/icons/link';
	import List from '@lucide/svelte/icons/list';
	import ListChecks from '@lucide/svelte/icons/list-checks';
	import ListIndentDecrease from '@lucide/svelte/icons/list-indent-decrease';
	import ListIndentIncrease from '@lucide/svelte/icons/list-indent-increase';
	import ListOrdered from '@lucide/svelte/icons/list-ordered';
	import Redo2 from '@lucide/svelte/icons/redo-2';
	import RemoveFormatting from '@lucide/svelte/icons/remove-formatting';
	import SeparatorHorizontal from '@lucide/svelte/icons/separator-horizontal';
	import SquareCode from '@lucide/svelte/icons/square-code';
	import Strikethrough from '@lucide/svelte/icons/strikethrough';
	import Table from '@lucide/svelte/icons/table';
	import TextQuote from '@lucide/svelte/icons/text-quote';
	import Undo2 from '@lucide/svelte/icons/undo-2';
	import { ActionIcon } from '#lib/components/app/actions';
	import { Button } from '#lib/components/ui/button';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import { Input } from '#lib/components/ui/input';
	import * as Popover from '#lib/components/ui/popover';
	import { Separator } from '#lib/components/ui/separator';
	import type {
		ActionCommand,
		BlockStyle,
		EditorCommand,
		FormattingState,
		ToggleCommand
	} from './notebook-editing';
	import { TABLE_EDIT_GROUPS } from './notebook-table-edits';

	interface Props {
		formatting: FormattingState;
		onCommand: (command: EditorCommand) => void;
		onFocusEditor: () => void;
	}

	interface RibbonButton<Command> {
		command: Command;
		label: string;
		icon: typeof Bold;
	}

	let { formatting, onCommand, onFocusEditor }: Props = $props();
	let colorOpen = $state(false);
	let highlightOpen = $state(false);
	let linkOpen = $state(false);
	let linkDraft = $state('');

	const HISTORY: RibbonButton<ActionCommand>[] = [
		{ command: 'undo', label: 'Undo (Ctrl+Z)', icon: Undo2 },
		{ command: 'redo', label: 'Redo (Ctrl+Shift+Z)', icon: Redo2 }
	];

	const INLINE_FORMATS: RibbonButton<ToggleCommand>[] = [
		{ command: 'bold', label: 'Bold (Ctrl+B)', icon: Bold },
		{ command: 'italic', label: 'Italic (Ctrl+I)', icon: Italic },
		{ command: 'strikethrough', label: 'Strikethrough', icon: Strikethrough },
		{ command: 'code', label: 'Inline code', icon: Code }
	];

	const LISTS: RibbonButton<ToggleCommand>[] = [
		{ command: 'bullet-list', label: 'Bulleted list', icon: List },
		{ command: 'ordered-list', label: 'Numbered list', icon: ListOrdered },
		{ command: 'task-list', label: 'Checklist', icon: ListChecks }
	];

	const INDENTS: RibbonButton<ActionCommand>[] = [
		{ command: 'outdent', label: 'Decrease indent (Shift+Tab)', icon: ListIndentDecrease },
		{ command: 'indent', label: 'Increase indent (Tab)', icon: ListIndentIncrease }
	];

	const BLOCKS: RibbonButton<ToggleCommand>[] = [
		{ command: 'quote', label: 'Quote', icon: TextQuote },
		{ command: 'code-block', label: 'Code block', icon: SquareCode }
	];

	const BLOCK_STYLES: { style: BlockStyle; label: string; class: string }[] = [
		{ style: 'paragraph', label: 'Normal text', class: 'text-xs' },
		{ style: 'h1', label: 'Heading 1', class: 'text-lg font-bold' },
		{ style: 'h2', label: 'Heading 2', class: 'text-base font-bold' },
		{ style: 'h3', label: 'Heading 3', class: 'text-sm font-semibold' },
		{ style: 'h4', label: 'Heading 4', class: 'text-xs font-semibold' }
	];

	const COLORS = [
		{ label: 'Red', value: '#dc2626' },
		{ label: 'Orange', value: '#ea580c' },
		{ label: 'Yellow', value: '#ca8a04' },
		{ label: 'Green', value: '#16a34a' },
		{ label: 'Blue', value: '#2563eb' },
		{ label: 'Violet', value: '#7c3aed' },
		{ label: 'Pink', value: '#db2777' },
		{ label: 'Gray', value: '#6b7280' }
	];

	// Pale enough that the dark text set by .dk-text-highlight stays readable
	const HIGHLIGHTS = [
		{ label: 'Yellow', value: '#fef08a' },
		{ label: 'Orange', value: '#fed7aa' },
		{ label: 'Green', value: '#bbf7d0' },
		{ label: 'Teal', value: '#99f6e4' },
		{ label: 'Blue', value: '#bfdbfe' },
		{ label: 'Violet', value: '#e9d5ff' },
		{ label: 'Pink', value: '#fbcfe8' },
		{ label: 'Gray', value: '#e5e7eb' }
	];

	const blockStyleLabel = $derived(
		BLOCK_STYLES.find(({ style }) => style === formatting.blockStyle)?.label ?? 'Style'
	);
	const canChangeBlockStyle = $derived(
		BLOCK_STYLES.some(({ style }) => formatting.available.has(style))
	);

	function pickColor(value: string | null): void {
		colorOpen = false;
		onCommand({ color: value });
	}

	function pickHighlight(value: string | null): void {
		highlightOpen = false;
		onCommand({ highlight: value });
	}

	function setLinkOpen(open: boolean): void {
		if (open) linkDraft = formatting.linkHref ?? 'https://';
		linkOpen = open;
	}

	function applyLink(href: string | null): void {
		linkOpen = false;
		onCommand({ link: href });
	}

	function submitLink(event: SubmitEvent): void {
		event.preventDefault();
		applyLink(linkDraft.trim() || null);
	}

	function pickBlockStyle(value: string): void {
		const entry = BLOCK_STYLES.find(({ style }) => style === value);
		if (entry) onCommand({ block: entry.style });
	}

	function returnFocusToEditor(event: Event): void {
		event.preventDefault();
		onFocusEditor();
	}
</script>

{#snippet toggle(button: RibbonButton<ToggleCommand>)}
	<ActionIcon
		class="size-7"
		disabled={!formatting.available.has(button.command)}
		label={button.label}
		pressed={formatting.active.has(button.command)}
		variant={formatting.active.has(button.command) ? 'default' : 'ghost'}
		onclick={() => onCommand(button.command)}><button.icon /></ActionIcon
	>
{/snippet}

{#snippet action(button: RibbonButton<ActionCommand>)}
	<ActionIcon
		class="size-7"
		disabled={!formatting.available.has(button.command)}
		label={button.label}
		variant="ghost"
		onclick={() => onCommand(button.command)}><button.icon /></ActionIcon
	>
{/snippet}

{#snippet colorBar(color: string)}
	<span
		class="absolute inset-x-1.5 bottom-1 h-0.5 rounded-full"
		style={`background-color: ${color}`}
	></span>
{/snippet}

{#snippet swatch(color: string)}
	<span class="size-4 rounded-full border border-border/60" style={`background-color: ${color}`}
	></span>
{/snippet}

{#snippet divider()}
	<Separator orientation="vertical" class="mx-1 h-5!" />
{/snippet}

<div
	class="flex flex-wrap items-center gap-0.5 border-b bg-card/50 px-2 py-1"
	role="toolbar"
	aria-label="Text formatting"
>
	{#each HISTORY as button (button.command)}{@render action(button)}{/each}
	{@render divider()}
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button
					{...props}
					aria-label={`Paragraph style: ${blockStyleLabel}`}
					class="h-7 w-28 justify-between px-2 font-normal"
					disabled={!canChangeBlockStyle}
					size="sm"
					variant="ghost"
				>
					<span class="truncate">{blockStyleLabel}</span>
					<ChevronDown class="size-3.5 text-muted-foreground" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-44" onCloseAutoFocus={returnFocusToEditor}>
			<DropdownMenu.RadioGroup value={formatting.blockStyle ?? ''} onValueChange={pickBlockStyle}>
				{#each BLOCK_STYLES as entry (entry.style)}
					<DropdownMenu.RadioItem
						class={entry.class}
						disabled={!formatting.available.has(entry.style)}
						value={entry.style}>{entry.label}</DropdownMenu.RadioItem
					>
				{/each}
			</DropdownMenu.RadioGroup>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
	{@render divider()}
	{#each INLINE_FORMATS as button (button.command)}{@render toggle(button)}{/each}
	<Popover.Root bind:open={colorOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<ActionIcon class="relative size-7" label="Text color" triggerProps={props} variant="ghost"
					><Baseline />{@render colorBar(formatting.color ?? 'currentColor')}</ActionIcon
				>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="start" class="w-auto p-2" onCloseAutoFocus={returnFocusToEditor}>
			<div class="grid grid-cols-5 gap-0.5">
				{#each COLORS as color (color.value)}
					<ActionIcon
						class="size-7"
						label={`${color.label} text`}
						pressed={formatting.color === color.value}
						variant={formatting.color === color.value ? 'default' : 'ghost'}
						onclick={() => pickColor(color.value)}>{@render swatch(color.value)}</ActionIcon
					>
				{/each}
				<ActionIcon
					class="size-7"
					label="Default color"
					variant="ghost"
					onclick={() => pickColor(null)}><Ban /></ActionIcon
				>
			</div>
		</Popover.Content>
	</Popover.Root>
	<Popover.Root bind:open={highlightOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<ActionIcon class="relative size-7" label="Highlight" triggerProps={props} variant="ghost"
					><Highlighter />{@render colorBar(formatting.highlight ?? 'transparent')}</ActionIcon
				>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="start" class="w-auto p-2" onCloseAutoFocus={returnFocusToEditor}>
			<div class="grid grid-cols-5 gap-0.5">
				{#each HIGHLIGHTS as color (color.value)}
					<ActionIcon
						class="size-7"
						label={`${color.label} highlight`}
						pressed={formatting.highlight === color.value}
						variant={formatting.highlight === color.value ? 'default' : 'ghost'}
						onclick={() => pickHighlight(color.value)}>{@render swatch(color.value)}</ActionIcon
					>
				{/each}
				<ActionIcon
					class="size-7"
					label="No highlight"
					variant="ghost"
					onclick={() => pickHighlight(null)}><Ban /></ActionIcon
				>
			</div>
		</Popover.Content>
	</Popover.Root>
	<ActionIcon
		class="size-7"
		disabled={!formatting.available.has('clear-formatting')}
		label="Clear formatting"
		variant="ghost"
		onclick={() => onCommand('clear-formatting')}><RemoveFormatting /></ActionIcon
	>
	{@render divider()}
	{#each LISTS as button (button.command)}{@render toggle(button)}{/each}
	{#each INDENTS as button (button.command)}{@render action(button)}{/each}
	{@render divider()}
	{#each BLOCKS as button (button.command)}{@render toggle(button)}{/each}
	<ActionIcon
		class="size-7"
		disabled={!formatting.available.has('horizontal-rule')}
		label="Horizontal line"
		variant="ghost"
		onclick={() => onCommand('horizontal-rule')}><SeparatorHorizontal /></ActionIcon
	>
	{@render divider()}
	<Popover.Root bind:open={() => linkOpen, setLinkOpen}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<ActionIcon
					class="size-7"
					label="Link"
					pressed={formatting.linkHref !== null}
					triggerProps={props}
					variant={formatting.linkHref !== null ? 'default' : 'ghost'}><Link /></ActionIcon
				>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content align="start" class="w-80 p-2" onCloseAutoFocus={returnFocusToEditor}>
			<form class="flex items-center gap-1.5" onsubmit={submitLink}>
				<Input
					bind:value={linkDraft}
					aria-label="Link address"
					class="h-7 min-w-0 flex-1 text-xs"
					placeholder="https://"
				/>
				<Button size="sm" type="submit">Apply</Button>
				{#if formatting.linkHref !== null}
					<Button size="sm" variant="outline" onclick={() => applyLink(null)}>Remove</Button>
				{/if}
			</form>
		</Popover.Content>
	</Popover.Root>
	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<ActionIcon class="size-7" label="Table" triggerProps={props} variant="ghost"
					><Table /></ActionIcon
				>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-48" onCloseAutoFocus={returnFocusToEditor}>
			<DropdownMenu.Item
				disabled={!formatting.available.has('insert-table')}
				onSelect={() => onCommand('insert-table')}
			>
				<Grid2x2Plus />
				Insert table
			</DropdownMenu.Item>
			{#each TABLE_EDIT_GROUPS as group, index (index)}
				<DropdownMenu.Separator />
				{#each group as edit (edit.command)}
					<DropdownMenu.Item
						disabled={!formatting.available.has(edit.command)}
						onSelect={() => onCommand(edit.command)}
						variant={edit.destructive ? 'destructive' : 'default'}
					>
						<edit.icon />
						{edit.label}
					</DropdownMenu.Item>
				{/each}
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>
</div>
