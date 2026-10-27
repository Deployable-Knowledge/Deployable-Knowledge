<script lang="ts">
	import Brain from '@lucide/svelte/icons/brain';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import CircleAlert from '@lucide/svelte/icons/circle-alert';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Wrench from '@lucide/svelte/icons/wrench';
	import type { AgentTraceItem } from '#lib/types';

	interface Props {
		trace: AgentTraceItem[];
	}

	let { trace }: Props = $props();
</script>

{#each trace as item (`${item.kind}-${item.id}`)}
	{@const failed = item.isError || item.status === 'error'}
	<details class="group/item mb-1 w-full text-xs text-muted-foreground">
		<summary
			class="flex cursor-pointer list-none items-center gap-2 px-0 py-1.5 select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden"
		>
			{#if item.status === 'running'}
				<LoaderCircle class="size-3.5 shrink-0 animate-spin text-primary" />
			{:else if failed}
				<CircleAlert class="size-3.5 shrink-0 text-destructive" />
			{:else if item.kind === 'reasoning'}
				<Brain class="size-3.5 shrink-0 text-muted-foreground" />
			{:else}
				<Wrench class="size-3.5 shrink-0 text-muted-foreground" />
			{/if}
			<span class={['min-w-0 flex-1 break-words', failed && 'text-destructive']}>{item.title}</span>
			{#if failed}<span class="shrink-0 text-[0.65rem] text-destructive">Failed</span>{/if}
			<ChevronDown class="size-3.5 shrink-0 transition-transform group-open/item:rotate-180" />
		</summary>

		<div class="mt-1 mr-1 mb-3 ml-5 grid min-w-0 gap-3 bg-background/80 p-2.5">
			{#if item.kind === 'tool'}
				<section>
					<h3 class="m-0 mb-1 text-[0.625rem] font-semibold tracking-wider uppercase">Input</h3>
					<pre
						class="m-0 max-h-60 max-w-full overflow-auto font-mono text-[0.7rem] leading-relaxed break-words whitespace-pre-wrap text-foreground">{item.input ??
							'No input recorded'}</pre>
				</section>
			{/if}
			<section>
				<h3 class="m-0 mb-1 text-[0.625rem] font-semibold tracking-wider uppercase">
					{item.kind === 'tool' ? 'Output' : 'Reasoning'}
				</h3>
				<pre
					class="m-0 max-h-80 max-w-full overflow-auto font-mono text-[0.7rem] leading-relaxed break-words whitespace-pre-wrap text-foreground">{item.output ||
						'Waiting for output…'}</pre>
			</section>
		</div>
	</details>
{/each}
