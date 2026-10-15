<script lang="ts">
	import { onMount } from 'svelte';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { vulkanDevicesStore } from '$lib/stores';

	const AUTOMATIC = 'auto';

	const status = $derived(vulkanDevicesStore.status);
	const selected = $derived(status?.selected ?? null);
	const restartPending = $derived(status !== null && status.selected !== status.active);
	const visible = $derived(
		vulkanDevicesStore.loading ||
			vulkanDevicesStore.error !== null ||
			Boolean(status?.devices.length) ||
			selected !== null
	);

	function deviceLabel(index: number | null): string {
		if (index === null) return 'Automatic';
		const device = status?.devices.find((entry) => entry.index === index);
		return device?.name ?? `Device ${index} (not detected)`;
	}

	function triggerLabel(): string {
		if (vulkanDevicesStore.loading) return 'Detecting GPUs…';
		return deviceLabel(selected);
	}

	function selectDevice(value: string): void {
		void vulkanDevicesStore.select(value === AUTOMATIC ? null : Number(value));
	}

	onMount(() => void vulkanDevicesStore.load());
</script>

{#if visible}
	<div class="grid gap-2">
		<Label for="settings-vulkan-device">Vulkan GPU</Label>
		<Select.Root
			disabled={!status || vulkanDevicesStore.saving}
			onValueChange={selectDevice}
			type="single"
			value={selected === null ? AUTOMATIC : String(selected)}
		>
			<Select.Trigger class="w-full" id="settings-vulkan-device">
				<span class="truncate">{triggerLabel()}</span>
			</Select.Trigger>
			<Select.Content>
				<Select.Item label="Automatic" value={AUTOMATIC} />
				{#each status?.devices ?? [] as device (device.index)}
					<Select.Item label={device.name} value={String(device.index)} />
				{/each}
			</Select.Content>
		</Select.Root>
		{#if vulkanDevicesStore.error}
			<p class="m-0 text-xs text-destructive" role="alert">{vulkanDevicesStore.error}</p>
		{:else if restartPending}
			<p class="m-0 text-xs text-muted-foreground" role="status">Restart the app to switch GPUs.</p>
		{/if}
	</div>
{/if}
