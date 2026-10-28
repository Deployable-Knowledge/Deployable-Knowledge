<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import favicon from '#lib/assets/icon.svg';
	import { WorkspaceWindowControls } from '#lib/components/app/navigation';
	import { ScrollArea } from '#lib/components/ui/scroll-area';
	import { setupStore, userGuideStore, type SetupStep } from '#lib/stores';
	import SetupComponentList from './SetupComponentList.svelte';
	import SetupModelStep from './SetupModelStep.svelte';

	const STEP_DESCRIPTIONS: Record<SetupStep, string> = {
		components:
			'Downloading the models that read, transcribe and search your documents. Once installed they run offline.',
		model: 'Pick a chat model to run on this computer, or skip and connect a provider later.'
	};

	async function finish(): Promise<void> {
		if (!(await setupStore.finish())) return;

		await goto(resolve('/(app)'));
		userGuideStore.show();
	}

	onMount(() => void setupStore.init());
</script>

<div class="relative flex h-full min-h-0 flex-col bg-linear-to-b from-card to-elevated">
	<div class="dk-drag-region absolute inset-x-0 top-0 z-10 flex h-10 items-center justify-end pr-1">
		<WorkspaceWindowControls />
	</div>

	<ScrollArea class="min-h-0 flex-1">
		<main
			aria-labelledby="setup-title"
			class="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-8 px-4 py-14"
		>
			<div class="grid justify-items-center gap-3 text-center">
				<img alt="" class="size-20 drop-shadow-lg" src={favicon} />
				<h1 class="m-0 text-2xl font-semibold tracking-tight" id="setup-title">
					Deployable Knowledge
				</h1>
				<p class="m-0 max-w-md text-sm text-muted-foreground">
					{STEP_DESCRIPTIONS[setupStore.step]}
				</p>
			</div>

			{#if setupStore.step === 'components'}
				<SetupComponentList />
			{:else}
				<SetupModelStep onFinish={() => void finish()} />
			{/if}
		</main>
	</ScrollArea>
</div>
