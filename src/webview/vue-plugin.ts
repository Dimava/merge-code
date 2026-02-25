import type { BunPlugin } from "bun";
import * as compiler from "@vue/compiler-sfc";
import * as fs from "node:fs";

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

type VirtualSfcPath = {
  path: string;
  type: string | null;
  index: number | undefined;
};

type CompiledScript = {
  content: string;
  lang: string;
  bindings: compiler.BindingMetadata;
};

type SupportedPreprocessLang = "scss" | "sass" | "less" | "styl" | "stylus";

function getPreprocessLang(lang: string | undefined): SupportedPreprocessLang | undefined {
  if (
    lang === "scss" ||
    lang === "sass" ||
    lang === "less" ||
    lang === "styl" ||
    lang === "stylus"
  ) {
    return lang;
  }
  return undefined;
}

function parseVirtualSfcPath(pathWithQuery: string): VirtualSfcPath {
  const [rawPath, query = ""] = pathWithQuery.split("?");
  const params = new URLSearchParams(query);
  const indexRaw = params.get("index");
  const index =
    indexRaw === null || indexRaw.length === 0 || Number.isNaN(Number(indexRaw))
      ? undefined
      : Number(indexRaw);

  return {
    path: normalizePath(rawPath ?? pathWithQuery),
    type: params.get("type"),
    index,
  };
}

function throwSfcCompileError(
  kind: "template" | "style",
  filePath: string,
  errors: unknown[],
): void {
  if (errors.length === 0) {
    return;
  }

  const firstError = errors[0];
  if (firstError instanceof Error) {
    throw firstError;
  }
  if (typeof firstError === "string") {
    throw new Error(`[vue-plugin] Failed to compile ${kind} for ${filePath}: ${firstError}`);
  }
  if (firstError && typeof firstError === "object" && "message" in firstError) {
    throw new Error(
      `[vue-plugin] Failed to compile ${kind} for ${filePath}: ${String(firstError.message)}`,
    );
  }

  throw new Error(`[vue-plugin] Failed to compile ${kind} for ${filePath}`);
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
    const scriptMap = new Map<string, CompiledScript>();

    build.onLoad({ filter: /.*/, namespace: "sfc-script" }, (args) => {
      const { path } = parseVirtualSfcPath(args.path);
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
      const { path } = parseVirtualSfcPath(args.path);
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
          ...(Object.keys(script.bindings).length > 0 && { bindingMetadata: script.bindings }),
          ...(script.lang === "ts" && { expressionPlugins: ["typescript"] as const }),
        },
      });

      throwSfcCompileError("template", path, template.errors);

      return {
        contents: template.code,
        loader: "js",
      };
    });

    build.onLoad({ filter: /.*/, namespace: "sfc-style" }, (args) => {
      const { path, index } = parseVirtualSfcPath(args.path);
      const descriptor = descriptorMap.get(path);
      const id = idMap.get(path)!;

      if (!descriptor) {
        throw new Error(`[vue-plugin] Style descriptor not found for ${path}`);
      }

      if (index === undefined) {
        throw new Error(`[vue-plugin] Style index is missing for ${path}`);
      }

      const styleBlock = descriptor.styles[index];
      if (!styleBlock) {
        throw new Error(`[vue-plugin] Style block ${index} not found for ${path}`);
      }
      if (styleBlock.module != null) {
        throw new Error(`[vue-plugin] <style module> is not supported for ${path}`);
      }
      if (styleBlock.lang && !getPreprocessLang(styleBlock.lang)) {
        throw new Error(`[vue-plugin] Unsupported <style lang="${styleBlock.lang}"> for ${path}`);
      }

      const preprocessLang = getPreprocessLang(styleBlock.lang);

      const style = compiler.compileStyle({
        id,
        scoped: styleBlock.scoped === true,
        source: styleBlock.content,
        ...(preprocessLang && { preprocessLang }),
        filename: path,
      });

      throwSfcCompileError("style", path, style.errors);

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
        const compiledScript = compiler.compileScript(descriptor, {
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
        scriptMap.set(filePath, {
          content: compiledScript.content,
          lang: compiledScript.lang ?? "js",
          bindings: compiledScript.bindings ?? {},
        });
      } else {
        scriptMap.set(filePath, {
          content: "export default {};\n",
          lang: "js",
          bindings: {},
        });
      }

      let code = `import script from "${filePath}?type=script";\n`;

      descriptor.styles.forEach((_, index) => {
        code += `import "${filePath}?type=style&index=${index}";\n`;
      });

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
