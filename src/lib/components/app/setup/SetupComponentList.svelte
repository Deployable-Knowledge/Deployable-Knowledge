<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import { Button } from '#lib/components/ui/button';
	import { Progress } from '#lib/components/ui/progress';
	import { setupStore } from '#lib/stores';
	import type { ApiSetupComponentStatus } from '#lib/types';
	import { formatBytes } from '#lib/utils';
	import { SETUP_COMPONENT_DETAILS } from './setup-catalog';

	const complete = $derived(setupStore.status !== null && setupStore.pending.length === 0);
</script>

{#snippet componentState(component: ApiSetupComponentStatus)}
	{#if component.installed}
		<span class="flex items-center gap-1.5 text-xs text-muted-foreground">
			<CircleCheck class="size-4 text-primary" />
			Installed
		</span>
	{:else if setupStore.failedId === component.id}
		<span class="flex items-center gap-1.5 text-xs text-destructive">
			<CircleAlert class="size-4" />
			Failed
		</span>
	{:else}
		<span class="text-xs text-muted-foreground tabular-nums">
			{formatBytes(SETUP_COMPONENT_DETAILS[component.id].sizeBytes)}
		</span>
	{/if}
{/snippet}

<section aria-label="Components" class="grid gap-4">
	{#if setupStore.status}
		<ul class="m-0 grid list-none divide-y rounded-xl border bg-sheet p-0 shadow-window">
			{#each setupStore.status.components as component (component.id)}
				{@const details = SETUP_COMPONENT_DETAILS[component.id]}
				<li class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
					<span class="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card">
						<details.icon class="size-5" />
					</span>
					<div class="grid min-w-0 gap-1.5">
						<span class="text-sm font-semibold">{details.name}</span>
						{#if setupStore.installingId === component.id}
							<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
								<Progress
									label={`Downloading ${details.name}`}
									value={setupStore.progress?.percent ?? 0}
								/>
								<span class="text-xs text-muted-foreground tabular-nums">
									{setupStore.progress?.message ?? 'Starting'}
								</span>
							</div>
						{/if}
					</div>
					{@render componentState(component)}
				</li>
			{/each}
		</ul>
	{:else if !setupStore.error}
		<p class="m-0 text-center text-sm text-muted-foreground">Checking installed components.</p>
	{/if}

	{#if setupStore.error}
		<p class="m-0 text-sm text-destructive" role="alert">{setupStore.error}</p>
	{/if}

	<div class="flex justify-end gap-2">
		{#if complete}
			<Button onclick={() => setupStore.showModels()}>Continue</Button>
		{:else}
			<Button onclick={() => setupStore.showModels()} variant="ghost">Skip for now</Button>
			{#if setupStore.error}
				<Button onclick={() => void setupStore.retry()}>Retry</Button>
			{/if}
		{/if}
	</div>
</section>
