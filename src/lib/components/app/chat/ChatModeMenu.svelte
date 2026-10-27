<script lang="ts">
	import BookOpen from '@lucide/svelte/icons/book-open';
	import Bot from '@lucide/svelte/icons/bot';
	import Search from '@lucide/svelte/icons/search';
	import { ActionIcon } from '#lib/components/app/actions';
	import * as DropdownMenu from '#lib/components/ui/dropdown-menu';
	import { ChatContextMode } from '#lib/enums';

	interface Props {
		disabled?: boolean;
		mode: ChatContextMode;
		onModeChange: (mode: ChatContextMode) => void;
		searchToolActive: boolean;
	}

	let { disabled = false, mode, onModeChange, searchToolActive }: Props = $props();

	let modes = $derived({
		[ChatContextMode.NOTEBOOK]: {
			icon: BookOpen,
			title: 'Notebook',
			description: 'Use the notebook as context'
		},
		[ChatContextMode.SEARCH]: {
			icon: Search,
			title: 'Search',
			description: searchToolActive
				? 'Handled by the search tool'
				: 'Search documents before replying'
		},
		[ChatContextMode.MODEL]: {
			icon: Bot,
			title: 'Model',
			description: 'Reply from the model only, without documents or tools'
		}
	});

	let TriggerIcon = $derived(modes[mode].icon);
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger {disabled}>
		{#snippet child({ props })}
			<ActionIcon
				class="size-8 rounded-full bg-transparent text-foreground/40 shadow-none hover:bg-transparent hover:text-foreground active:translate-y-0 aria-expanded:text-foreground dark:text-muted-foreground dark:hover:text-foreground dark:aria-expanded:text-foreground"
				{disabled}
				label={`Chat mode: ${modes[mode].title}`}
				triggerProps={props}
				variant="ghost"
			>
				<TriggerIcon />
			</ActionIcon>
		{/snippet}
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="start" class="w-64" side="top" sideOffset={8}>
		<DropdownMenu.Label>Chat modes</DropdownMenu.Label>
		<DropdownMenu.RadioGroup
			onValueChange={(value) => onModeChange(value as ChatContextMode)}
			value={mode}
		>
			{#each Object.entries(modes) as [value, { icon: Icon, title, description }] (value)}
				<DropdownMenu.RadioItem indicator={false} {value}>
					<Icon class="text-muted-foreground" />
					<span class="grid min-w-0 gap-0.5">
						<span class="font-medium">{title}</span>
						<span class="text-[11px] text-muted-foreground">{description}</span>
					</span>
				</DropdownMenu.RadioItem>
			{/each}
		</DropdownMenu.RadioGroup>
	</DropdownMenu.Content>
</DropdownMenu.Root>
