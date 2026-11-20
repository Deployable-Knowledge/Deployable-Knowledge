import { getLlama, LlamaLogLevel } from 'node-llama-cpp';

const llama = await getLlama({
	gpu: 'vulkan',
	build: 'never',
	logLevel: LlamaLogLevel.disabled,
	progressLogs: false
});

process.send?.(await llama.getGpuDeviceNames(), () => process.exit(0));
