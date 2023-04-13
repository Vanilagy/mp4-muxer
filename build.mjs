import * as esbuild from 'esbuild';

const config = {
	entryPoints: ['src/index.ts'],
	bundle: true,
	format: 'iife',
	logLevel: 'info',

	// The following are hacks to basically make this an UMD module. No native support for that in esbuild as of today
	globalName: 'Mp4Muxer',

	// Object.assign(module.exports, Mp4Muxer) would make us lose named exports in CJS-to-ESM interop
	footer: {
		js:
`if (typeof module === "object" && typeof module.exports === "object") {
	module.exports.Muxer = Mp4Muxer.Muxer;
	module.exports.ArrayBufferTarget = Mp4Muxer.ArrayBufferTarget;
	module.exports.StreamTarget = Mp4Muxer.StreamTarget;
	module.exports.FileSystemWritableFileStreamTarget = Mp4Muxer.FileSystemWritableFileStreamTarget;
}`
	}
};

let ctx = await esbuild.context({
	...config,
	outfile: 'build/mp4-muxer.js'
});
let ctxMinified = await esbuild.context({
	...config,
	outfile: 'build/mp4-muxer.min.js',
	minify: true
});

await Promise.all([ctx.watch(), ctxMinified.watch()]);