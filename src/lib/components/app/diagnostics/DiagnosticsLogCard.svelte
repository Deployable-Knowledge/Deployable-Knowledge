<script lang="ts">
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import Download from '@lucide/svelte/icons/download';
	import Pause from '@lucide/svelte/icons/pause';
	import Play from '@lucide/svelte/icons/play';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ScrollText from '@lucide/svelte/icons/scroll-text';
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { ActionIcon } from '#lib/components/app/actions';
	import { Button } from '#lib/components/ui/button';
	import * as ButtonGroup from '#lib/components/ui/button-group';
	import * as Card from '#lib/components/ui/card';
	import * as Empty from '#lib/components/ui/empty';
	import { ScrollArea } from '#lib/components/ui/scroll-area';
	import * as Select from '#lib/components/ui/select';
	import { LOG_LEVELS, LOG_SUBSYSTEMS, type LogLevel, type LogSubsystem } from '#lib/constants';
	import { DiagnosticsService } from '#lib/services';
	import { diagnosticsStore } from '#lib/stores';

	type SubsystemFilter = 'all' | LogSubsystem;

	const headingId = $props.id();

	const levelRank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
	const levelLabels: Record<LogLevel, string> = {
		debug: 'Debug',
		info: 'Info',
		warn: 'Warn',
		error: 'Error'
	};
	const levelClasses: Record<LogLevel, { dot: string; row: string; text: string }> = {
		debug: {
			dot: 'bg-muted-foreground/60',
			row: 'border-l-transparent',
			text: 'text-muted-foreground'
		},
		info: { dot: 'bg-primary', row: 'border-l-transparent', text: 'text-primary' },
		warn: { dot: 'bg-warning', row: 'border-l-warning bg-warning/6', text: 'text-warning' },
		error: {
			dot: 'bg-destructive',
			row: 'border-l-destructive bg-destructive/6',
			text: 'text-destructive'
		}
	};
	const subsystemLabels: Record<SubsystemFilter, string> = {
		all: 'All subsystems',
		application: 'Application',
		chat: 'Chat',
		documents: 'Documents',
		embedding: 'Embedding',
		'folder-sync': 'Folder sync',
		models: 'Models',
		ocr: 'OCR',
		search: 'Search'
	};
	const timeFormat = new Intl.DateTimeFormat(undefined, {
		hour: '2-digit',
		hour12: false,
		minute: '2-digit',
		second: '2-digit'
	});

	let minimumLevel = $state<LogLevel>('info');
	let subsystem = $state<SubsystemFilter>('all');
	let viewport = $state<HTMLDivElement | null>(null);

	const visibleEntries = $derived(
		diagnosticsStore.entries.filter(
			(entry) =>
				levelRank[entry.level] >= levelRank[minimumLevel] &&
				(subsystem === 'all' || entry.subsystem === subsystem)
		)
	);

	$effect(() => {
		const entryCount = visibleEntries.length;
		if (!entryCount || diagnosticsStore.paused || !viewport) return;
		void tick().then(() => viewport?.scrollTo({ top: viewport.scrollHeight }));
	});

	async function downloadReport(): Promise<void> {
		try {
			const filename = await DiagnosticsService.downloadReport();
			toast.success(`Downloaded ${filename}`);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Could not download diagnostics.');
		}
	}
</script>

<Card.Root aria-labelledby={headingId} class="@container min-h-0 gap-0 py-0" role="region">
	<Card.Header class="border-b py-2.5 [.border-b]:pb-2.5">
		<h3 class="m-0 flex items-center gap-2 text-sm font-semibold" id={headingId}>
			<ScrollText class="size-4 text-muted-foreground" />
			Logs
		</h3>
		<Card.Description class="text-xs">
			{visibleEntries.length.toLocaleString()} of {diagnosticsStore.entries.length.toLocaleString()}
			entries
		</Card.Description>
		<Card.Action class="flex items-center gap-1.5">
			<ActionIcon
				class="size-7"
				disabled={diagnosticsStore.loading}
				label="Refresh diagnostics"
				onclick={() => void diagnosticsStore.refresh()}
			>
				<RefreshCw class={diagnosticsStore.loading ? 'animate-spin' : ''} />
			</ActionIcon>
			<ActionIcon
				class="size-7"
				label={diagnosticsStore.paused ? 'Resume log updates' : 'Pause log updates'}
				onclick={() => diagnosticsStore.setPaused(!diagnosticsStore.paused)}
				pressed={diagnosticsStore.paused}
			>
				{#if diagnosticsStore.paused}<Play />{:else}<Pause />{/if}
			</ActionIcon>
			<Button onclick={downloadReport} size="sm" variant="outline">
				<Download />
				Report
			</Button>
		</Card.Action>
	</Card.Header>

	<div class="flex flex-wrap items-center gap-2 border-b bg-elevated/30 px-3 py-2">
		<ButtonGroup.Root aria-label="Minimum log level" role="group">
			{#each LOG_LEVELS as level (level)}
				<Button
					aria-pressed={minimumLevel === level}
					onclick={() => (minimumLevel = level)}
					size="sm"
					variant={minimumLevel === level ? 'default' : 'outline'}
				>
					{levelLabels[level]}
				</Button>
			{/each}
		</ButtonGroup.Root>
		<Select.Root
			onValueChange={(value) => (subsystem = value as SubsystemFilter)}
			type="single"
			value={subsystem}
		>
			<Select.Trigger aria-label="Subsystem" class="ml-auto w-40" size="sm">
				<span class="truncate">{subsystemLabels[subsystem]}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Item label={subsystemLabels.all} value="all" />
				{#each LOG_SUBSYSTEMS as name (name)}
					<Select.Item label={subsystemLabels[name]} value={name} />
				{/each}
			</Select.Content>
		</Select.Root>
	</div>

	{#if diagnosticsStore.error}
		<div
			class="mx-3 mt-2 flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive"
			role="alert"
		>
			<CircleAlert class="mt-px size-3.5 shrink-0" />
			<span class="min-w-0 break-words">{diagnosticsStore.error}</span>
		</div>
	{/if}

	<ScrollArea bind:viewportRef={viewport} class="min-h-0 flex-1">
		<div aria-live={diagnosticsStore.paused ? 'off' : 'polite'} class="min-h-full" role="log">
			{#if visibleEntries.length > 0}
				<ol class="m-0 list-none p-0 py-1 text-[11px] leading-5">
					{#each visibleEntries as entry (entry.id)}
						{@const tone = levelClasses[entry.level]}
						<li
							class={[
								'grid grid-cols-[3.75rem_3.25rem_minmax(0,1fr)] items-baseline gap-x-2 border-b border-l-2 border-b-border/35 px-3 py-1 last:border-b-0 @xl:grid-cols-[3.75rem_3.25rem_6rem_minmax(0,1fr)]',
								tone.row
							]}
						>
							<time class="font-mono text-muted-foreground tabular-nums" datetime={entry.time}>
								{timeFormat.format(new Date(entry.time))}
							</time>
							<span class={['inline-flex items-center gap-1.5 font-mono font-semibold', tone.text]}>
								<span class={['size-1.5 shrink-0 rounded-full', tone.dot]}></span>
								{entry.level.toUpperCase()}
							</span>
							<span class="hidden truncate font-mono text-muted-foreground @xl:block">
								{entry.subsystem}
							</span>
							<div class="grid min-w-0 gap-0.5">
								<p
									class={[
										'm-0 text-xs break-words',
										entry.level === 'debug' ? 'text-muted-foreground' : 'text-foreground'
									]}
								>
									{entry.message}
								</p>
								{#if Object.keys(entry.fields).length > 0}
									<div class="flex flex-wrap gap-1">
										{#each Object.entries(entry.fields) as [key, value] (key)}
											<span
												class="rounded border border-border/60 bg-field/70 px-1 font-mono text-[10px] leading-4 break-all text-muted-foreground"
											>
												{key}=<span class="text-foreground">{String(value)}</span>
											</span>
										{/each}
									</div>
								{/if}
								{#if entry.error}
									<p class="m-0 font-mono break-words text-destructive">
										{entry.error.name}: {entry.error.message}
									</p>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
			{:else}
				<Empty.Root class="min-h-48 border-0">
					<Empty.Header>
						<Empty.Media variant="icon"><ScrollText /></Empty.Media>
						<Empty.Title>No log entries</Empty.Title>
						<Empty.Description>
							{diagnosticsStore.entries.length > 0
								? 'Nothing matches the current level and subsystem filters.'
								: 'Activity will appear here as the app runs.'}
						</Empty.Description>
					</Empty.Header>
				</Empty.Root>
			{/if}
		</div>
	</ScrollArea>
</Card.Root>
