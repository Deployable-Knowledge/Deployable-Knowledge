<script lang="ts">
	import Pencil from '@lucide/svelte/icons/pencil';
	import Plus from '@lucide/svelte/icons/plus';
	import SquareSlash from '@lucide/svelte/icons/square-slash';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { toast } from 'svelte-sonner';
	import { ActionIcon } from '#lib/components/app/actions';
	import { DialogConfirmation, DialogSkill } from '#lib/components/app/dialogs';
	import { Badge } from '#lib/components/ui/badge';
	import { Button } from '#lib/components/ui/button';
	import { skillsStore } from '#lib/stores';
	import type { ApiSkillRequest, Skill } from '#lib/types';
	import SettingsFieldGroup from './SettingsFieldGroup.svelte';

	let editorOpen = $state(false);
	let editing = $state<Skill | null>(null);
	let pendingRemoval = $state<Skill | null>(null);

	function openEditor(skill: Skill | null): void {
		editing = skill;
		editorOpen = true;
	}

	async function save(value: ApiSkillRequest): Promise<void> {
		try {
			if (editing) await skillsStore.update(editing.id, value);
			else await skillsStore.create(value);
			editorOpen = false;
			toast.success(editing ? 'Skill saved' : 'Skill created');
		} catch (error) {
			toast.error(message(error));
		}
	}

	async function remove(): Promise<void> {
		const skill = pendingRemoval;
		pendingRemoval = null;
		if (!skill) return;
		try {
			await skillsStore.remove(skill.id);
			toast.success('Skill removed');
		} catch (error) {
			toast.error(message(error));
		}
	}

	function message(error: unknown): string {
		return error instanceof Error ? error.message : String(error);
	}
</script>

<SettingsFieldGroup
	hint="Type / in chat to pick a skill. The text after its name becomes your message."
	icon={SquareSlash}
	title="Skills"
>
	{#if skillsStore.error}
		<p class="m-0 text-sm text-destructive">Skills could not be loaded: {skillsStore.error}</p>
	{:else if skillsStore.skills.length}
		<ul class="m-0 grid list-none gap-2 p-0">
			{#each skillsStore.skills as skill (skill.id)}
				<li class="flex items-center gap-3 rounded-xl border bg-card/50 p-3">
					<div class="grid min-w-0 flex-1 gap-0.5">
						<span class="flex min-w-0 items-center gap-2 text-sm font-semibold">
							<span class="truncate font-mono">/{skill.name}</span>
							{#if skill.modelInvocable}
								<Badge variant="tertiary">Model can use</Badge>
							{/if}
						</span>
						<span class="truncate text-xs text-muted-foreground">
							{skill.description || 'No description'}
						</span>
					</div>
					<ActionIcon label={`Edit /${skill.name}`} onclick={() => openEditor(skill)}>
						<Pencil />
					</ActionIcon>
					<ActionIcon label={`Remove /${skill.name}`} onclick={() => (pendingRemoval = skill)}>
						<Trash2 />
					</ActionIcon>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="m-0 text-sm text-muted-foreground">No skills yet.</p>
	{/if}
	<Button class="w-fit" onclick={() => openEditor(null)} variant="outline">
		<Plus /> New skill
	</Button>
</SettingsFieldGroup>

<DialogSkill
	onOpenChange={(open) => (editorOpen = open)}
	onSave={save}
	open={editorOpen}
	skill={editing}
/>
<DialogConfirmation
	confirmLabel="Remove"
	description={`${pendingRemoval ? `/${pendingRemoval.name}` : 'This skill'} will be removed. Past messages keep their skill label.`}
	onConfirm={remove}
	onOpenChange={(open) => !open && (pendingRemoval = null)}
	open={pendingRemoval !== null}
	title="Remove skill?"
/>
