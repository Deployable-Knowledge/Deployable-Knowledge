<script lang="ts">
	import { onMount } from 'svelte';
	import { diagnosticsStore } from '#lib/stores';
	import DiagnosticsHealthCard from './DiagnosticsHealthCard.svelte';
	import DiagnosticsLogCard from './DiagnosticsLogCard.svelte';
	import DiagnosticsStatsCard from './DiagnosticsStatsCard.svelte';

	onMount(() => {
		diagnosticsStore.start();
		return () => diagnosticsStore.stop();
	});
</script>

<div
	class="grid h-full min-h-0 grid-rows-[auto_minmax(18rem,1fr)] gap-3"
	id="settings-diagnostics-console"
>
	<div class="grid gap-3 @3xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
		<DiagnosticsHealthCard snapshot={diagnosticsStore.snapshot} />
		<DiagnosticsStatsCard snapshot={diagnosticsStore.snapshot} />
	</div>
	<DiagnosticsLogCard />
</div>
