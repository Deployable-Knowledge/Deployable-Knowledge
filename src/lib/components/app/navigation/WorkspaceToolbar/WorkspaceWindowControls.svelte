<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import Minus from '@lucide/svelte/icons/minus';
	import Square from '@lucide/svelte/icons/square';
	import X from '@lucide/svelte/icons/x';
	import { ActionIcon } from '#lib/components/app/actions';
	import { cn } from '#lib/components/ui/utils';
	import { DesktopWindowService } from '#lib/services';
	import { desktopWindowStore } from '#lib/stores';

	interface Props {
		class?: string;
	}

	let { class: className }: Props = $props();
</script>

{#if desktopWindowStore.available}
	<div
		aria-label="Window controls"
		class={cn('dk-no-drag flex shrink-0 items-center gap-0.5', className)}
		role="group"
	>
		<ActionIcon
			class="size-7 rounded-md"
			label="Minimize"
			variant="ghost"
			onclick={() => DesktopWindowService.minimize()}
		>
			<Minus />
		</ActionIcon>
		<ActionIcon
			class="size-7 rounded-md"
			label={desktopWindowStore.maximized ? 'Restore' : 'Maximize'}
			variant="ghost"
			onclick={() => DesktopWindowService.toggleMaximize()}
		>
			{#if desktopWindowStore.maximized}
				<Copy class="size-3.5" />
			{:else}
				<Square class="size-3.5" />
			{/if}
		</ActionIcon>
		<ActionIcon
			class="size-7 rounded-md hover:bg-destructive/20 hover:text-destructive"
			label="Close"
			variant="ghost"
			onclick={() => DesktopWindowService.close()}
		>
			<X />
		</ActionIcon>
	</div>
{/if}
