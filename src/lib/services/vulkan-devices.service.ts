import { API_VULKAN_DEVICES } from '#lib/constants';
import type { ApiVulkanDevicesStatus, ApiVulkanDeviceUpdate } from '#lib/types';
import { apiFetch, apiPatch } from '#lib/utils';

export class VulkanDevicesService {
	static getStatus() {
		return apiFetch<ApiVulkanDevicesStatus>(API_VULKAN_DEVICES);
	}

	static update(update: ApiVulkanDeviceUpdate) {
		return apiPatch<ApiVulkanDevicesStatus, ApiVulkanDeviceUpdate>(API_VULKAN_DEVICES, update);
	}
}
