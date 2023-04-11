export const u16 = (value: number) => {
	let bytes = new Uint8Array(2);
	let view = new DataView(bytes.buffer);
	view.setUint16(0, value, false);
	return [...bytes];
};

export const i16 = (value: number) => {
	let bytes = new Uint8Array(2);
	let view = new DataView(bytes.buffer);
	view.setInt16(0, value, false);
	return [...bytes];
};

export const u24 = (value: number) => {
	let bytes = new Uint8Array(4);
	let view = new DataView(bytes.buffer);
	view.setUint32(0, value, false);
	return [...bytes].slice(1);
};

export const u32 = (value: number) => {
	let bytes = new Uint8Array(4);
	let view = new DataView(bytes.buffer);
	view.setUint32(0, value, false);
	return [...bytes];
};

export const fixed16 = (value: number) => {
	let bytes = new Uint8Array(2);
	let view = new DataView(bytes.buffer);
	view.setUint8(0, value);
	view.setUint8(1, value << 8);
	return [...bytes];
};

export const fixed32 = (value: number) => {
	let bytes = new Uint8Array(4);
	let view = new DataView(bytes.buffer);
	view.setUint16(0, value, false);
	view.setUint16(2, value << 16, false);
	return [...bytes];
};

export const ascii = (text: string, nullTerminated = false) => {
	let bytes = Array(text.length).fill(null).map((_, i) => text.charCodeAt(i));
	if (nullTerminated) bytes.push(0x00);
	return bytes;
};

export const timestampToUnits = (timestamp: number, timescale: number) => {
	return Math.round(timestamp * timescale);
};

export const last = <T>(arr: T[]) => {
	return arr && arr[arr.length - 1];
};