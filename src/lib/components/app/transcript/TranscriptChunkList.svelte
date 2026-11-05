<script lang="ts">
	import { Spring, prefersReducedMotion } from 'svelte/motion';
	import { Badge } from '#lib/components/ui/badge';
	import type { TranscriptChunkRow } from '#lib/types';
	import TranscriptChunk from './TranscriptChunk.svelte';

	interface Props {
		activeIndex: number;
		chunks: TranscriptChunkRow[];
		onSeek: (startMs: number) => void;
		rows?: (HTMLElement | undefined)[];
	}

	interface SpeakerTurn {
		speaker: number | null;
		entries: { chunk: TranscriptChunkRow; index: number }[];
	}

	let { activeIndex, chunks, onSeek, rows = $bindable([]) }: Props = $props();

	const SPEAKER_HUE_STEP = 137.5;

	let list = $state<HTMLElement>();
	let placedRow = $state<HTMLElement | null>(null);
	const highlight = new Spring(
		{ x: 0, y: 0, width: 0, height: 0 },
		{ damping: 0.72, precision: 0.1, stiffness: 0.14 }
	);

	const labelled = $derived(chunks.some((chunk) => chunk.speaker !== null));

	const turns = $derived.by(() => {
		const grouped: SpeakerTurn[] = [];
		for (const [index, chunk] of chunks.entries()) {
			const turn = grouped.at(-1);
			if (turn?.speaker === chunk.speaker) turn.entries.push({ chunk, index });
			else grouped.push({ speaker: chunk.speaker, entries: [{ chunk, index }] });
		}
		return grouped;
	});

	$effect(() => {
		const row = activeIndex >= 0 ? rows[activeIndex] : undefined;
		if (!list || !row) {
			placedRow = null;
			return;
		}

		const observer = new ResizeObserver(() => placeHighlight(row));
		observer.observe(list);
		return () => observer.disconnect();
	});

	function placeHighlight(row: HTMLElement): void {
		const target = {
			x: row.offsetLeft,
			y: row.offsetTop,
			width: row.offsetWidth,
			height: row.offsetHeight
		};
		const instant = placedRow === null || placedRow === row || prefersReducedMotion.current;
		void highlight.set(target, { instant });
		placedRow = row;
	}
</script>

<div bind:this={list} class="relative isolate grid gap-4">
	<div
		aria-hidden="true"
		class={[
			'pointer-events-none absolute top-0 left-0 -z-10 rounded-lg border border-primary/40 bg-primary/10 shadow-sm transition-opacity duration-200',
			placedRow ? 'opacity-100' : 'opacity-0'
		]}
		style:height="{highlight.current.height}px"
		style:translate="{highlight.current.x}px {highlight.current.y}px"
		style:width="{highlight.current.width}px"
	></div>

	{#each turns as turn (turn.entries[0].chunk.id)}
		<section class={['grid', labelled && 'grid-cols-[6rem_minmax(0,1fr)] gap-x-3']}>
			{#if labelled}
				<div class="sticky top-3 self-start pt-2">
					{#if turn.speaker !== null}
						<Badge
							class="dk-tag"
							style={`--tag-hue: ${((turn.speaker - 1) * SPEAKER_HUE_STEP) % 360}`}
							variant="outline"
						>
							Speaker {turn.speaker}
						</Badge>
					{/if}
				</div>
			{/if}
			<div class="grid min-w-0 gap-1">
				{#each turn.entries as { chunk, index } (chunk.id)}
					<div bind:this={rows[index]} class="scroll-my-2">
						<TranscriptChunk active={index === activeIndex} {chunk} {onSeek} />
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>
