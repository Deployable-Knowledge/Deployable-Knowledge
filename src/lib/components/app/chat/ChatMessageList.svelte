<script lang="ts">
	import { Spring, prefersReducedMotion } from 'svelte/motion';
	import * as Empty from '#lib/components/ui/empty';
	import { ScrollArea } from '#lib/components/ui/scroll-area';
	import type { AgentTraceItem, SessionMessage } from '#lib/types';
	import ChatMessage from './ChatMessage.svelte';
	import ChatStreamingIndicator from './ChatStreamingIndicator.svelte';

	const PINNED_THRESHOLD_PX = 48;
	const SCROLL_TOLERANCE_PX = 1;

	interface Props {
		busy?: boolean;
		error?: string;
		messages: SessionMessage[];
		onSaveChunk: (chunkId: string) => Promise<void> | void;
		onSendToNotebook: (message: SessionMessage) => void;
		ref?: HTMLDivElement | null;
		status?: string;
		streamedText?: string;
		trace?: AgentTraceItem[];
	}

	let {
		busy = false,
		error = '',
		messages,
		onSaveChunk,
		onSendToNotebook,
		ref = $bindable(null),
		status = 'Thinking…',
		streamedText = '',
		trace = []
	}: Props = $props();

	let contentElement = $state<HTMLDivElement | null>(null);
	let pinned = $state(true);
	const scrollPosition = new Spring(0, { damping: 1, precision: 0.5, stiffness: 0.12 });

	function maxScrollTop(viewport: HTMLDivElement): number {
		return Math.max(0, viewport.scrollHeight - viewport.clientHeight);
	}

	function trackPin(): void {
		if (!ref) return;
		const actual = ref.scrollTop;
		if (Math.abs(actual - scrollPosition.current) <= SCROLL_TOLERANCE_PX) return;
		pinned = maxScrollTop(ref) - actual <= PINNED_THRESHOLD_PX;
		void scrollPosition.set(actual, { instant: true });
	}

	$effect(() => {
		const viewport = ref;
		const content = contentElement;
		if (!viewport || !content) return;

		const followBottom = () => {
			if (!pinned) return;
			void scrollPosition.set(maxScrollTop(viewport), {
				instant: prefersReducedMotion.current
			});
		};
		const observer = new ResizeObserver(followBottom);
		observer.observe(content);
		observer.observe(viewport);
		viewport.addEventListener('scroll', trackPin, { passive: true });
		pinned = true;
		void scrollPosition.set(maxScrollTop(viewport), { instant: true });

		return () => {
			observer.disconnect();
			viewport.removeEventListener('scroll', trackPin);
			void scrollPosition.set(scrollPosition.current, { instant: true });
		};
	});

	$effect(() => {
		const top = scrollPosition.current;
		if (!ref || !pinned) return;
		ref.scrollTop = top;
	});
</script>

<ScrollArea
	class="min-h-0 flex-1 rounded-xl"
	scrollbarYClasses="hidden"
	bind:viewportRef={ref}
	aria-live="polite"
>
	<div bind:this={contentElement} class="flex min-h-full flex-col gap-2 p-2">
		{#each messages as message (message.id)}
			<ChatMessage {message} {onSaveChunk} onSendToNotebook={() => onSendToNotebook(message)} />
		{:else}
			{#if !busy}
				<Empty.Root class="my-auto"
					><Empty.Header
						><Empty.Title>Start a conversation</Empty.Title><Empty.Description
							>Ask about selected documents or switch to notebook context.</Empty.Description
						></Empty.Header
					></Empty.Root
				>
			{/if}
		{/each}
		{#if busy}<ChatStreamingIndicator {error} {status} {streamedText} {trace} />{/if}
	</div>
</ScrollArea>
