<script lang="ts">
	import Book from '@lucide/svelte/icons/book';
	import Settings from '@lucide/svelte/icons/settings';
	import { ActionIcon } from '#lib/components/app/actions';
	import { settingsDialogStore, userGuideStore } from '#lib/stores';
</script>

<div
	class="dk-no-drag ml-1 flex shrink-0 items-center gap-1 border-l pl-1"
	aria-label="Application controls"
>
	<ActionIcon
		class="size-7 rounded-md"
		label="User Guide"
		variant="ghost"
		onclick={() => userGuideStore.show()}
	>
		<Book />
	</ActionIcon>
	<ActionIcon
		class="size-7 rounded-md"
		label="Settings"
		variant="ghost"
		onclick={() => settingsDialogStore.show()}
	>
		<Settings />
	</ActionIcon>
</div>
