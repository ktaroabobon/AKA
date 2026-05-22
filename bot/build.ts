// bot/build.ts
// GAS は ES Modules を解釈しないので、esbuild で IIFE バンドル → `_entry` に集約し、
// 末尾に GAS から呼ばれるグローバル関数を追記する。
//
// 実行: `pnpm tsx build.ts`（または `pnpm build` / `make build`）

import { join } from "node:path";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import * as esbuild from "esbuild";

const PROJECT_DIR = __dirname;
const SRC_DIR = join(PROJECT_DIR, "src");
const DIST_DIR = join(PROJECT_DIR, "dist");
const APPSSCRIPT_JSON = join(PROJECT_DIR, "appsscript.json");

/**
 * GAS が直接呼び出すグローバル関数のリスト。
 * IIFE バンドル後の `_entry` 上の同名 export を呼び出す形で末尾に追記される。
 *
 * 追加したい関数は src/main.ts で `export` してから、ここに名前を足す。
 */
const GLOBAL_ENTRY_FUNCTIONS = ["doPost"] as const;

async function emptyDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
}

function generateGlobalReExports(): string {
  return GLOBAL_ENTRY_FUNCTIONS.map(
    (name) => `function ${name}(e) { return _entry.${name}(e); }`,
  ).join("\n");
}

async function main(): Promise<void> {
  await emptyDir(DIST_DIR);

  await copyFile(APPSSCRIPT_JSON, join(DIST_DIR, "appsscript.json"));

  const result = await esbuild.build({
    entryPoints: [join(SRC_DIR, "main.ts")],
    bundle: true,
    outfile: join(DIST_DIR, "main.js"),
    charset: "utf8",
    format: "iife",
    globalName: "_entry",
    target: "es2020",
  });

  if (result.errors.length > 0) {
    console.error(result.errors);
    process.exit(1);
  }

  const mainJsPath = join(DIST_DIR, "main.js");
  const bundled = await readFile(mainJsPath, "utf8");
  const withGlobals = `${bundled}\n${generateGlobalReExports()}\n`;
  await writeFile(mainJsPath, withGlobals, "utf8");

  console.log(`built: ${mainJsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
