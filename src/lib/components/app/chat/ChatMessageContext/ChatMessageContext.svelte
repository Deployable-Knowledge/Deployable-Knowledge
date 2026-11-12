<script lang="ts">
	import type { AgentOutput, AgentTraceItem, StoredToolCall } from '#lib/types';
	import { legacyToolCallTrace } from '#lib/utils/agent-trace';
	import AgentTrace from './AgentTrace.svelte';
	import Context from './Context.svelte';
	import ContextSources from './ContextSources.svelte';

	interface Props {
		onSaveChunk?: (chunkId: string) => Promise<void> | void;
		outputs?: AgentOutput[];
		toolCalls?: StoredToolCall[];
		trace?: AgentTraceItem[];
	}

	let { onSaveChunk, outputs = [], toolCalls = [], trace = [] }: Props = $props();

	const displayTrace = $derived(
		trace.length ? trace : toolCalls.map((call, index) => legacyToolCallTrace(call, index))
	);
</script>

<AgentTrace trace={displayTrace} />
{#if outputs.length}
	<Context label="Tool context">
		<ContextSources sources={outputs} {onSaveChunk} />
	</Context>
{/if}
