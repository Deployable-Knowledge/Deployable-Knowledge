/*
 * Community-1 model assets are provisioned by hand into <cwd>/models/community-1/:
 *
 *   segmentation.onnx        FredrikKarlssonSpeech/pyannote-speaker-diarization-onnx
 *                            segmentation/model.onnx (FP32)
 *   embedding.onnx           same repository, embedding/model.onnx (FP32)
 *   plda/plda.npz            pyannote/speaker-diarization-community-1 plda/plda.npz
 *   plda/xvec_transform.npz  same repository, plda/xvec_transform.npz
 *
 * The pyannote repository is gated on Hugging Face: accept its conditions before downloading.
 * Both sources are released under CC BY 4.0 and must be attributed. The hashes below pin the
 * exact revisions the TypeScript port was validated against.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const COMMUNITY1_MODEL_DIR = resolve(process.cwd(), 'models', 'community-1');

const ONNX_SOURCE =
	'FredrikKarlssonSpeech/pyannote-speaker-diarization-onnx@0a7a3bf63c16c6718a7411a3e3fe01598fc46550';
const PLDA_SOURCE =
	'pyannote/speaker-diarization-community-1@3533c8cf8e369892e6b79ff1bf80f7b0286a54ee';

const ASSET_FILES = {
	segmentation: {
		path: 'segmentation.onnx',
		source: `${ONNX_SOURCE}/segmentation/model.onnx`,
		sha256: 'af62796adfc46ab36fb27c183e7fe6530a745c665b64e949acd73bf01a18a31a'
	},
	embedding: {
		path: 'embedding.onnx',
		source: `${ONNX_SOURCE}/embedding/model.onnx`,
		sha256: 'eb9ce1df866b8b3ff0219e2414ac1575c883bdd7562097a94a83e039f0c887b1'
	},
	plda: {
		path: 'plda/plda.npz',
		source: `${PLDA_SOURCE}/plda/plda.npz`,
		sha256: '9b77bcd840692710dd3496f62ecfeed8d8e5f002fd991b785079b244eab7d255'
	},
	xvecTransform: {
		path: 'plda/xvec_transform.npz',
		source: `${PLDA_SOURCE}/plda/xvec_transform.npz`,
		sha256: '325f1ce8e48f7e55e9c8aa47e05d2766b7c48c4b25b8de8dd751e7a4cc5fbe8f'
	}
} as const;

export type Community1Assets = Record<keyof typeof ASSET_FILES, Uint8Array>;

async function readVerifiedAsset(name: keyof typeof ASSET_FILES): Promise<Uint8Array> {
	const asset = ASSET_FILES[name];
	const path = resolve(COMMUNITY1_MODEL_DIR, asset.path);

	let bytes: Buffer;
	try {
		bytes = await readFile(path);
	} catch (error) {
		throw new Error(`Community-1 asset is missing: ${path} (download ${asset.source})`, {
			cause: error
		});
	}

	const digest = createHash('sha256').update(bytes).digest('hex');
	if (digest !== asset.sha256) {
		throw new Error(
			`Community-1 asset ${path} has sha256 ${digest}; expected ${asset.sha256} from ${asset.source}`
		);
	}

	return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export async function loadCommunity1Assets(): Promise<Community1Assets> {
	const [segmentation, embedding, plda, xvecTransform] = await Promise.all([
		readVerifiedAsset('segmentation'),
		readVerifiedAsset('embedding'),
		readVerifiedAsset('plda'),
		readVerifiedAsset('xvecTransform')
	]);

	return { segmentation, embedding, plda, xvecTransform };
}
