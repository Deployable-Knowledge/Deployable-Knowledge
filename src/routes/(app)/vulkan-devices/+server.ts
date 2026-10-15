import { error, json } from '@sveltejs/kit';

import type { ApiVulkanDeviceUpdate } from '$lib/types';
import { setVulkanDevice } from '$lib/server/database/app-state';
import { getVulkanDevicesStatus, listVulkanDevices } from '$lib/server/providers/vulkan-devices';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => json(await getVulkanDevicesStatus());

export const PATCH: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as Partial<
		Record<keyof ApiVulkanDeviceUpdate, unknown>
	> | null;

	const requested = body?.device;
	const device =
		requested === null
			? null
			: (await listVulkanDevices()).find(({ index }) => index === requested);
	if (device === undefined) throw error(400, 'Unknown Vulkan device.');

	await setVulkanDevice(device?.index ?? null);
	return json(await getVulkanDevicesStatus());
};
