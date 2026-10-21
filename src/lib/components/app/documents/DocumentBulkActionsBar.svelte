<script lang="ts">
	import Cloud from '@lucide/svelte/icons/cloud';
	import CloudOff from '@lucide/svelte/icons/cloud-off';
	import Power from '@lucide/svelte/icons/power';
	import PowerOff from '@lucide/svelte/icons/power-off';
	import Tag from '@lucide/svelte/icons/tag';
	import TagOff from '@lucide/svelte/icons/tag-x';
	import { Button } from '$lib/components/ui/button';

	interface Props {
		count: number;
		onActivate: () => void;
		onAllowAll: () => void;
		onApplyTag: () => void;
		onDeactivate: () => void;
		onKeepLocal: () => void;
		onRemoveTag: () => void;
	}

	let { count, onActivate, onAllowAll, onApplyTag, onDeactivate, onKeepLocal, onRemoveTag }: Props =
		$props();
</script>

{#if count > 0}
	<div class="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-2">
		<span class="mr-auto text-xs text-muted-foreground">{count} selected</span>
		<Button variant="outline" size="sm" onclick={onApplyTag}><Tag /> Apply tag</Button>
		<Button variant="outline" size="sm" onclick={onRemoveTag}><TagOff /> Remove tag</Button>
		<Button variant="outline" size="sm" onclick={onActivate}><Power /> Activate</Button>
		<Button variant="outline" size="sm" onclick={onDeactivate}><PowerOff /> Deactivate</Button>
		<Button variant="outline" size="sm" onclick={onKeepLocal}><CloudOff /> Local only</Button>
		<Button variant="outline" size="sm" onclick={onAllowAll}><Cloud /> Allow all</Button>
	</div>
{/if}
