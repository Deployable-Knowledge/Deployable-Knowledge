<script lang="ts">
	import ArrowUp from '@lucide/svelte/icons/arrow-up';
	import Brain from '@lucide/svelte/icons/brain';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import MessageSquarePlus from '@lucide/svelte/icons/message-square-plus';
	import Square from '@lucide/svelte/icons/square';
	import SquareSlash from '@lucide/svelte/icons/square-slash';
	import { ActionIcon } from '#lib/components/app/actions';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import { Textarea } from '#lib/components/ui/textarea';
	import { REASONING_PRESETS, type ReasoningEffort } from '#lib/constants';
	import type { ChatContextMode } from '#lib/enums';
	import type { Skill } from '#lib/types';
	import ChatModeMenu from './ChatModeMenu.svelte';
	import ChatModelMenu from './ChatModelMenu.svelte';
	import ChatSkillMenu from './ChatSkillMenu.svelte';
	import ChatToolsToggle from './ChatToolsToggle.svelte';
	import { matchSkills, resolveSkillInvocation, skillQuery } from './chat-skill-command';

	interface Props {
		busy?: boolean;
		draft: string;
		mode: ChatContextMode;
		onModeChange: (mode: ChatContextMode) => void;
		onNewChat: () => void;
		onReasoningEffortChange: (effort: ReasoningEffort) => void;
		onStop: () => void;
		onSubmit: () => void;
		onToolsChange: (enabled: boolean) => void;
		reasoningEffort: ReasoningEffort;
		searchToolActive?: boolean;
		skills: readonly Skill[];
		toolsAvailable?: boolean;
		toolsEnabled?: boolean;
		toolsSupported?: boolean;
	}

	let {
		busy = false,
		draft = $bindable(),
		mode,
		onModeChange,
		onNewChat,
		onReasoningEffortChange,
		onStop,
		onSubmit,
		onToolsChange,
		reasoningEffort,
		searchToolActive = false,
		skills,
		toolsAvailable = true,
		toolsEnabled = false,
		toolsSupported = true
	}: Props = $props();

	const listId = $props.id();
	let composer = $state<HTMLDivElement | null>(null);
	let activeIndex = $state(0);
	let dismissedDraft = $state<string | null>(null);

	const query = $derived(skillQuery(draft));
	const matches = $derived(query === null ? [] : matchSkills(skills, query));
	const menuOpen = $derived(
		query !== null &&
			!busy &&
			draft !== dismissedDraft &&
			(matches.length > 0 || (!skills.length && !query))
	);
	const highlightIndex = $derived(Math.min(activeIndex, matches.length - 1));
	const highlightedId = $derived(
		menuOpen && matches[highlightIndex] ? `${listId}-${matches[highlightIndex].id}` : undefined
	);
	const invokedSkill = $derived(resolveSkillInvocation(draft, skills).skill);

	function selectSkill(skill: Skill): void {
		draft = `/${skill.name} `;
		activeIndex = 0;
	}

	function handleMenuKey(event: KeyboardEvent): boolean {
		if (event.key === 'Escape') {
			dismissedDraft = draft;
			return true;
		}
		if (!matches.length) return false;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			const step = event.key === 'ArrowDown' ? 1 : -1;
			activeIndex = (highlightIndex + step + matches.length) % matches.length;
			return true;
		}
		if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
			selectSkill(matches[highlightIndex]);
			return true;
		}
		return false;
	}

	function handleKeydown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (menuOpen && handleMenuKey(event)) {
			event.preventDefault();
			return;
		}
		if (event.key !== 'Enter' || event.shiftKey) return;
		event.preventDefault();
		if (!busy && draft.trim()) onSubmit();
	}
</script>

<form
	class="mt-3 shrink-0 px-2 pb-2"
	onsubmit={(event) => {
		event.preventDefault();
		onSubmit();
	}}
>
	<div
		bind:this={composer}
		class="dk-panel overflow-hidden rounded-3xl border bg-card/90 shadow-md transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25"
	>
		{#if invokedSkill && !menuOpen}
			<div class="px-4 pt-2.5">
				<Badge>
					<SquareSlash aria-hidden="true" />
					<span class="sr-only">Skill</span>
					{invokedSkill.name}
				</Badge>
			</div>
		{/if}
		<Textarea
			aria-activedescendant={highlightedId}
			aria-autocomplete="list"
			aria-controls={menuOpen ? listId : undefined}
			aria-label="Message"
			class="max-h-40 min-h-16 resize-none overflow-y-auto rounded-none border-0 bg-transparent px-4 pt-3 pb-1 shadow-none focus-visible:border-transparent focus-visible:ring-0"
			disabled={busy}
			name="message"
			oninput={() => (activeIndex = 0)}
			onkeydown={handleKeydown}
			placeholder="Type a message or / for skills…"
			rows={2}
			bind:value={draft}
		/>
		<div class="flex items-center justify-between gap-2 px-2.5 pb-2">
			<div class="flex items-center gap-1">
				<ChatModeMenu disabled={busy} {mode} {onModeChange} {searchToolActive} />
				<ChatToolsToggle
					available={toolsAvailable}
					disabled={busy}
					enabled={toolsEnabled}
					onToggle={onToolsChange}
					supported={toolsSupported}
				/>
				<ActionIcon
					class="size-8 rounded-full bg-transparent text-foreground/40 shadow-none hover:bg-transparent hover:text-foreground active:translate-y-0 active:text-foreground dark:text-muted-foreground dark:hover:text-foreground"
					label="Start a new chat — the current chat stays in history"
					onclick={onNewChat}
					variant="ghost"
				>
					<MessageSquarePlus />
				</ActionIcon>
				<DropdownMenu.Root>
					<DropdownMenu.Trigger disabled={busy}>
						{#snippet child({ props })}
							<Button
								{...props}
								aria-label={`Reasoning effort: ${REASONING_PRESETS[reasoningEffort].label}`}
								class="h-8 rounded-full text-muted-foreground hover:text-foreground aria-expanded:text-foreground"
								disabled={busy}
								size="sm"
								variant="ghost"
							>
								<Brain aria-hidden="true" class="size-3.5" />
								{REASONING_PRESETS[reasoningEffort].label}
								<ChevronDown class="size-3" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="start" class="w-40" side="top" sideOffset={8}>
						<DropdownMenu.Label>Reasoning effort</DropdownMenu.Label>
						<DropdownMenu.RadioGroup
							onValueChange={(value) => onReasoningEffortChange(value as ReasoningEffort)}
							value={reasoningEffort}
						>
							{#each Object.entries(REASONING_PRESETS) as [value, preset] (value)}
								<DropdownMenu.RadioItem {value}>{preset.label}</DropdownMenu.RadioItem>
							{/each}
						</DropdownMenu.RadioGroup>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			</div>
			<div class="flex min-w-0 items-center gap-2">
				<ChatModelMenu disabled={busy} />
				<ActionIcon
					class="size-8 rounded-full shadow-sm"
					disabled={!busy && !draft.trim()}
					label={busy ? 'Stop generation' : 'Send message'}
					onclick={(event) => {
						if (!busy) return;
						event.preventDefault();
						onStop();
					}}
					type={busy ? 'button' : 'submit'}
				>
					{#if busy}
						<Square aria-hidden="true" class="size-3.5 fill-current" />
					{:else}
						<ArrowUp />
					{/if}
				</ActionIcon>
			</div>
		</div>
	</div>
</form>

<ChatSkillMenu
	activeIndex={highlightIndex}
	anchor={composer}
	{listId}
	onDismiss={() => (dismissedDraft = draft)}
	onSelect={selectSkill}
	open={menuOpen}
	skills={matches}
/>
