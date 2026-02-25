import vuePlugin from "./vue-plugin";

await Bun.build({
	entrypoints: ["src/webview/main.ts"],
	outdir: "out/webview",
	minify: true,
	plugins: [vuePlugin],
});
