<script lang="ts">
	import * as Empty from '#lib/components/ui/empty';
	import type { UserGuideChapter } from '#lib/types';
	import type { UserGuideSearch } from './user-guide-search';

	interface Props {
		chapters: UserGuideChapter[];
		focusedIndex: number | null;
		onOpen: (index: number) => void;
		search: UserGuideSearch;
		term: string;
	}

	let { chapters, focusedIndex, onOpen, search, term }: Props = $props();

	let resultElements = $state<(HTMLButtonElement | undefined)[]>([]);

	$effect(() => {
		if (focusedIndex === null) return;
		resultElements[focusedIndex]?.scrollIntoView({ block: 'nearest' });
	});
</script>

{#if search.results.length}
	<ul aria-label="Search results" class="m-0 grid list-none gap-1.5 p-0">
		{#each search.results as result, index (`${result.chapterIndex}:${result.occurrence}`)}
			{@const chapter = chapters[result.chapterIndex]}
			{@const focused = index === focusedIndex}
			<li>
				<button
					bind:this={resultElements[index]}
					type="button"
					aria-current={focused ? 'true' : undefined}
					class={[
						'dk-panel grid w-full cursor-pointer gap-0.5 rounded-xl border px-3 py-2 text-left transition-[background-color,border-color] hover:bg-muted/60',
						focused && 'border-primary bg-primary/10'
					]}
					onclick={() => onOpen(index)}
				>
					<span class="truncate text-[11px] font-semibold text-muted-foreground">
						{chapter.title}
					</span>
					{#if result.heading && result.heading !== chapter.title}
						<span class="truncate text-[11px] text-muted-foreground">{result.heading}</span>
					{/if}
					<span class="line-clamp-3 text-xs leading-4 break-words"
						>{result.before}<mark class="rounded-xs bg-find-match text-find-foreground"
							>{result.match}</mark
						>{result.after}</span
					>
				</button>
			</li>
		{/each}
	</ul>
{:else}
	<Empty.Root class="border p-4">
		<Empty.Header>
			<Empty.Title>No matches</Empty.Title>
			<Empty.Description>Nothing in the guide mentions “{term}”.</Empty.Description>
		</Empty.Header>
	</Empty.Root>
{/if}
