import * as esbuild from 'esbuild';

const config = {
	entryPoints: ['src/index.ts'],
	bundle: true,
	format: 'iife',
	logLevel: 'info',
	// The following are hacks to basically make this an UMD module. No native support for that in esbuild as of today
	globalName: 'Mp4Muxer',
	footer: {
		js: 'if (typeof module === "object" && typeof module.exports === "object") module.exports = Mp4Muxer;'
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