// 風ノ残響 — 自動テスト共通ヘルパー
// 使い方: リポジトリのルートで `python3 -m http.server 8765` を起動してから
//         node game/tests/<test>.mjs
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

export const BASE = process.env.GAME_URL || 'http://localhost:8765/game/';
export const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function launch({ touch = false, width = 1280, height = 720 } = {}) {
  const browser = await chromium.launch({
    executablePath: CHROME,
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: touch ? 2 : 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  const q = new URLSearchParams();
  if (touch) q.set('touch', '1');
  // ヘッドレスのソフトウェア描画は極端に遅いので、テストは常に軽量設定で走らせる
  q.set('perf', 'low');
  await page.goto(`${BASE}?${q}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  return { browser, page, errors };
}

// タイトル → オープニングをスキップしてプレイ可能状態へ
export async function startGame(page) {
  await page.click('#startBtn');
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(1000);
    const open = await page.evaluate(() => document.getElementById('narration').classList.contains('show'));
    if (!open) break;
    await page.mouse.click(640, 360);
  }
  await page.waitForTimeout(1200);
}

// ナレーションが開いていれば閉じるまでクリック
export async function skipNarration(page, max = 12) {
  for (let i = 0; i < max; i++) {
    await page.waitForTimeout(1000);
    const open = await page.evaluate(() => document.getElementById('narration').classList.contains('show'));
    if (!open) return;
    await page.mouse.click(640, 360);
  }
}

// ダイアログを最後まで送る
export async function runDialog(page, max = 16) {
  for (let i = 0; i < max; i++) {
    const open = await page.evaluate(() => document.getElementById('dialog').classList.contains('show'));
    if (!open) return i;
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(500);
  }
  return max;
}

// ゲーム内の状態が条件を満たすまで待つ(ソフトウェア描画はFPSが低く、
// 実時間で待つとフレーム数が足りないため常にこちらを使う)
export async function waitState(page, fnBody, timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await page.evaluate(`(() => { const d = window.__debug; return (${fnBody}); })()`)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

// 数フレーム分シミュレーションが進むのを待つ
export async function waitFrames(page, n = 8, timeoutMs = 20000) {
  const start = await page.evaluate(() => window.__debug.quality.frames);
  return waitState(page, `d.quality.frames >= ${start} + ${n} || d.quality.frames < ${start}`, timeoutMs);
}

export function makeReporter(name) {
  let failed = 0, n = 0;
  return {
    check(label, actual, expected) {
      n++;
      const ok = JSON.stringify(actual) === JSON.stringify(expected);
      if (!ok) failed++;
      console.log(`${ok ? '  ok ' : '  NG '} ${n}. ${label}: ${JSON.stringify(actual)}`
        + (ok ? '' : ` (期待値 ${JSON.stringify(expected)})`));
      return ok;
    },
    truthy(label, actual) {
      n++;
      const ok = !!actual;
      if (!ok) failed++;
      console.log(`${ok ? '  ok ' : '  NG '} ${n}. ${label}: ${JSON.stringify(actual)}`);
      return ok;
    },
    finish(errors) {
      if (errors.length) {
        failed += errors.length;
        console.log('  コンソールエラー:\n' + errors.slice(0, 10).map(e => '    ' + e).join('\n'));
      }
      console.log(failed === 0 ? `[PASS] ${name} (${n}件)` : `[FAIL] ${name} — ${failed}件の失敗`);
      process.exitCode = failed === 0 ? 0 : 1;
      return failed === 0;
    },
  };
}
