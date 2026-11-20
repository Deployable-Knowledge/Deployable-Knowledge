import { fork } from 'node:child_process';
import { createRequire } from 'node:module';

import type { ApiVulkanDevice, ApiVulkanDevicesStatus } from '#lib/types';
import { getVulkanDevice } from '#lib/server/database/app-state';
import { createLogger } from '#lib/server/logging';
import { getSupportedGpuTypes } from './runtime';

const VISIBLE_DEVICES_ENV = 'GGML_VK_VISIBLE_DEVICES';
const PROBE_SCRIPT = '#lib/server/providers/llamacpp/vulkan-probe.ts';
const PROBE_TIMEOUT_MS = 60_000;
const MAX_DEVICE_INDEX = 8;

const log = createLogger('models');

type VulkanDeviceState = {
	active?: number | null;
	devices?: Promise<ApiVulkanDevice[]>;
};

const state = ((
	globalThis as typeof globalThis & { deployableKnowledgeVulkanState?: VulkanDeviceState }
).deployableKnowledgeVulkanState ??= {});

export async function applyVulkanDevice(): Promise<void> {
	if (state.active !== undefined) return;

	state.active = await getVulkanDevice();
	if (state.active === null) return;

	process.env[VISIBLE_DEVICES_ENV] = String(state.active);
	log.info('Vulkan limited to one device', { device: state.active });
}

function probeDeviceNames(visibleDevices: string | undefined): Promise<string[] | null> {
	const probeScript = createRequire(import.meta.url).resolve(PROBE_SCRIPT);

	return new Promise((resolve) => {
		const child = fork(probeScript, {
			env: { ...process.env, [VISIBLE_DEVICES_ENV]: visibleDevices },
			stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
			timeout: PROBE_TIMEOUT_MS
		});

		let names: string[] | null = null;
		child.once('message', (message) => {
			if (Array.isArray(message) && message.every((name) => typeof name === 'string')) {
				names = message;
			}
		});
		child.once('error', () => resolve(null));
		child.once('close', () => resolve(names));
	});
}

async function detectVulkanDevices(): Promise<ApiVulkanDevice[]> {
	if (!(await getSupportedGpuTypes()).includes('vulkan')) return [];

	const unmatched = (await probeDeviceNames(undefined)) ?? [];
	const probes = unmatched.map((_, index) => probeDeviceNames(String(index)));
	const devices: ApiVulkanDevice[] = [];

	for (let index = 0; unmatched.length > 0 && index < MAX_DEVICE_INDEX; index++) {
		const [name] = (await (probes[index] ?? probeDeviceNames(String(index)))) ?? [];
		const match = name === undefined ? -1 : unmatched.indexOf(name);
		if (match === -1) continue;

		unmatched.splice(match, 1);
		devices.push({ index, name });
	}

	return devices;
}

export function listVulkanDevices(): Promise<ApiVulkanDevice[]> {
	return (state.devices ??= detectVulkanDevices());
}

export async function getVulkanDevicesStatus(): Promise<ApiVulkanDevicesStatus> {
	return {
		devices: await listVulkanDevices(),
		selected: await getVulkanDevice(),
		active: state.active ?? null
	};
}
