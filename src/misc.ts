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

export const u64 = (value: number) => {
	view.setUint32(0, Math.floor(value / 2**32), false);
	view.setUint32(4, value, false);
	return [bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5], bytes[6], bytes[7]];
};

export const fixed16 = (value: number) => {
	view.setUint8(0, value);
	view.setUint8(1, value << 8);
	return [bytes[0], bytes[1]];
};

export const fixed32 = (value: number) => {
	view.setUint16(0, value, false);
	view.setUint16(2, value << 16, false);
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