<script lang="ts">
	import { onMount } from 'svelte';
	import { catalogModelCard, SettingsModelCard } from '#lib/components/app/settings';
	import { Button } from '#lib/components/ui/button';
	import { LOCAL_MODEL_PROVIDER_ID, LOCAL_MODELS } from '#lib/constants';
	import { localModelsStore, settingsStore, setupStore } from '#lib/stores';

	interface Props {
		onFinish: () => void;
	}

	let { onFinish }: Props = $props();

	const recommendedFile = $derived.by(() => {
		const memoryGiB = setupStore.status?.memoryGiB;
		if (!memoryGiB) return null;

		const fitting = LOCAL_MODELS.filter((model) => model.minRamGiB <= memoryGiB);
		return fitting.toSorted((left, right) => right.minRamGiB - left.minRamGiB)[0]?.fileName ?? null;
	});

	const hasModel = $derived(
		localModelsStore.downloadingFile !== null ||
			(localModelsStore.status?.models.some((model) => model.downloaded) ?? false)
	);

	onMount(() => void localModelsStore.refresh());
</script>

<section aria-label="Local models" class="grid gap-4">
	<div
		class="grid gap-3 rounded-xl border bg-sheet p-3 shadow-window sm:grid-cols-2 lg:grid-cols-3"
	>
		{#each LOCAL_MODELS as model (model.fileName)}
			{@const info = localModelsStore.status?.models.find(
				(entry) => entry.fileName === model.fileName
			)}
			<SettingsModelCard
				active={settingsStore.config.provider === LOCAL_MODEL_PROVIDER_ID &&
					settingsStore.config.model === model.fileName}
				downloadDisabled={localModelsStore.downloadingFile !== null}
				downloaded={info?.downloaded ?? false}
				downloading={localModelsStore.downloadingFile === model.fileName}
				model={catalogModelCard(model, model.minRamGiB)}
				onDownload={() => void localModelsStore.download(model.fileName)}
				onUse={() => void localModelsStore.activateModel(model.fileName)}
				percent={localModelsStore.progress?.percent ?? 0}
				recommended={model.fileName === recommendedFile}
			/>
		{/each}
	</div>

	{#if localModelsStore.error}
		<p class="m-0 text-sm text-destructive" role="alert">{localModelsStore.error}</p>
	{/if}
	{#if setupStore.error}
		<p class="m-0 text-sm text-destructive" role="alert">{setupStore.error}</p>
	{/if}

	<div class="flex justify-end">
		<Button disabled={setupStore.finishing} onclick={onFinish}>
			{hasModel ? 'Finish' : 'Skip'}
		</Button>
	</div>
</section>
