<script lang="ts">
	import Power from '@lucide/svelte/icons/power';
	import PowerOff from '@lucide/svelte/icons/power-off';
	import Tags from '@lucide/svelte/icons/tags';
	import X from '@lucide/svelte/icons/x';
	import { ActionIcon } from '#lib/components/app/actions';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import type { DocumentSortMode } from '#lib/utils';
	import DocumentSortMenu from './DocumentSortMenu.svelte';
	import DocumentTagChip from './DocumentTagChip.svelte';
	import TagFilterMenu from './TagFilterMenu.svelte';

	interface Props {
		busy?: boolean;
		onActivateTagged: () => void;
		onCreateTag: (tag: string) => Promise<void> | void;
		onDeactivateTagged: () => void;
		onDeleteTag: (tag: string) => void;
		onSortChange: (sort: DocumentSortMode) => void;
		onToggleTag: (tag: string) => void;
		query: string;
		selectedTags: string[];
		sort: DocumentSortMode;
		tags: string[];
	}

	let {
		busy = false,
		onActivateTagged,
		onCreateTag,
		onDeactivateTagged,
		onDeleteTag,
		onSortChange,
		onToggleTag,
		query = $bindable(),
		selectedTags,
		sort,
		tags
	}: Props = $props();
</script>

<div class="grid gap-2">
	<div class="flex items-center gap-2">
		<Input
			aria-label="Filter documents"
			bind:value={query}
			class="flex-1"
			placeholder="Filter documents by name & tags…"
			type="search"
		/>
		{#if query}<ActionIcon label="Clear filter" onclick={() => (query = '')}><X /></ActionIcon>{/if}
		<TagFilterMenu
			onCreate={onCreateTag}
			onDelete={onDeleteTag}
			onToggle={onToggleTag}
			selected={selectedTags}
			{tags}
			title="Filter and manage tags"
			triggerIcon={Tags}
			triggerLabel="Tag Filter"
			triggerTooltip="Filter by tags"
		/>
		<DocumentSortMenu onChange={onSortChange} value={sort} />
	</div>
	{#if selectedTags.length}
		<div class="flex min-h-7 flex-wrap items-center gap-2">
			{#each selectedTags as tag (tag)}
				<DocumentTagChip {tag} onRemove={() => onToggleTag(tag)} />
			{/each}
			<div class="ml-auto flex items-center gap-2">
				<Button disabled={busy} size="sm" variant="outline" onclick={onActivateTagged}>
					<Power /> Activate tagged
				</Button>
				<Button disabled={busy} size="sm" variant="outline" onclick={onDeactivateTagged}>
					<PowerOff /> Deactivate tagged
				</Button>
			</div>
		</div>
	{/if}
</div>
