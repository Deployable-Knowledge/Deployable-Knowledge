import { VulkanDevicesService } from '$lib/services';
import type { ApiVulkanDevicesStatus } from '$lib/types';

class VulkanDevicesStore {
	status = $state<ApiVulkanDevicesStatus | null>(null);
	loading = $state(false);
	saving = $state(false);
	error = $state<string | null>(null);

	async load(): Promise<void> {
		if (this.status || this.loading) return;

		this.loading = true;
		this.error = null;
		try {
			this.status = await VulkanDevicesService.getStatus();
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not detect the GPUs.';
		} finally {
			this.loading = false;
		}
	}

	async select(device: number | null): Promise<void> {
		if (!this.status || this.saving || this.status.selected === device) return;

		this.saving = true;
		this.error = null;
		try {
			this.status = await VulkanDevicesService.update({ device });
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Could not change the GPU.';
		} finally {
			this.saving = false;
		}
	}
}

export const vulkanDevicesStore = new VulkanDevicesStore();
