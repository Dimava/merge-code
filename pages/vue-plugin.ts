import type { BunPlugin } from "bun";
import * as compiler from "@vue/compiler-sfc";
import * as fs from "node:fs";

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

const plugin: BunPlugin = {
  name: "vue",
  setup(build) {
    build.onResolve({ filter: /\.vue/ }, (args) => {
      const [, paramsString] = args.path.split("?");
      const params = new URLSearchParams(paramsString);
      const type = params.get("type");

      const ns =
        type === "script"
          ? "sfc-script"
          : type === "template"
            ? "sfc-template"
            : type === "style"
              ? "sfc-style"
              : undefined;

      if (!ns) return;

      return {
        path: normalizePath(args.path),
        namespace: ns,
      };
    });

    let currentId = 0;
    const idMap = new Map<string, string>();
    const descriptorMap = new Map<string, compiler.SFCDescriptor>();
    const scriptMap = new Map<string, compiler.SFCScriptBlock>();

    build.onLoad({ filter: /.*/, namespace: "sfc-script" }, (args) => {
      const path = normalizePath(args.path.split("?")[0]!);
      const script = scriptMap.get(path);

      if (!script) {
        throw new Error(`[vue-plugin] No script block found for ${path}`);
      }

      return {
        contents: script.content,
        loader: script.lang === "ts" ? "ts" : "js",
      };
    });

    build.onLoad({ filter: /.*/, namespace: "sfc-template" }, (args) => {
      const path = normalizePath(args.path.split("?")[0]!);
      const descriptor = descriptorMap.get(path);

      if (!descriptor) {
        throw new Error(`[vue-plugin] Template descriptor not found for ${path}`);
      }

      const id = idMap.get(path)!;
      const script = scriptMap.get(path)!;

      const template = compiler.compileTemplate({
        id,
        scoped: descriptor.styles.some((s) => s.scoped),
        source: descriptor.template!.content,
        filename: path,
        compilerOptions: {
          ...(script.bindings && { bindingMetadata: script.bindings }),
          ...(script.lang === "ts" && { expressionPlugins: ["typescript"] as const }),
        },
      });

      return {
        contents: template.code,
        loader: "js",
      };
    });

    build.onLoad({ filter: /.*/, namespace: "sfc-style" }, (args) => {
      const path = normalizePath(args.path.split("?")[0]!);
      const descriptor = descriptorMap.get(path);
      const id = idMap.get(path)!;

      if (!descriptor) {
        throw new Error(`[vue-plugin] Style descriptor not found for ${path}`);
      }

      const style = compiler.compileStyle({
        id,
        scoped: descriptor.styles.some((s) => s.scoped),
        source: descriptor.styles.map((s) => s.content).join("\n"),
        filename: path,
      });

      return {
        contents: style.code,
        loader: "css",
      };
    });

    build.onLoad({ filter: /\.vue$/ }, async (args) => {
      const filePath = normalizePath(args.path);
      const source = await Bun.file(args.path).text();

      const { descriptor, errors } = compiler.parse(source, {
        filename: filePath,
      });

      if (errors.length) {
        throw errors[0]!;
      }

      descriptorMap.set(filePath, descriptor);

      const id = `data-v-${currentId++}`;
      idMap.set(filePath, id);

      if (descriptor.script || descriptor.scriptSetup) {
        const script = compiler.compileScript(descriptor, {
          id,
          fs: {
            fileExists: fs.existsSync,
            readFile: (file: string) => {
              if (fs.lstatSync(file).isDirectory()) {
                const indexTs = file + "/index.ts";
                const indexDts = file + "/index.d.ts";
                if (fs.existsSync(indexTs)) return fs.readFileSync(indexTs, "utf-8");
                if (fs.existsSync(indexDts)) return fs.readFileSync(indexDts, "utf-8");
                return "";
              }
              return fs.readFileSync(file, "utf-8");
            },
          },
        });
        scriptMap.set(filePath, script);
      } else {
        scriptMap.set(filePath, {
          content: "",
          lang: "js",
          type: "script",
          loc: {
            start: { line: 0, column: 0, offset: 0 },
            end: { line: 0, column: 0, offset: 0 },
            source: "",
          },
          setup: false,
          bindings: {},
          attrs: {},
        });
      }

      let code = `import script from "${filePath}?type=script";\n`;

      if (descriptor.styles.length > 0) {
        code += `import "${filePath}?type=style";\n`;
      }

      if (descriptor.styles.some((s) => s.scoped)) {
        code += `script.__scopeId = "${id}";\n`;
      }

      if (descriptor.template) {
        code += `import { render } from "${filePath}?type=template";\n`;
        code += "script.render = render;\n";
      }

      code += "export default script;\n";

      return {
        contents: code,
        loader: "js",
      };
    });

    // Replace Vue compile-time flags in node_modules
    build.onLoad({ filter: /node_modules\/@vue\/(.*)\.js$/ }, async (args) => {
      let source = await Bun.file(args.path).text();
      source = source.replaceAll("__VUE_PROD_DEVTOOLS__", "false");
      source = source.replaceAll("__VUE_OPTIONS_API__", "false");
      source = source.replaceAll("__VUE_PROD_HYDRATION_MISMATCH_DETAILS__", "false");
      return { contents: source, loader: "js" };
    });
  },
};

export default plugin;
