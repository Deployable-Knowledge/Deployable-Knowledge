<script lang="ts">
	import Book from '@lucide/svelte/icons/book';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import FileText from '@lucide/svelte/icons/file-text';
	import { MarkdownContent } from '#lib/components/app/content';
	import { Button } from '#lib/components/ui/button';
	import * as Dialog from '#lib/components/ui/dialog';
	import * as Empty from '#lib/components/ui/empty';
	import { ScrollArea } from '#lib/components/ui/scroll-area';
	import { Skeleton } from '#lib/components/ui/skeleton';
	import { userGuideStore } from '#lib/stores';

	let readingViewport = $state<HTMLDivElement | null>(null);

	$effect(() => {
		void userGuideStore.activeIndex;
		readingViewport?.scrollTo({ top: 0 });
	});
</script>

<Dialog.Root open={userGuideStore.open} onOpenChange={(open) => userGuideStore.setOpen(open)}>
	<Dialog.Content
		class="flex h-[min(46rem,88dvh)] w-[min(70rem,calc(100vw-3rem))] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
	>
		<Dialog.Description class="sr-only">
			Read the Deployable Knowledge user guide one chapter at a time.
		</Dialog.Description>

		<aside
			class="flex w-52 shrink-0 flex-col gap-3 border-r bg-linear-to-b from-card/60 to-elevated/70 p-3 sm:w-56"
		>
			<Dialog.Title class="px-1 pt-1 text-sm font-semibold tracking-tight">User Guide</Dialog.Title>

			<ScrollArea class="min-h-0 flex-1" scrollbarYClasses="hidden">
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
					<div class="px-12 py-9">
						{#if userGuideStore.activeChapter}
							<MarkdownContent content={userGuideStore.activeChapter.content} styledSpans />
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
