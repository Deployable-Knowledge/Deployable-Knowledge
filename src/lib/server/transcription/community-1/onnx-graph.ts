/*
 * Minimal ONNX protobuf access for the embedding model. Only the handful of fields needed to read
 * initializers and expose an intermediate tensor are understood; everything else is skipped.
 *
 * Field numbers follow onnx.proto: ModelProto.graph = 7; GraphProto.initializer = 5,
 * GraphProto.output = 12; TensorProto.dims = 1, data_type = 2, float_data = 4, name = 8,
 * raw_data = 9, data_location = 14; ValueInfoProto.name = 1, type = 2; TypeProto.tensor_type = 1;
 * TypeProto.Tensor.elem_type = 1.
 */

const WIRE_VARINT = 0;
const WIRE_FIXED64 = 1;
const WIRE_LENGTH_DELIMITED = 2;
const WIRE_FIXED32 = 5;

const ONNX_FLOAT = 1;
const ONNX_EXTERNAL_DATA = 1;

interface WireField {
	field: number;
	wireType: number;
	/** Varint value for wire type 0. */
	value: number;
	/** Payload for wire types 1, 2 and 5. */
	bytes: Uint8Array;
}

function readVarint(bytes: Uint8Array, offset: number): [value: number, next: number] {
	let value = 0;
	let multiplier = 1;
	let position = offset;

	for (;;) {
		if (position >= bytes.length) throw new Error('Truncated protobuf varint.');
		const byte = bytes[position++];
		value += (byte & 0x7f) * multiplier;
		if (byte < 0x80) return [value, position];
		multiplier *= 128;
	}
}

function* readFields(bytes: Uint8Array): Generator<WireField> {
	let offset = 0;

	while (offset < bytes.length) {
		const [key, afterKey] = readVarint(bytes, offset);
		const field = Math.floor(key / 8);
		const wireType = key % 8;
		offset = afterKey;

		if (wireType === WIRE_VARINT) {
			const [value, next] = readVarint(bytes, offset);
			offset = next;
			yield { field, wireType, value, bytes: bytes.subarray(0, 0) };
		} else if (wireType === WIRE_LENGTH_DELIMITED) {
			const [length, start] = readVarint(bytes, offset);
			offset = start + length;
			if (offset > bytes.length) throw new Error('Truncated protobuf field.');
			yield { field, wireType, value: length, bytes: bytes.subarray(start, offset) };
		} else if (wireType === WIRE_FIXED64 || wireType === WIRE_FIXED32) {
			const size = wireType === WIRE_FIXED64 ? 8 : 4;
			yield { field, wireType, value: 0, bytes: bytes.subarray(offset, offset + size) };
			offset += size;
		} else {
			throw new Error(`Unsupported protobuf wire type ${wireType}.`);
		}
	}
}

function writeVarint(value: number): number[] {
	const out: number[] = [];
	let remaining = value;

	while (remaining >= 0x80) {
		out.push((remaining % 128) | 0x80);
		remaining = Math.floor(remaining / 128);
	}
	out.push(remaining);
	return out;
}

function lengthDelimited(field: number, payload: Uint8Array): Uint8Array {
	return Uint8Array.from([
		...writeVarint(field * 8 + WIRE_LENGTH_DELIMITED),
		...writeVarint(payload.length),
		...payload
	]);
}

export interface FloatInitializer {
	dims: number[];
	data: Float32Array;
}

function parseFloatTensor(tensor: Uint8Array, name: string): FloatInitializer {
	const dims: number[] = [];
	let dataType = 0;
	let raw: Uint8Array | undefined;
	const floats: number[] = [];

	for (const entry of readFields(tensor)) {
		if (entry.field === 1 && entry.wireType === WIRE_VARINT) dims.push(entry.value);
		if (entry.field === 1 && entry.wireType === WIRE_LENGTH_DELIMITED) {
			let offset = 0;
			while (offset < entry.bytes.length) {
				const [dim, next] = readVarint(entry.bytes, offset);
				dims.push(dim);
				offset = next;
			}
		}
		if (entry.field === 2 && entry.wireType === WIRE_VARINT) dataType = entry.value;
		if (entry.field === 4 && entry.wireType === WIRE_LENGTH_DELIMITED) {
			const view = new DataView(entry.bytes.buffer, entry.bytes.byteOffset, entry.bytes.length);
			for (let offset = 0; offset < entry.bytes.length; offset += 4) {
				floats.push(view.getFloat32(offset, true));
			}
		}
		if (entry.field === 9 && entry.wireType === WIRE_LENGTH_DELIMITED) raw = entry.bytes;
		if (entry.field === 14 && entry.value === ONNX_EXTERNAL_DATA) {
			throw new Error(`ONNX initializer ${name} uses external data, which is not supported.`);
		}
	}

	if (dataType !== ONNX_FLOAT) {
		throw new Error(`ONNX initializer ${name} has data type ${dataType}; expected FLOAT.`);
	}

	const size = dims.reduce((product, dimension) => product * dimension, 1);
	let data: Float32Array;

	if (raw) {
		// Copy so the result is aligned and independent of the model buffer.
		data = new Float32Array(raw.slice().buffer);
	} else {
		data = Float32Array.from(floats);
	}

	if (data.length !== size) {
		throw new Error(`ONNX initializer ${name} holds ${data.length} values; expected ${size}.`);
	}

	return { dims, data };
}

/** Reads a FLOAT initializer from an ONNX model by name. */
export function findFloatInitializer(model: Uint8Array, name: string): FloatInitializer {
	for (const modelField of readFields(model)) {
		if (modelField.field !== 7 || modelField.wireType !== WIRE_LENGTH_DELIMITED) continue;

		for (const graphField of readFields(modelField.bytes)) {
			if (graphField.field !== 5 || graphField.wireType !== WIRE_LENGTH_DELIMITED) continue;

			for (const tensorField of readFields(graphField.bytes)) {
				if (tensorField.field !== 8 || tensorField.wireType !== WIRE_LENGTH_DELIMITED) continue;
				if (new TextDecoder().decode(tensorField.bytes) !== name) break;
				return parseFloatTensor(graphField.bytes, name);
			}
		}
	}

	throw new Error(`ONNX initializer ${name} was not found.`);
}

/**
 * Returns the model with an intermediate FLOAT tensor added as a graph output.
 *
 * Protobuf merges a repeated embedded message when the same field appears again, so appending an
 * encoded `ModelProto { graph { output } }` fragment extends the graph outputs without re-encoding
 * (and possibly losing) any field of the original model.
 */
export function withExtraFloatOutput(model: Uint8Array, tensorName: string): Uint8Array {
	const tensorType = Uint8Array.from([...writeVarint(1 * 8 + WIRE_VARINT), ONNX_FLOAT]);
	const typeProto = lengthDelimited(1, tensorType);
	const valueInfo = Uint8Array.from([
		...lengthDelimited(1, new TextEncoder().encode(tensorName)),
		...lengthDelimited(2, typeProto)
	]);
	const fragment = lengthDelimited(7, lengthDelimited(12, valueInfo));

	const extended = new Uint8Array(model.length + fragment.length);
	extended.set(model, 0);
	extended.set(fragment, model.length);
	return extended;
}
