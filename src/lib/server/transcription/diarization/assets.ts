import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const MODEL_DIR = resolve(process.cwd(), 'models', 'speaker-diarization');

interface ModelFile {
	path: string;
	url: string;
	sha256: string;
}

const MODEL_FILES = {
	segmentation: {
		path: 'segmentation-3.0.onnx',
		url: 'https://huggingface.co/onnx-community/pyannote-segmentation-3.0/resolve/733a93b6473d019a773298e08cefa686894b1854/onnx/model.onnx',
		sha256: '057ee564753071c0b09b5b611648b50ac188d50846bff5f01e9f7bbf1591ea25'
	},
	embedding: {
		path: 'ecapa-tdnn.onnx',
		url: 'https://huggingface.co/astrolabos/ecapa-tdnn/resolve/a97d2ae135a50c79d9bc6f1b8353700590369645/ecapa_tdnn.onnx',
		sha256: '9acb086d5d9efca07266930ce03772f13cad5fd5a415bcf014ee4d82bed26311'
	}
} satisfies Record<string, ModelFile>;

function assertDigest(bytes: Uint8Array, model: ModelFile, origin: string): void {
	const digest = createHash('sha256').update(bytes).digest('hex');
	if (digest !== model.sha256) {
		throw new Error(`Diarization model ${origin} has sha256 ${digest}; expected ${model.sha256}.`);
	}
}

async function downloadModel(model: ModelFile, path: string): Promise<Uint8Array> {
	const response = await fetch(model.url);
	if (!response.ok) {
		throw new Error(`Could not download diarization model ${model.url}: HTTP ${response.status}.`);
	}

	const bytes = new Uint8Array(await response.arrayBuffer());
	assertDigest(bytes, model, model.url);

	await mkdir(dirname(path), { recursive: true });
	await writeFile(`${path}.download`, bytes);
	await rename(`${path}.download`, path);
	return bytes;
}

async function loadModel(model: ModelFile): Promise<Uint8Array> {
	const path = resolve(MODEL_DIR, model.path);

	let file: Buffer;
	try {
		file = await readFile(path);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
		return downloadModel(model, path);
	}

	const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
	assertDigest(bytes, model, path);
	return bytes;
}

export async function loadDiarizationModels(): Promise<{
	segmentation: Uint8Array;
	embedding: Uint8Array;
}> {
	const [segmentation, embedding] = await Promise.all([
		loadModel(MODEL_FILES.segmentation),
		loadModel(MODEL_FILES.embedding)
	]);
	return { segmentation, embedding };
}
