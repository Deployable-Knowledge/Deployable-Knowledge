<script lang="ts">
	import SquareSlash from '@lucide/svelte/icons/square-slash';
	import { MarkdownContent } from '#lib/components/app/content';
	import { Badge } from '#lib/components/ui/badge';
	import type { SessionMessage } from '#lib/types';
	import ChatMessageToolbar from './ChatMessageToolbar.svelte';
	import { ChatMessageContext } from './ChatMessageContext';
	import { messageMetadata, messageSkill, messageTrace } from './chat-message';

	interface Props {
		message: SessionMessage;
		onSaveChunk: (chunkId: string) => Promise<void> | void;
		onSendToNotebook: () => void;
	}

	let { message, onSaveChunk, onSendToNotebook }: Props = $props();
	const metadata = $derived(messageMetadata(message));
	const trace = $derived(messageTrace(metadata.agent));
	const skill = $derived(messageSkill(message));
</script>

<article
	class={[
		'text-sm',
		message.role === 'user'
			? 'dk-panel max-w-[92%] self-end rounded-xl border bg-primary/10 p-3 text-right shadow-sm'
			: 'w-full self-start py-2 text-left'
	]}
>
	{#if message.role === 'assistant'}
		<ChatMessageContext {trace} />
		<MarkdownContent content={message.content} />
		<ChatMessageContext outputs={metadata.outputs ?? []} {onSaveChunk} />
		<ChatMessageToolbar
			agent={metadata.agent}
			contextCount={metadata.outputs?.length ?? 0}
			{trace}
			{onSendToNotebook}
		/>
	{:else}
		{#if skill}
			<Badge class="mb-1.5 ml-auto flex">
				<SquareSlash aria-hidden="true" />
				<span class="sr-only">Skill</span>
				{skill.name}
			</Badge>
		{/if}
		<p class="m-0 whitespace-pre-wrap">{message.content}</p>
	{/if}
</article>
