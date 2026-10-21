<script lang="ts">
	import '../../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { Toaster } from 'svelte-sonner';
	import packageMetadata from '../../../package.json';
	import favicon from '#lib/assets/icon.svg';
	import { AppStartupOverlay } from '#lib/components/app/navigation';
	import { SettingsDialog } from '#lib/components/app/settings';
	import { APP_SETUP } from '#lib/constants';
	import { UserGuideDialog } from '#lib/components/app/user-guide';
	import EngineHeartbeat from '#lib/components/app/navigation/EngineHeartbeat.svelte';
	import * as Tooltip from '#lib/components/ui/tooltip';
	import {
		desktopWindowStore,
		settingsStore,
		themeStore,
		userGuideStore,
		workspaceStore
	} from '#lib/stores';

	let { children } = $props();
	let framesPainted = $state(false);

	// The workspace layout arrives from the database, so the overlay has to cover
	// that fetch or the tab strip renders empty first.
	const layoutReady = $derived(framesPainted && workspaceStore.ready);

	// A fresh install starts on the setup page, which shares this layout, so the
	// guide waits until setup hands off to the workspace.
	$effect(() => {
		if (!layoutReady || page.url.pathname === APP_SETUP) return;
		void userGuideStore.openOnFirstRun();
	});

	onMount(() => {
		themeStore.init();
		void desktopWindowStore.init();
		void workspaceStore.init();
		void settingsStore.init();

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
	<EngineHeartbeat />
	<SettingsDialog />
	<UserGuideDialog />

	<AppStartupOverlay ready={layoutReady} version={packageMetadata.version} />
</Tooltip.Provider>
