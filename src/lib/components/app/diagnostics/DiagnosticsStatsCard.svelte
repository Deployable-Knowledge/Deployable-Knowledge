<script lang="ts">
	import Library from '@lucide/svelte/icons/library';
	import * as Card from '#lib/components/ui/card';
	import { Skeleton } from '#lib/components/ui/skeleton';
	import type { ApiDiagnosticsSnapshot } from '#lib/types';

	type Counts = ApiDiagnosticsSnapshot['counts'];

	interface Props {
		snapshot: ApiDiagnosticsSnapshot | null;
	}

	let { snapshot }: Props = $props();

	const headingId = $props.id();

	const stats: { key: keyof Counts; label: string }[] = [
		{ key: 'documents', label: 'Documents' },
		{ key: 'activeDocuments', label: 'Active' },
		{ key: 'chunks', label: 'Chunks' },
		{ key: 'syncedFolders', label: 'Synced folders' },
		{ key: 'sessions', label: 'Sessions' },
		{ key: 'messages', label: 'Messages' },
		{ key: 'notebooks', label: 'Notebooks' },
		{ key: 'notebookPages', label: 'Pages' }
	];
</script>

<Card.Root aria-labelledby={headingId} class="gap-0 py-0" role="region">
	<Card.Header class="border-b py-2.5 [.border-b]:pb-2.5">
		<h3 class="m-0 flex items-center gap-2 text-sm font-semibold" id={headingId}>
			<Library class="size-4 text-muted-foreground" />
			Library
		</h3>
		<Card.Description class="text-xs">Stored content across the workspace</Card.Description>
	</Card.Header>

	<Card.Content class="@container flex-1 py-3">
		<dl class="m-0 grid grid-cols-2 gap-1.5 @md:grid-cols-4">
			{#each stats as stat (stat.key)}
				<div class="grid gap-0.5 rounded-lg border bg-field/60 px-2.5 py-1.5">
					<dt class="truncate text-[11px] text-muted-foreground">{stat.label}</dt>
					<dd class="m-0 font-mono text-sm font-medium tabular-nums">
						{#if snapshot}
							{@const value = snapshot.counts[stat.key]}
							{#if value === null}
								<span class="text-muted-foreground">—</span>
							{:else}
								{value.toLocaleString()}
							{/if}
						{:else}
							<Skeleton class="my-0.5 h-4 w-12" />
						{/if}
					</dd>
				</div>
			{/each}
		</dl>
	</Card.Content>
</Card.Root>
