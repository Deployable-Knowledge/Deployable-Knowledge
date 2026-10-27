<script lang="ts">
	import Boxes from '@lucide/svelte/icons/boxes';
	import Database from '@lucide/svelte/icons/database';
	import HeartPulse from '@lucide/svelte/icons/heart-pulse';
	import Search from '@lucide/svelte/icons/search';
	import type { Component } from 'svelte';
	import * as Card from '#lib/components/ui/card';
	import { Skeleton } from '#lib/components/ui/skeleton';
	import type { ApiDiagnosticsSnapshot } from '#lib/types';
	import { formatBytes } from '#lib/utils';

	type Health = ApiDiagnosticsSnapshot['health'];
	type HealthValue = Health[keyof Health];
	type Tone = 'success' | 'warning' | 'destructive';

	interface HealthCheck {
		icon: Component;
		key: keyof Health;
		label: string;
	}

	interface Props {
		snapshot: ApiDiagnosticsSnapshot | null;
	}

	let { snapshot }: Props = $props();

	const headingId = $props.id();

	const checks: HealthCheck[] = [
		{ icon: Database, key: 'database', label: 'Database' },
		{ icon: Search, key: 'searchIndex', label: 'Search index' },
		{ icon: Boxes, key: 'embeddingModel', label: 'Embedding model' }
	];

	const healthStates: Record<HealthValue, { label: string; tone: Tone }> = {
		healthy: { label: 'Healthy', tone: 'success' },
		installed: { label: 'Installed', tone: 'success' },
		ready: { label: 'Ready', tone: 'success' },
		missing: { label: 'Missing', tone: 'warning' },
		'out-of-sync': { label: 'Out of sync', tone: 'warning' },
		unavailable: { label: 'Unavailable', tone: 'destructive' }
	};

	const toneClasses: Record<Tone, { dot: string; pill: string }> = {
		success: { dot: 'bg-success', pill: 'border-success/45 bg-success/12' },
		warning: { dot: 'bg-warning', pill: 'border-warning/50 bg-warning/14' },
		destructive: { dot: 'bg-destructive', pill: 'border-destructive/55 bg-destructive/14' }
	};

	function uptimeLabel(totalSeconds: number): string {
		const hours = Math.floor(totalSeconds / 3600);
		const minutes = Math.floor((totalSeconds % 3600) / 60);
		if (hours > 0) return `${hours}h ${minutes}m`;
		if (minutes > 0) return `${minutes}m`;
		return `${totalSeconds}s`;
	}
</script>

<Card.Root aria-labelledby={headingId} class="gap-0 py-0" role="region">
	<Card.Header class="border-b py-2.5 [.border-b]:pb-2.5">
		<h3 class="m-0 flex items-center gap-2 text-sm font-semibold" id={headingId}>
			<HeartPulse class="size-4 text-muted-foreground" />
			System health
		</h3>
		<Card.Description class="text-xs">
			{#if snapshot}
				{snapshot.application.runtimeMode === 'development' ? 'Development' : 'Production'} build
			{:else}
				Checking…
			{/if}
		</Card.Description>
		{#if snapshot}
			<Card.Action>
				<span class="rounded-md border bg-field px-1.5 py-0.5 font-mono text-[11px]">
					v{snapshot.application.version}
				</span>
			</Card.Action>
		{/if}
	</Card.Header>

	<Card.Content class="grid flex-1 content-start gap-1.5 py-3">
		{#each checks as check (check.key)}
			<div class="flex items-center gap-2.5 rounded-lg border bg-field/60 px-2.5 py-1.5">
				<check.icon class="size-4 shrink-0 text-muted-foreground" />
				<span class="min-w-0 flex-1 truncate text-xs font-medium">{check.label}</span>
				{#if snapshot}
					{@const state = healthStates[snapshot.health[check.key]]}
					<span
						class={[
							'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium',
							toneClasses[state.tone].pill
						]}
					>
						<span class={['size-1.5 rounded-full', toneClasses[state.tone].dot]}></span>
						{state.label}
					</span>
				{:else}
					<Skeleton class="h-5 w-20 rounded-full" />
				{/if}
			</div>
		{/each}
	</Card.Content>

	<Card.Footer class="gap-4 border-t py-2 text-[11px] text-muted-foreground [.border-t]:pt-2">
		<span>
			Memory
			<strong class="ml-1 font-mono font-medium text-foreground">
				{snapshot ? formatBytes(snapshot.application.memoryBytes) : '—'}
			</strong>
		</span>
		<span>
			Uptime
			<strong class="ml-1 font-mono font-medium text-foreground">
				{snapshot ? uptimeLabel(snapshot.application.uptimeSeconds) : '—'}
			</strong>
		</span>
	</Card.Footer>
</Card.Root>
