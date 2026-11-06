import type { LlamaGpuMode } from '#lib/types';

const GPU_MODES: readonly LlamaGpuMode[] = ['auto', 'cpu', 'vulkan'];

export function sanitizeGpuMode(value: unknown): LlamaGpuMode {
	return GPU_MODES.includes(value as LlamaGpuMode) ? (value as LlamaGpuMode) : 'auto';
}
