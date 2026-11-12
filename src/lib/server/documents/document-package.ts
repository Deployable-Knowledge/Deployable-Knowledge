import {
	documentChunks,
	documents,
	type Document,
	type DocumentChunk
} from '#lib/server/database/schema';

export const PACKAGE_FORMAT = 'deployable-knowledge.documents';
export const PACKAGE_FORMAT_VERSION = 2;
const READABLE_FORMAT_VERSIONS = [1, 2] as const;

export type PackageFormatVersion = (typeof READABLE_FORMAT_VERSIONS)[number];

export const PACKAGE_FILES = {
	manifest: 'manifest.json',
	document: 'document.json',
	chunks: 'chunks.jsonl',
	embeddings: 'embeddings.npy'
} as const;

export const FLOAT32_BYTES = 4;

export interface PackageEmbedding {
	model: string;
	dimensions: number;
	dtype: 'float32';
}

export interface PackageManifestDocument {
	id: string;
	title: string;
	sourceType: Document['sourceType'];
	path: string;
	chunkCount: number;
	embeddedChunkCount: number;
}

export interface PackageManifest {
	format: typeof PACKAGE_FORMAT;
	formatVersion: PackageFormatVersion;
	appVersion: string;
	exportedAt: string;
	embedding: PackageEmbedding | null;
	documents: PackageManifestDocument[];
}

export interface PackageSyncedFrom {
	folderId: string | null;
	folderName: string;
	relativePath: string;
	lastModified: number | null;
	size: number | null;
}

export interface PackageDocument {
	id: string;
	title: string;
	sourceType: Document['sourceType'];
	origin: Document['origin'];
	active: boolean;
	localOnly: boolean;
	tags: string[];
	createdAt: string;
	updatedAt: string;
	syncedFrom: PackageSyncedFrom | null;
	originalFile: string | null;
	storedFile: string | null;
	sourceUrl: string | null;
}

export type PackageChunk = Pick<
	DocumentChunk,
	'id' | 'chunkIndex' | 'pageIndex' | 'chunkType' | 'content' | 'startMs' | 'endMs' | 'speaker'
> & {
	embeddingRow: number | null;
};

export interface NpyMatrix {
	rows: number;
	dimensions: number;
	data: Buffer;
}

export class PackageFormatError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'PackageFormatError';
	}
}

class Fields {
	private readonly values: Record<string, unknown>;

	constructor(
		value: unknown,
		private readonly source: string
	) {
		if (typeof value !== 'object' || value === null || Array.isArray(value)) {
			throw new PackageFormatError(`${source} is not a JSON object.`);
		}
		this.values = value as Record<string, unknown>;
	}

	private invalid(key: string, expected: string): never {
		throw new PackageFormatError(`${this.source} has no valid "${key}" (expected ${expected}).`);
	}

	string(key: string): string {
		const value = this.values[key];
		return typeof value === 'string' ? value : this.invalid(key, 'text');
	}

	nullableString(key: string): string | null {
		return this.values[key] === null ? null : this.string(key);
	}

	boolean(key: string): boolean {
		const value = this.values[key];
		return typeof value === 'boolean' ? value : this.invalid(key, 'true or false');
	}

	integer(key: string, minimum = 0): number {
		const value = this.values[key];
		return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
			? value
			: this.invalid(key, `a whole number of at least ${minimum}`);
	}

	nullableInteger(key: string, minimum = 0): number | null {
		return this.values[key] === null ? null : this.integer(key, minimum);
	}

	oneOf<T extends string>(key: string, allowed: readonly T[]): T {
		const value = this.values[key];
		return allowed.find((item) => item === value) ?? this.invalid(key, allowed.join(', '));
	}

	array(key: string): unknown[] {
		const value = this.values[key];
		return Array.isArray(value) ? value : this.invalid(key, 'a list');
	}

	stringArray(key: string): string[] {
		const items = this.array(key);
		return items.every((item): item is string => typeof item === 'string')
			? items
			: this.invalid(key, 'a list of text');
	}

	object(key: string): Fields {
		return new Fields(this.values[key], `${this.source} "${key}"`);
	}

	optionalString(key: string): string | null {
		return this.values[key] === undefined ? null : this.nullableString(key);
	}

	nullableObject(key: string): Fields | null {
		return this.values[key] === null ? null : this.object(key);
	}
}

export function parseManifest(value: unknown): PackageManifest {
	const manifest = new Fields(value, PACKAGE_FILES.manifest);
	if (manifest.string('format') !== PACKAGE_FORMAT) {
		throw new PackageFormatError('This zip is not a document export.');
	}
	const formatVersion = manifest.integer('formatVersion', 1);
	const version = READABLE_FORMAT_VERSIONS.find((readable) => readable === formatVersion);
	if (version === undefined) {
		throw new PackageFormatError(
			`This export uses format version ${formatVersion}, which this version of the app can't read.`
		);
	}

	const embedding = manifest.nullableObject('embedding');
	return {
		format: PACKAGE_FORMAT,
		formatVersion: version,
		appVersion: manifest.string('appVersion'),
		exportedAt: manifest.string('exportedAt'),
		embedding: embedding && {
			model: embedding.string('model'),
			dimensions: embedding.integer('dimensions', 1),
			dtype: embedding.oneOf('dtype', ['float32'])
		},
		documents: manifest.array('documents').map((item, index) => {
			const entry = new Fields(item, `${PACKAGE_FILES.manifest} document ${index + 1}`);
			return {
				id: entry.string('id'),
				title: entry.string('title'),
				sourceType: entry.oneOf('sourceType', documents.sourceType.enumValues),
				path: entry.string('path'),
				chunkCount: entry.integer('chunkCount'),
				embeddedChunkCount: entry.integer('embeddedChunkCount')
			};
		})
	};
}

function parseSyncedFrom(syncedFrom: Fields, version: PackageFormatVersion): PackageSyncedFrom {
	if (version === 1) {
		return {
			folderId: null,
			folderName: syncedFrom.string('folder'),
			relativePath: syncedFrom.string('relativePath'),
			lastModified: null,
			size: null
		};
	}
	return {
		folderId: syncedFrom.string('folderId'),
		folderName: syncedFrom.string('folderName'),
		relativePath: syncedFrom.string('relativePath'),
		lastModified: syncedFrom.integer('lastModified'),
		size: syncedFrom.integer('size')
	};
}

export function parseDocument(
	value: unknown,
	source: string,
	version: PackageFormatVersion
): PackageDocument {
	const document = new Fields(value, source);
	const syncedFrom = document.nullableObject('syncedFrom');
	return {
		id: document.string('id'),
		title: document.string('title'),
		sourceType: document.oneOf('sourceType', documents.sourceType.enumValues),
		origin: document.oneOf('origin', documents.origin.enumValues),
		active: document.boolean('active'),
		localOnly: document.boolean('localOnly'),
		tags: document.stringArray('tags'),
		createdAt: document.string('createdAt'),
		updatedAt: document.string('updatedAt'),
		syncedFrom: syncedFrom && parseSyncedFrom(syncedFrom, version),
		originalFile: document.nullableString('originalFile'),
		storedFile:
			version === 1 ? document.optionalString('storedFile') : document.nullableString('storedFile'),
		sourceUrl: document.nullableString('sourceUrl')
	};
}

export function parseChunks(jsonl: Buffer, source: string): PackageChunk[] {
	const lines = jsonl.toString('utf8').split('\n');
	if (lines.at(-1) === '') lines.pop();

	return lines.map((line, index) => {
		const where = `${source} line ${index + 1}`;
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			throw new PackageFormatError(`${where} is not valid JSON.`);
		}
		const chunk = new Fields(value, where);
		return {
			id: chunk.string('id'),
			chunkIndex: chunk.integer('chunkIndex'),
			pageIndex: chunk.integer('pageIndex'),
			chunkType: chunk.oneOf('chunkType', documentChunks.chunkType.enumValues),
			content: chunk.string('content'),
			startMs: chunk.nullableInteger('startMs'),
			endMs: chunk.nullableInteger('endMs'),
			speaker: chunk.nullableInteger('speaker'),
			embeddingRow: chunk.nullableInteger('embeddingRow')
		};
	});
}

const NPY_MAGIC = Buffer.from('\x93NUMPY', 'latin1');
const NPY_ALIGNMENT = 64;

export function encodeNpy(rows: Buffer[], dimensions: number): Buffer {
	const preamble = Buffer.alloc(NPY_MAGIC.length + 4);
	NPY_MAGIC.copy(preamble);
	preamble.writeUInt8(1, 6);
	preamble.writeUInt8(0, 7);

	const dict = `{'descr': '<f4', 'fortran_order': False, 'shape': (${rows.length}, ${dimensions}), }`;
	const padding =
		(NPY_ALIGNMENT - ((preamble.length + dict.length + 1) % NPY_ALIGNMENT)) % NPY_ALIGNMENT;
	const header = `${dict}${' '.repeat(padding)}\n`;
	preamble.writeUInt16LE(header.length, 8);

	return Buffer.concat([preamble, Buffer.from(header, 'latin1'), ...rows]);
}

export function decodeNpy(file: Buffer, source: string): NpyMatrix {
	const invalid = (reason: string) => new PackageFormatError(`${source} ${reason}.`);
	if (file.length < NPY_MAGIC.length + 4 || !file.subarray(0, NPY_MAGIC.length).equals(NPY_MAGIC)) {
		throw invalid('is not a NumPy file');
	}

	const major = file.readUInt8(6);
	if (major < 1 || major > 3) throw invalid(`uses NumPy format version ${major}`);
	const lengthBytes = major === 1 ? 2 : 4;
	const headerStart = NPY_MAGIC.length + 2 + lengthBytes;
	const headerLength = major === 1 ? file.readUInt16LE(8) : file.readUInt32LE(8);
	const header = file.toString(
		major === 3 ? 'utf8' : 'latin1',
		headerStart,
		headerStart + headerLength
	);

	if (!/'descr':\s*'<f4'/.test(header)) throw invalid('is not a little-endian float32 matrix');
	if (!/'fortran_order':\s*False/.test(header)) throw invalid('is not stored in row order');
	const shape = header.match(/'shape':\s*\(\s*(\d+)\s*,\s*(\d+)\s*,?\s*\)/);
	if (!shape) throw invalid('is not a two-dimensional matrix');

	const rows = Number(shape[1]);
	const dimensions = Number(shape[2]);
	const data = file.subarray(headerStart + headerLength);
	if (data.length !== rows * dimensions * FLOAT32_BYTES) {
		throw invalid(
			`holds ${data.length} bytes, not the ${rows} × ${dimensions} its header promises`
		);
	}
	return { rows, dimensions, data };
}

export function npyRow(matrix: NpyMatrix, row: number): Float32Array {
	const rowBytes = matrix.dimensions * FLOAT32_BYTES;
	const start = matrix.data.byteOffset + row * rowBytes;
	return new Float32Array(matrix.data.buffer.slice(start, start + rowBytes));
}
