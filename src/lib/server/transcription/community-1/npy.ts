import { inflateRawSync } from 'node:zlib';

/** A numeric NumPy array, widened to float64 and stored in C order. */
export interface NpyArray {
	shape: number[];
	data: Float64Array;
}

const NPY_MAGIC = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];

type TypedArrayReader = (view: DataView, offset: number) => number;

const DTYPE_READERS: Record<string, { bytes: number; read: TypedArrayReader }> = {
	'<f8': { bytes: 8, read: (view, offset) => view.getFloat64(offset, true) },
	'<f4': { bytes: 4, read: (view, offset) => view.getFloat32(offset, true) },
	'<i8': { bytes: 8, read: (view, offset) => Number(view.getBigInt64(offset, true)) },
	'<i4': { bytes: 4, read: (view, offset) => view.getInt32(offset, true) },
	'|i1': { bytes: 1, read: (view, offset) => view.getInt8(offset) },
	'|u1': { bytes: 1, read: (view, offset) => view.getUint8(offset) },
	'|b1': { bytes: 1, read: (view, offset) => view.getUint8(offset) }
};

export function parseNpy(bytes: Uint8Array): NpyArray {
	if (NPY_MAGIC.some((value, index) => bytes[index] !== value)) {
		throw new Error('Not a .npy file.');
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const major = bytes[6];
	const headerLength = major === 1 ? view.getUint16(8, true) : view.getUint32(8, true);
	const headerStart = major === 1 ? 10 : 12;
	const header = new TextDecoder('latin1').decode(
		bytes.subarray(headerStart, headerStart + headerLength)
	);

	const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
	const fortranOrder = /'fortran_order':\s*(True|False)/.exec(header)?.[1];
	const shapeText = /'shape':\s*\(([^)]*)\)/.exec(header)?.[1];

	if (!descr || !fortranOrder || shapeText === undefined) {
		throw new Error(`Malformed .npy header: ${header}`);
	}
	if (fortranOrder === 'True') throw new Error('Fortran-ordered .npy arrays are not supported.');

	const reader = DTYPE_READERS[descr];
	if (!reader) throw new Error(`Unsupported .npy dtype ${descr}.`);

	const shape = shapeText
		.split(',')
		.map((dimension) => dimension.trim())
		.filter(Boolean)
		.map(Number);
	const size = shape.reduce((product, dimension) => product * dimension, 1);
	const dataStart = headerStart + headerLength;

	if (bytes.byteLength - dataStart < size * reader.bytes) {
		throw new Error(`.npy payload is shorter than its declared shape (${shape.join('x')}).`);
	}

	const data = new Float64Array(size);
	for (let index = 0; index < size; index++) {
		data[index] = reader.read(view, dataStart + index * reader.bytes);
	}

	return { shape, data };
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const ZIP_STORED = 0;
const ZIP_DEFLATED = 8;

/** Reads every `.npy` member of a NumPy `.npz` archive, keyed by name without extension. */
export function parseNpz(bytes: Uint8Array): Map<string, NpyArray> {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

	let eocd = -1;
	for (let offset = bytes.byteLength - 22; offset >= 0; offset--) {
		if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
			eocd = offset;
			break;
		}
	}
	if (eocd < 0) throw new Error('Not a .npz (zip) archive.');

	const entryCount = view.getUint16(eocd + 10, true);
	let offset = view.getUint32(eocd + 16, true);
	const arrays = new Map<string, NpyArray>();

	for (let entry = 0; entry < entryCount; entry++) {
		if (view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
			throw new Error('Corrupt .npz central directory.');
		}

		const method = view.getUint16(offset + 10, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const nameLength = view.getUint16(offset + 28, true);
		const extraLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const localOffset = view.getUint32(offset + 42, true);
		const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
		offset += 46 + nameLength + extraLength + commentLength;

		if (compressedSize === 0xffffffff || localOffset === 0xffffffff) {
			throw new Error(`Zip64 .npz member ${name} is not supported.`);
		}
		if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) {
			throw new Error(`Corrupt .npz local header for ${name}.`);
		}

		const dataStart =
			localOffset +
			30 +
			view.getUint16(localOffset + 26, true) +
			view.getUint16(localOffset + 28, true);
		const payload = bytes.subarray(dataStart, dataStart + compressedSize);

		let member: Uint8Array;
		if (method === ZIP_STORED) {
			member = payload;
		} else if (method === ZIP_DEFLATED) {
			member = inflateRawSync(payload);
		} else {
			throw new Error(`Unsupported .npz compression method ${method} for ${name}.`);
		}

		arrays.set(name.replace(/\.npy$/, ''), parseNpy(member));
	}

	return arrays;
}
