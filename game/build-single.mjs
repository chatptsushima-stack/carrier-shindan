// 配布用の単一HTMLを生成する
//   node game/build-single.mjs [出力先]
// Three.js と main.js を esbuild でバンドルし、index.html に丸ごと埋め込む。
// 外部リクエストを一切行わないので、ファイル1つで動く(iframe内でも可)。
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || join(here, 'dist', 'kaze-no-zankyo.html');
const tmpBundle = join('/tmp', `kaze-bundle-${process.pid}.js`);

// --- バンドル ---
const esbuild = process.env.ESBUILD || '/tmp/node_modules/.bin/esbuild';
execFileSync(esbuild, [
  join(here, 'main.js'),
  '--bundle', '--minify', '--format=iife', '--target=es2020',
  `--alias:three=${join(here, 'lib', 'three.module.min.js')}`,
  `--outfile=${tmpBundle}`,
], { stdio: 'inherit' });
const bundle = readFileSync(tmpBundle, 'utf8');

// --- index.html から <style> と本文を取り出す ---
const html = readFileSync(join(here, 'index.html'), 'utf8');
const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1]
  // importmap と外部スクリプト参照は埋め込みに置き換えるので削除
  .replace(/<script type="importmap">[\s\S]*?<\/script>/, '')
  .replace(/<script type="module"[^>]*><\/script>/, '')
  .trim();

// 埋め込み時に </script> が途中で閉じないようにエスケープする
const safeBundle = bundle.replace(/<\/script/gi, '<\\/script');

// 埋め込み先の文字コード指定に依存しないよう、HTML側の非ASCIIは数値文字参照にする
// (バンドルされたJSは esbuild が \uXXXX に変換済みなのでそのままでよい)
const toEntities = (str) => str.replace(/[^\x00-\x7F]/g, (ch) => `&#${ch.codePointAt(0)};`);

const page = `<meta charset="UTF-8">
<title>${toEntities('風ノ残響 — Echoes of the Wind')}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<style>
${toEntities(style)}
</style>

${toEntities(body)}

<script>
${safeBundle}
</script>
`;

writeFileSync(out, page);
console.log(`${out} — ${(page.length / 1024).toFixed(0)} KB`);
