<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import { Toaster } from 'svelte-sonner';
	import packageMetadata from '../../../package.json';
	import favicon from '#lib/assets/icon.svg';
	import { AppStartupOverlay } from '#lib/components/app/navigation';
	import { SettingsDialog } from '#lib/components/app/settings';
	import { UserGuideDialog } from '#lib/components/app/user-guide';
	import * as Tooltip from '#lib/components/ui/tooltip';
	import {
		chatStore,
		desktopWindowStore,
		settingsStore,
		skillsStore,
		themeStore,
		workspaceStore
	} from '#lib/stores';

	let { children } = $props();
	let framesPainted = $state(false);

	// The workspace layout and the chat controls arrive from the database, so the
	// overlay has to cover those fetches or the page shows their defaults first.
	const ready = $derived(framesPainted && workspaceStore.ready && chatStore.ready);

	onMount(() => {
		themeStore.init();
		void desktopWindowStore.init();
		void workspaceStore.init();
		void chatStore.init();
		void settingsStore.init();
		void skillsStore.load();

		let secondFrame = 0;
		const firstFrame = requestAnimationFrame(() => {
			secondFrame = requestAnimationFrame(() => (framesPainted = true));
		});

		return () => {
			cancelAnimationFrame(firstFrame);
			cancelAnimationFrame(secondFrame);
		};
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Tooltip.Provider delayDuration={300}>
	<div class="h-screen min-h-0 bg-background text-foreground">
		{@render children()}
	</div>

	<Toaster richColors />
	<SettingsDialog />
	<UserGuideDialog />

	<AppStartupOverlay {ready} version={packageMetadata.version} />
</Tooltip.Provider>
