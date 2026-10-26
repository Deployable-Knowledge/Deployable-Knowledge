<script lang="ts">
	import { Streamdown } from 'svelte-streamdown';
	import type { AgentTraceItem } from '$lib/types';
	import { ChatMessageContext } from './ChatMessageContext';

	interface Props {
		error?: string;
		status: string;
		streamedText?: string;
		trace?: AgentTraceItem[];
	}

	let { error = '', status, streamedText = '', trace = [] }: Props = $props();
</script>

<article class="w-full self-start py-2 text-sm" aria-live="polite">
	<ChatMessageContext {trace} />
	{#if !streamedText && !trace.some((item) => item.status === 'running')}
		<div class="flex items-center gap-2 text-xs text-muted-foreground" role="status">
			<span class="flex gap-1" aria-hidden="true"
				><span class="size-1.5 animate-bounce rounded-full bg-primary"></span><span
					class="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:150ms]"
				></span><span
					class="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:300ms]"
				></span></span
			>
			{status}
		</div>
	{/if}
	{#if error}<p class="text-xs text-destructive">{error}</p>{/if}
	{#if streamedText}
		<Streamdown
			baseTheme="shadcn"
			class="markdown-content prose prose-sm max-w-none dark:prose-invert"
			content={streamedText}
			controls={false}
		>
			{#snippet code({ token })}
				<pre><code>{token.text.replace(/\n+$/, '')}</code></pre>
			{/snippet}
		</Streamdown>
	{/if}
</article>
