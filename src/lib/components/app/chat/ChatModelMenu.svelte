<script lang="ts">
	import Brain from '@lucide/svelte/icons/brain';
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Download from '@lucide/svelte/icons/download';
	import Settings from '@lucide/svelte/icons/settings';
	import Sparkles from '@lucide/svelte/icons/sparkles';
	import { tick } from 'svelte';
	import { ActionIcon } from '#lib/components/app/actions';
	import { providerIcon } from '#lib/components/app/dialogs';
	import { Button } from '#lib/components/ui/button';
	import { Input } from '#lib/components/ui/input';
	import * as Popover from '#lib/components/ui/popover';
	import { Progress } from '#lib/components/ui/progress';
	import {
		LOCAL_MODEL_PROVIDER_ID,
		LOCAL_MODELS,
		REASONING_PRESETS,
		findLocalModelByFile,
		type ReasoningEffort
	} from '#lib/constants';
	import { localModelsStore, settingsDialogStore, settingsStore } from '#lib/stores';
	import type { ApiProviderModelGroup } from '#lib/types';

	interface Props {
		disabled?: boolean;
	}

	type OptionState = 'ready' | 'downloadable' | 'downloading';

	type Option = {
		index: number;
		model: string;
		providerId: string;
		state: OptionState;
		title: string;
	};

	type Group = {
		failed: boolean;
		options: Option[];
		provider: ApiProviderModelGroup;
		status: string;
	};

	let { disabled = false }: Props = $props();

	const id = $props.id();
	const efforts = Object.entries(REASONING_PRESETS) as [
		ReasoningEffort,
		(typeof REASONING_PRESETS)[ReasoningEffort]
	][];

	let open = $state(false);
	let input = $state<HTMLInputElement | null>(null);
	let query = $state('');
	let active = $state(0);

	const typed = $derived(query.trim());
	const downloadPercent = $derived(Math.round(localModelsStore.progress?.percent ?? 0));
	const currentProvider = $derived(
		settingsStore.providerModelGroups.find(({ id }) => id === settingsStore.config.provider)
	);
	const CurrentIcon = $derived(currentProvider ? providerIcon(currentProvider) : Sparkles);
	const activeLabel = $derived.by(() => {
		const { model, provider } = settingsStore.config;
		if (!model) return 'Select a model';
		if (provider !== LOCAL_MODEL_PROVIDER_ID) return model;
		return findLocalModelByFile(model)?.name ?? model;
	});
	const groups = $derived.by(() => {
		let index = 0;
		const number = (option: Omit<Option, 'index'>): Option => ({
			...option,
			index: option.state === 'downloading' ? -1 : index++
		});

		return settingsStore.providerModelGroups.map((provider): Group => {
			const options = (isLocal(provider) ? localOptions(provider) : remoteOptions(provider))
				.filter(matchesQuery)
				.map(number);
			return {
				failed: provider.failure !== null,
				options,
				provider,
				status: groupStatus(provider)
			};
		});
	});
	const options = $derived(
		groups.flatMap((group) => group.options).filter((option) => option.index >= 0)
	);

	function isLocal(provider: ApiProviderModelGroup): boolean {
		return provider.id === LOCAL_MODEL_PROVIDER_ID;
	}

	function localOptions(provider: ApiProviderModelGroup): Omit<Option, 'index'>[] {
		const catalog = LOCAL_MODELS.map((model) => ({
			model: model.fileName,
			providerId: provider.id,
			state: localState(provider, model.fileName),
			title: model.name
		}));
		const custom = provider.models
			.filter((fileName) => !findLocalModelByFile(fileName))
			.map((fileName) => ({
				model: fileName,
				providerId: provider.id,
				state: 'ready' as const,
				title: fileName
			}));

		return [...catalog, ...custom];
	}

	function localState(provider: ApiProviderModelGroup, fileName: string): OptionState {
		if (provider.models.includes(fileName)) return 'ready';
		return localModelsStore.downloadingFile === fileName ? 'downloading' : 'downloadable';
	}

	function remoteOptions(provider: ApiProviderModelGroup): Omit<Option, 'index'>[] {
		const listed = provider.models.map((model) => ({
			model,
			providerId: provider.id,
			state: 'ready' as const,
			title: model
		}));
		if (!provider.custom || !typed || provider.models.includes(typed)) return listed;

		return [
			...listed,
			{
				model: typed,
				providerId: provider.id,
				state: 'ready',
				title: `Use ${typed}`
			}
		];
	}

	function matchesQuery(option: Omit<Option, 'index'>): boolean {
		const needle = typed.toLowerCase();
		return (
			option.title.toLowerCase().includes(needle) || option.model.toLowerCase().includes(needle)
		);
	}

	function groupStatus(provider: ApiProviderModelGroup): string {
		if (provider.loading) return 'Loading models';
		if (provider.failure) return `Could not list models: ${provider.failure}`;
		return provider.custom ? 'No models listed, type a model id' : 'No matching models';
	}

	function isSelected(option: Option): boolean {
		const { model, provider } = settingsStore.config;
		return option.state === 'ready' && provider === option.providerId && model === option.model;
	}

	function choose(option: Option): void {
		if (option.state === 'downloadable') {
			void localModelsStore.download(option.model);
			return;
		}
		open = false;
		if (isSelected(option)) return;
		settingsStore.updateConfig({ provider: option.providerId, model: option.model });
	}

	function openChanged(next: boolean): void {
		open = next;
		if (!next) return;
		query = '';
		active = 0;
	}

	async function keydown(event: KeyboardEvent): Promise<void> {
		const count = options.length;
		if (event.key === 'ArrowDown' && count) {
			active = (active + 1) % count;
		} else if (event.key === 'ArrowUp' && count) {
			active = (active - 1 + count) % count;
		} else if (event.key === 'Enter' && options[active]) {
			choose(options[active]);
		} else {
			return;
		}
		event.preventDefault();
		await tick();
		document.getElementById(`${id}-${active}`)?.scrollIntoView({ block: 'nearest' });
	}

	function manageModels(): void {
		open = false;
		settingsDialogStore.show('models');
	}
</script>

<Popover.Root onOpenChange={openChanged} {open}>
	<Popover.Trigger {disabled}>
		{#snippet child({ props })}
			<Button
				{...props}
				aria-label={`Model and reasoning effort: ${activeLabel}`}
				class="h-8 min-w-0 shrink rounded-full text-muted-foreground hover:text-foreground aria-expanded:text-foreground"
				{disabled}
				size="sm"
				variant="ghost"
			>
				{#if localModelsStore.downloadingFile}
					<Download aria-hidden="true" class="size-3.5" />
					<span class="tabular-nums">{downloadPercent}%</span>
				{/if}
				<CurrentIcon aria-hidden="true" class="size-3.5" />
				<span class="truncate">{activeLabel}</span>
				<ChevronDown class="size-3" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content
		align="end"
		class="w-80 p-2"
		onOpenAutoFocus={(event) => {
			event.preventDefault();
			input?.focus();
		}}
		side="top"
		sideOffset={8}
	>
		<div class="mb-1 flex items-center gap-1">
			<Input
				aria-activedescendant={options[active] ? `${id}-${active}` : undefined}
				aria-controls={`${id}-options`}
				aria-expanded="true"
				bind:ref={input}
				bind:value={query}
				class="h-8"
				oninput={() => (active = 0)}
				onkeydown={keydown}
				placeholder="Find a model or type its id"
				role="combobox"
				spellcheck="false"
			/>
			<ActionIcon
				class="size-8 shrink-0"
				label="Manage models"
				onclick={manageModels}
				variant="ghost"
			>
				<Settings />
			</ActionIcon>
		</div>
		<div class="max-h-72 overflow-y-auto" id={`${id}-options`} role="listbox">
			{#each groups as group (group.provider.id)}
				{@const GroupIcon = providerIcon(group.provider)}
				<div aria-label={group.provider.name} role="group">
					<div
						aria-hidden="true"
						class="flex items-center gap-2 px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground"
					>
						<GroupIcon class="size-3 shrink-0" />
						<span class="truncate"
							>{isLocal(group.provider) ? 'Local models' : group.provider.name}</span
						>
					</div>
					{#each group.options as option (option.model)}
						{#if option.state === 'downloading'}
							<div class="grid gap-1.5 px-2 py-1.5 text-sm">
								<span class="flex items-center gap-2">
									<span class="min-w-0 flex-1 truncate">{option.title}</span>
									<span class="text-[11px] text-muted-foreground tabular-nums">
										{downloadPercent}%
									</span>
								</span>
								<Progress class="h-1.5" value={downloadPercent} />
							</div>
						{:else}
							<div
								aria-disabled={option.state === 'downloadable' &&
									localModelsStore.downloadingFile !== null}
								aria-selected={option.index === active}
								class={[
									'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm aria-disabled:pointer-events-none aria-disabled:opacity-50',
									option.index === active && 'bg-accent text-accent-foreground'
								]}
								id={`${id}-${option.index}`}
								onclick={() => choose(option)}
								onkeydown={keydown}
								onpointermove={() => (active = option.index)}
								role="option"
								tabindex="-1"
							>
								<span class="min-w-0 flex-1 truncate">{option.title}</span>
								{#if isSelected(option)}
									<Check aria-hidden="true" class="size-3.5 shrink-0 text-primary" />
								{:else if option.state === 'downloadable'}
									<Download aria-hidden="true" class="size-3.5 shrink-0 text-muted-foreground" />
								{/if}
							</div>
						{/if}
					{:else}
						<p
							class={[
								'm-0 line-clamp-3 px-2 py-1 text-xs break-words',
								group.failed ? 'text-destructive' : 'text-muted-foreground'
							]}
						>
							{group.status}
						</p>
					{/each}
					{#if isLocal(group.provider) && localModelsStore.error}
						<p class="m-0 px-2 py-1 text-[11px] text-destructive">{localModelsStore.error}</p>
					{/if}
				</div>
			{/each}
		</div>
		<div class="mt-1 border-t px-1 pt-2 pb-1">
			<div
				class="flex items-center gap-1.5 px-1 pb-1.5 text-[11px] font-medium text-muted-foreground"
			>
				<Brain aria-hidden="true" class="size-3" />
				Reasoning effort
			</div>
			<div class="grid grid-cols-5 gap-0.5 rounded-md bg-muted p-0.5">
				{#each efforts as [value, preset] (value)}
					<Button
						aria-pressed={value === settingsStore.reasoningEffort}
						class="h-6 px-0 text-[11px]"
						onclick={() => settingsStore.setReasoningEffort(value)}
						size="sm"
						variant={value === settingsStore.reasoningEffort ? 'default' : 'ghost'}
					>
						{preset.label}
					</Button>
				{/each}
			</div>
		</div>
	</Popover.Content>
</Popover.Root>
