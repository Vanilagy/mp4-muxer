import { Sample } from './muxer';

let bytes = new Uint8Array(8);
let view = new DataView(bytes.buffer);

export const u8 = (value: number) => {
	return [(value % 0x100 + 0x100) % 0x100];
};

export const u16 = (value: number) => {
	view.setUint16(0, value, false);
	return [bytes[0], bytes[1]];
};

export const i16 = (value: number) => {
	view.setInt16(0, value, false);
	return [bytes[0], bytes[1]];
};

export const u24 = (value: number) => {
	view.setUint32(0, value, false);
	return [bytes[1], bytes[2], bytes[3]];
};

export const u32 = (value: number) => {
	view.setUint32(0, value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3]];
};

export const i32 = (value: number) => {
	view.setInt32(0, value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3]];
};

export const u64 = (value: number) => {
	view.setUint32(0, Math.floor(value / 2**32), false);
	view.setUint32(4, value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
};

export const fixed_8_8 = (value: number) => {
	view.setInt16(0, 2**8 * value, false);
	return [bytes[0], bytes[1]];
};

export const fixed_16_16 = (value: number) => {
	view.setInt32(0, 2**16 * value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3]];
};

export const fixed_2_30 = (value: number) => {
	view.setInt32(0, 2**30 * value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3]];
};

export const ascii = (text: string, nullTerminated = false) => {
	let bytes = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
	if (nullTerminated) bytes.push(0x00);
	return bytes;
};

export const last = <T>(arr: T[]) => {
	return arr && arr[arr.length - 1];
};

export const lastPresentedSample = (samples: Sample[]): Sample | undefined => {
	let result: Sample | undefined = undefined;

	for (let sample of samples) {
		if (!result || sample.presentationTimestamp > result.presentationTimestamp) {
			result = sample;
		}
	}

	return result;
};

export const intoTimescale = (timeInSeconds: number, timescale: number, round = true) => {
	let value = timeInSeconds * timescale;
	return round ? Math.round(value) : value;
};

export type TransformationMatrix = [number, number, number, number, number, number, number, number, number];

export const rotationMatrix = (rotationInDegrees: number): TransformationMatrix => {
	let theta = rotationInDegrees * (Math.PI / 180);
	let cosTheta = Math.cos(theta);
	let sinTheta = Math.sin(theta);

	// Matrices are post-multiplied in MP4, meaning this is the transpose of your typical rotation matrix
	return [
		cosTheta, sinTheta, 0,
		-sinTheta, cosTheta, 0,
		0, 0, 1
	];
};

export const IDENTITY_MATRIX = rotationMatrix(0);

export const matrixToBytes = (matrix: TransformationMatrix) => {
	return [
		fixed_16_16(matrix[0]), fixed_16_16(matrix[1]), fixed_2_30(matrix[2]),
		fixed_16_16(matrix[3]), fixed_16_16(matrix[4]), fixed_2_30(matrix[5]),
		fixed_16_16(matrix[6]), fixed_16_16(matrix[7]), fixed_2_30(matrix[8])
	];
};

export const deepClone = <T>(x: T): T => {
	if (!x) return x;
	if (typeof x !== 'object') return x;
	if (Array.isArray(x)) return x.map(deepClone) as T;
	return Object.fromEntries(Object.entries(x).map(([key, value]) => [key, deepClone(value)])) as T;
};

export const isU32 = (value: number) => {
	return value >= 0 && value < 2**32;
};
