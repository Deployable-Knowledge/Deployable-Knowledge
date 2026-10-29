<script lang="ts">
	import Settings2 from '@lucide/svelte/icons/settings-2';
	import { Button } from '#lib/components/ui/button';
	import * as Popover from '#lib/components/ui/popover';
	import { Separator } from '#lib/components/ui/separator';
	import { settingsDialogStore } from '#lib/stores';
	import type { Skill } from '#lib/types';

	interface Props {
		activeIndex: number;
		anchor: HTMLElement | null;
		listId: string;
		onDismiss: () => void;
		onSelect: (skill: Skill) => void;
		open: boolean;
		skills: readonly Skill[];
	}

	let { activeIndex, anchor, listId, onDismiss, onSelect, open, skills }: Props = $props();

	$effect(() => {
		const skill = skills[activeIndex];
		if (!open || !skill) return;
		document.getElementById(`${listId}-${skill.id}`)?.scrollIntoView({ block: 'nearest' });
	});
</script>

<Popover.Root onOpenChange={(next) => !next && onDismiss()} {open}>
	<Popover.Content
		align="start"
		class="w-80 p-1.5"
		customAnchor={anchor}
		onCloseAutoFocus={(event) => event.preventDefault()}
		onInteractOutside={(event) => {
			if (anchor?.contains(event.target as Node)) event.preventDefault();
		}}
		onOpenAutoFocus={(event) => event.preventDefault()}
		side="top"
		sideOffset={8}
		trapFocus={false}
	>
		{#if skills.length}
			<ul
				aria-label="Skills"
				class="m-0 grid max-h-64 list-none gap-0.5 overflow-y-auto p-0"
				id={listId}
				role="listbox"
			>
				{#each skills as skill, index (skill.id)}
					<li
						aria-selected={index === activeIndex}
						class={[
							'grid cursor-pointer gap-0.5 rounded-lg px-2.5 py-1.5',
							index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60'
						]}
						id={`${listId}-${skill.id}`}
						onpointerdown={(event) => {
							event.preventDefault();
							onSelect(skill);
						}}
						role="option"
						tabindex="-1"
					>
						<span class="font-mono text-xs font-medium">/{skill.name}</span>
						{#if skill.description}
							<span class="truncate text-xs text-muted-foreground">{skill.description}</span>
						{/if}
					</li>
				{/each}
			</ul>
		{:else}
			<p class="m-0 px-2.5 py-1.5 text-xs text-muted-foreground">
				No skills yet. Create one to reuse instructions with a slash command.
			</p>
		{/if}
		<Separator class="my-1.5" />
		<Button
			class="w-full justify-start"
			onclick={() => {
				onDismiss();
				settingsDialogStore.show('skills');
			}}
			size="sm"
			variant="ghost"
		>
			<Settings2 aria-hidden="true" />
			Manage skills
		</Button>
	</Popover.Content>
</Popover.Root>
