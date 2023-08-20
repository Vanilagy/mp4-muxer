import * as esbuild from 'esbuild';

const baseConfig = {
	entryPoints: ['src/index.ts'],
	bundle: true,
	logLevel: 'info'
};

const umdConfig = {
	...baseConfig,
	format: 'iife',

	// The following are hacks to basically make this an UMD module. No native support for that in esbuild as of today
	globalName: 'Mp4Muxer',

	footer: {
		js:
`if (typeof module === "object" && typeof module.exports === "object") Object.assign(module.exports, Mp4Muxer)`
	}
};

const esmConfig = {
	...baseConfig,
	format: 'esm'
};

let ctxUmd = await esbuild.context({
	...umdConfig,
	outfile: 'build/mp4-muxer.js'
});
let ctxEsm = await esbuild.context({
	...esmConfig,
	outfile: 'build/mp4-muxer.mjs'
});
let ctxUmdMinified = await esbuild.context({
	...umdConfig,
	outfile: 'build/mp4-muxer.min.js',
	minify: true
});
let ctxEsmMinified = await esbuild.context({
	...esmConfig,
	outfile: 'build/mp4-muxer.min.mjs',
	minify: true
});

await Promise.all([ctxUmd.watch(), ctxEsm.watch(), ctxUmdMinified.watch(), ctxEsmMinified.watch()]);