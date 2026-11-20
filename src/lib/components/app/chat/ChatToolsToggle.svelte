<script lang="ts">
	import Wrench from '@lucide/svelte/icons/wrench';
	import WrenchOff from '@lucide/svelte/icons/wrench-off';
	import { ActionIcon } from '#lib/components/app/actions';

	interface Props {
		available: boolean;
		disabled?: boolean;
		enabled: boolean;
		onToggle: (enabled: boolean) => void;
	}

	let { available, disabled = false, enabled, onToggle }: Props = $props();

	let label = $derived(
		available ? 'Let the model call tools' : 'Choose Notebook or Search in Chat modes to use tools'
	);
</script>

<ActionIcon
	class="size-8 rounded-full bg-transparent text-foreground/40 shadow-none hover:bg-transparent hover:text-foreground active:translate-y-0 aria-disabled:pointer-events-auto aria-disabled:cursor-not-allowed aria-disabled:hover:text-foreground/40 aria-pressed:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:aria-disabled:hover:text-muted-foreground dark:aria-pressed:text-foreground"
	{disabled}
	{label}
	onclick={() => {
		if (available) onToggle(!enabled);
	}}
	pressed={enabled}
	triggerProps={{ 'aria-disabled': available ? undefined : true }}
	variant="ghost"
>
	{#if enabled}
		<Wrench />
	{:else}
		<WrenchOff />
	{/if}
</ActionIcon>
