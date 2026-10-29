<script lang="ts">
	import { Button } from '#lib/components/ui/button';
	import { Checkbox } from '#lib/components/ui/checkbox';
	import * as Dialog from '#lib/components/ui/dialog';
	import { Input } from '#lib/components/ui/input';
	import { Label } from '#lib/components/ui/label';
	import { Textarea } from '#lib/components/ui/textarea';
	import {
		SKILL_DESCRIPTION_MAX_LENGTH,
		SKILL_NAME_MAX_LENGTH,
		SKILL_NAME_PATTERN
	} from '#lib/constants';
	import type { ApiSkillRequest, Skill } from '#lib/types';

	interface Props {
		onOpenChange: (open: boolean) => void;
		onSave: (value: ApiSkillRequest) => Promise<void> | void;
		open: boolean;
		skill?: Skill | null;
	}

	let { onOpenChange, onSave, open, skill = null }: Props = $props();
	let name = $state('');
	let description = $state('');
	let instructions = $state('');
	let modelInvocable = $state(true);
	let saving = $state(false);

	const nameValid = $derived(SKILL_NAME_PATTERN.test(name.trim()));
	const submittable = $derived(nameValid && instructions.trim().length > 0 && !saving);

	$effect(() => {
		if (!open) return;
		name = skill?.name ?? '';
		description = skill?.description ?? '';
		instructions = skill?.instructions ?? '';
		modelInvocable = skill?.modelInvocable ?? true;
	});

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!submittable) return;
		saving = true;
		try {
			await onSave({
				name: name.trim(),
				description: description.trim(),
				instructions: instructions.trim(),
				modelInvocable
			});
		} finally {
			saving = false;
		}
	}
</script>

<Dialog.Root {onOpenChange} {open}>
	<Dialog.Content class="sm:max-w-xl">
		<form class="grid gap-4" onsubmit={submit}>
			<Dialog.Header>
				<Dialog.Title>{skill ? `Edit /${skill.name}` : 'New skill'}</Dialog.Title>
				<Dialog.Description>
					Run a skill by typing its name after a slash in chat. Its instructions apply to that
					message, and any text after the name becomes your request.
				</Dialog.Description>
			</Dialog.Header>

			<div class="grid gap-2">
				<Label for="skill-name">Name</Label>
				<div class="relative">
					<span
						aria-hidden="true"
						class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 font-mono text-sm text-muted-foreground"
					>
						/
					</span>
					<Input
						aria-describedby="skill-name-hint"
						aria-invalid={name.trim() !== '' && !nameValid}
						autocapitalize="off"
						autocomplete="off"
						autofocus
						bind:value={name}
						class="pl-6 font-mono"
						id="skill-name"
						maxlength={SKILL_NAME_MAX_LENGTH}
						pattern={SKILL_NAME_PATTERN.source}
						placeholder="summarize"
						required
						spellcheck="false"
					/>
				</div>
				<p class="m-0 text-xs text-muted-foreground" id="skill-name-hint">
					Lowercase letters, numbers, and hyphens.
				</p>
			</div>
			<div class="grid gap-2">
				<Label for="skill-description">Description</Label>
				<Input
					aria-describedby="skill-description-hint"
					bind:value={description}
					id="skill-description"
					maxlength={SKILL_DESCRIPTION_MAX_LENGTH}
					placeholder="Condense text into key points"
				/>
				<p class="m-0 text-xs text-muted-foreground" id="skill-description-hint">
					Shown in the slash menu, and tells the model when this skill applies.
				</p>
			</div>
			<div class="grid gap-2">
				<Label for="skill-instructions">Instructions</Label>
				<Textarea
					bind:value={instructions}
					class="max-h-[50dvh] min-h-56"
					id="skill-instructions"
					placeholder="Summarize the user's text in five bullet points, then list any open questions."
					required
				/>
			</div>
			<div class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2.5">
				<Checkbox bind:checked={modelInvocable} id="skill-model-invocable" />
				<div class="grid gap-0.5">
					<Label class="text-sm font-medium" for="skill-model-invocable">
						Let the model use this skill on its own
					</Label>
					<p class="m-0 text-xs text-muted-foreground">
						Requires the Skills tool to be enabled under Tools.
					</p>
				</div>
			</div>

			<Dialog.Footer>
				<Button onclick={() => onOpenChange(false)} variant="outline">Cancel</Button>
				<Button disabled={!submittable} type="submit"
					>{skill ? 'Save changes' : 'Create skill'}</Button
				>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
