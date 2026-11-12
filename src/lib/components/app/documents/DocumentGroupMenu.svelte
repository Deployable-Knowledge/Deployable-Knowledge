<script lang="ts">
	import Download from '@lucide/svelte/icons/download';
	import Ellipsis from '@lucide/svelte/icons/ellipsis';
	import FolderX from '@lucide/svelte/icons/folder-x';
	import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import WandSparkles from '@lucide/svelte/icons/wand-sparkles';
	import { ActionIcon } from '#lib/components/app/actions';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import type { ApiSyncedFolder } from '#lib/types';

	interface Props {
		busy: boolean;
		folder: ApiSyncedFolder | null;
		label: string;
		total: number;
		onAutotag: () => void;
		onExport: () => void;
		onRemove: (folder: ApiSyncedFolder, removeDocuments: boolean) => void;
		onRetry: (folder: ApiSyncedFolder) => void;
	}

	let { busy, folder, label, total, onAutotag, onExport, onRemove, onRetry }: Props = $props();
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger>
		{#snippet child({ props })}
			<ActionIcon
				class="size-7 border-0 bg-transparent shadow-none"
				disabled={busy || (!folder && !total)}
				label={`${label} actions`}
				size="icon-sm"
				triggerProps={props}
				variant="ghost"
			>
				<Ellipsis />
			</ActionIcon>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end" class="w-60" sideOffset={4}>
		<DropdownMenu.Item disabled={busy || !total} onclick={onAutotag}>
			<WandSparkles />
			Autotag
		</DropdownMenu.Item>
		<DropdownMenu.Item disabled={busy || !total} onclick={onExport}>
			<Download />
			Export
		</DropdownMenu.Item>
		{#if folder}
			<DropdownMenu.Separator />
			{#if folder.malformedCount > 0}
				<DropdownMenu.Item disabled={busy} onclick={() => onRetry(folder)}>
					<RotateCcw />
					Retry malformed files
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Item disabled={busy} onclick={() => onRemove(folder, false)}>
				<FolderX />
				Stop watching
			</DropdownMenu.Item>
			<DropdownMenu.Item
				disabled={busy}
				onclick={() => onRemove(folder, true)}
				variant="destructive"
			>
				<Trash2 />
				Remove folder and its documents
			</DropdownMenu.Item>
		{/if}
	</DropdownMenu.Content>
</DropdownMenu.Root>
