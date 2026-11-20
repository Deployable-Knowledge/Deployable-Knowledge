<script lang="ts">
	import { tick } from 'svelte';
	import Book from '@lucide/svelte/icons/book';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import Search from '@lucide/svelte/icons/search';
	import { MarkdownContent } from '#lib/components/app/content';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Empty from '#lib/components/ui/empty';
	import { Input } from '#lib/components/ui/input';
	import { ScrollArea } from '#lib/components/ui/scroll-area';
	import { Skeleton } from '#lib/components/ui/skeleton';
	import { userGuideStore } from '#lib/stores';
	import UserGuideSearchResults from './UserGuideSearchResults.svelte';
	import {
		findTextRanges,
		renderedChapterText,
		searchUserGuide,
		USER_GUIDE_SEARCH_MIN_LENGTH,
		type UserGuideSearch
	} from './user-guide-search';

	const MATCH_HIGHLIGHT = 'dk-guide-match';
	const CURRENT_HIGHLIGHT = 'dk-guide-current';
	const NO_SEARCH: UserGuideSearch = { results: [], total: 0 };

	let readingViewport = $state<HTMLDivElement | null>(null);
	let readingContent = $state<HTMLDivElement | null>(null);
	let searchInput = $state<HTMLInputElement | null>(null);
	let query = $state('');
	let focusedIndex = $state<number | null>(null);
	let currentMatch: Range | undefined;

	const term = $derived(query.trim().length >= USER_GUIDE_SEARCH_MIN_LENGTH ? query.trim() : '');
	const chapterTexts = $derived(userGuideStore.chapters.map(renderedChapterText));
	const search = $derived(term ? searchUserGuide(chapterTexts, term) : NO_SEARCH);
	const searchSummary = $derived(
		search.total > search.results.length
			? `First ${search.results.length} of ${search.total} matches`
			: `${search.total} ${search.total === 1 ? 'match' : 'matches'}`
	);
	const focusedResult = $derived(focusedIndex === null ? null : search.results[focusedIndex]);

	function setQuery(value: string): void {
		query = value;
		focusedIndex = null;
	}

	function scrollToCurrentMatch(): void {
		if (!readingViewport || !currentMatch) return;
		const viewportTop = readingViewport.getBoundingClientRect().top;
		const offset = currentMatch.getBoundingClientRect().top - viewportTop;
		readingViewport.scrollTo({
			top: readingViewport.scrollTop + offset - readingViewport.clientHeight / 3
		});
	}

	async function openResult(index: number): Promise<void> {
		focusedIndex = index;
		userGuideStore.select(search.results[index].chapterIndex);
		await tick();
		scrollToCurrentMatch();
	}

	function stepResult(step: 1 | -1): void {
		const count = search.results.length;
		if (!count) return;
		const from = focusedIndex ?? (step === 1 ? -1 : 0);
		void openResult((from + step + count) % count);
	}

	function stepResultOnEnter(event: KeyboardEvent): void {
		if (event.key !== 'Enter') return;
		event.preventDefault();
		stepResult(event.shiftKey ? -1 : 1);
	}

	function clearSearchOnEscape(event: KeyboardEvent): void {
		if (document.activeElement !== searchInput || !query) return;
		event.preventDefault();
		setQuery('');
	}

	$effect(() => {
		void userGuideStore.activeIndex;
		readingViewport?.scrollTo({ top: 0 });
	});

	$effect(() => {
		if (!readingContent || !userGuideStore.activeChapter || !term) return;

		const ranges = findTextRanges(readingContent, term);
		const current =
			focusedResult?.chapterIndex === userGuideStore.activeIndex
				? ranges[focusedResult.occurrence]
				: undefined;
		const others = ranges.filter((range) => range !== current);

		currentMatch = current;
		CSS.highlights.set(MATCH_HIGHLIGHT, new Highlight(...others));
		if (current) CSS.highlights.set(CURRENT_HIGHLIGHT, new Highlight(current));

		return () => {
			currentMatch = undefined;
			CSS.highlights.delete(MATCH_HIGHLIGHT);
			CSS.highlights.delete(CURRENT_HIGHLIGHT);
		};
	});
</script>

<Dialog.Root open={userGuideStore.open} onOpenChange={(open) => userGuideStore.setOpen(open)}>
	<Dialog.Content
		class="flex h-[min(46rem,88dvh)] w-[min(70rem,calc(100vw-3rem))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
		onEscapeKeydown={clearSearchOnEscape}
	>
		<Dialog.Description class="sr-only">
			Read the Deployable Knowledge user guide one chapter at a time, or search all of it.
		</Dialog.Description>

		<aside
			class="flex w-52 shrink-0 flex-col gap-3 border-r bg-linear-to-b from-card/60 to-elevated/70 p-3 sm:w-56"
		>
			<Dialog.Title class="px-1 pt-1 text-sm font-semibold tracking-tight">User Guide</Dialog.Title>

			<div class="relative">
				<Search
					class="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					aria-label="Search the user guide"
					bind:ref={searchInput}
					bind:value={() => query, setQuery}
					class="h-8 pl-8"
					onkeydown={stepResultOnEnter}
					placeholder="Search the guide…"
					type="search"
				/>
			</div>

			{#if search.total}
				<p class="m-0 px-1 text-xs text-muted-foreground" role="status">{searchSummary}</p>
			{/if}

			<ScrollArea class="min-h-0 flex-1" scrollbarYClasses="hidden">
				{#if term}
					<UserGuideSearchResults
						chapters={userGuideStore.chapters}
						{focusedIndex}
						onOpen={(index) => void openResult(index)}
						{search}
						{term}
					/>
				{:else}
					<nav aria-label="User guide chapters">
						<ul class="m-0 grid list-none auto-rows-fr gap-1.5 p-0">
							{#if userGuideStore.loading}
								{#each { length: 6 }, index (index)}
									<li><Skeleton class="h-10 rounded-xl" /></li>
								{/each}
							{/if}
							{#each userGuideStore.chapters as chapter, index (chapter.id)}
								{@const active = index === userGuideStore.activeIndex}
								<li>
									<button
										type="button"
										aria-current={active ? 'page' : undefined}
										class={[
											'dk-panel flex size-full cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-[background-color,border-color] hover:bg-muted/60',
											active && 'border-primary bg-primary/10'
										]}
										onclick={() => userGuideStore.select(index)}
									>
										<FileText class="size-4 shrink-0 text-muted-foreground" />
										<strong class="min-w-0 text-sm leading-5 break-words whitespace-normal"
											>{chapter.title}</strong
										>
									</button>
								</li>
							{/each}
						</ul>
					</nav>
				{/if}
			</ScrollArea>
		</aside>

		<div class="flex min-w-0 flex-1 flex-col">
			{#if userGuideStore.error}
				<Empty.Root class="flex-1">
					<Empty.Header>
						<Empty.Title>Couldn't load the user guide</Empty.Title>
						<Empty.Description>{userGuideStore.error}</Empty.Description>
					</Empty.Header>
					<Empty.Content>
						<Button size="sm" variant="outline" onclick={() => void userGuideStore.load()}>
							Try again
						</Button>
					</Empty.Content>
				</Empty.Root>
			{:else}
				<header
					class="flex shrink-0 items-center gap-3 border-b bg-linear-to-b from-[var(--chrome-highlight)] to-card px-5 py-4 pr-14"
				>
					<div
						class="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-linear-to-b from-card to-elevated text-foreground"
					>
						<Book class="size-4.5" />
					</div>
					{#if userGuideStore.activeChapter}
						<div class="grid min-w-0 gap-0.5">
							<h2 class="m-0 truncate text-sm font-semibold">
								{userGuideStore.activeChapter.title}
							</h2>
							{#if userGuideStore.activeChapter.description}
								<p class="m-0 truncate text-xs text-muted-foreground">
									{userGuideStore.activeChapter.description}
								</p>
							{/if}
						</div>
					{:else}
						<Skeleton class="h-4 w-40" />
					{/if}
				</header>

				<ScrollArea
					class="min-h-0 flex-1 bg-linear-to-b from-elevated/25 to-elevated/60"
					bind:viewportRef={readingViewport}
				>
					<div bind:this={readingContent} class="px-12 py-9">
						{#if userGuideStore.activeChapter}
							<MarkdownContent content={userGuideStore.activeChapter.content} />
						{:else}
							<div class="grid gap-3">
								<Skeleton class="h-6 w-1/2" /><Skeleton class="h-24" /><Skeleton class="h-40" />
							</div>
						{/if}
					</div>
				</ScrollArea>

				<footer class="flex shrink-0 items-center justify-end gap-2 border-t bg-card px-4 py-2.5">
					{#if userGuideStore.chapters.length}
						<span class="mr-1 text-xs text-muted-foreground">
							Chapter {userGuideStore.activeIndex + 1} of {userGuideStore.chapters.length}
						</span>
					{/if}
					<Button
						size="sm"
						variant="outline"
						disabled={!userGuideStore.hasPrevious}
						onclick={() => userGuideStore.previous()}
					>
						<ChevronLeft />
						Previous
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={!userGuideStore.hasNext}
						onclick={() => userGuideStore.next()}
					>
						Next
						<ChevronRight />
					</Button>
				</footer>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>
