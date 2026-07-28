// 本編クエストのE2E:会話 → 記憶の欠片 → 祭壇 → ボス → エンディング
import { launch, startGame, skipNarration, runDialog, waitState, makeReporter } from './helper.mjs';

const r = makeReporter('本編クエスト');
const { browser, page, errors } = await launch();

await page.screenshot({ path: '/tmp/q_title.png' });
await startGame(page);
r.truthy('ゲームが開始する', await page.evaluate(() => window.__debug.game.started));

// --- 長老ナギとの会話 ---
await page.evaluate(() => {
  const d = window.__debug;
  d.player.pos.set(d.LOC.camp.x + 1.5, d.LOC.camp.y, d.LOC.camp.z + 1.5);
});
await waitState(page, 'Math.hypot(d.player.pos.x - d.LOC.camp.x, d.player.pos.z - d.LOC.camp.z) < 4');
await page.keyboard.press('KeyE');
await page.waitForTimeout(600);
r.truthy('会話が始まる', await page.evaluate(() => document.getElementById('dialog').classList.contains('show')));
await page.screenshot({ path: '/tmp/q_dialog.png' });
await runDialog(page);
r.check('会話後に「記憶の欠片」クエストへ進む',
  await page.evaluate(() => window.__debug.game.quest), 'shards');

// --- 3つの祠を巡る ---
for (const [key, loc] of [['A', 'shrineA'], ['B', 'shrineB'], ['C', 'shrineC']]) {
  await page.evaluate(([l]) => {
    const d = window.__debug;
    d.player.pos.set(d.LOC[l].x + 1, d.LOC[l].y, d.LOC[l].z + 1);
    d.player.hp = d.player.maxHp;
    d.player.invulnT = 9999;      // 道中の敵で死なないように
  }, [loc]);
  await page.waitForTimeout(800);
  await page.keyboard.press('KeyE');
  await skipNarration(page);
  await page.waitForTimeout(600);
  r.truthy(`記憶の欠片 ${key} を取得`, await page.evaluate(k => window.__debug.game.shards[k], key));
}
r.check('3つ集めるとナギのもとへ戻る指示になる',
  await page.evaluate(() => window.__debug.game.quest), 'return');

// --- ナギに報告 → 祭壇へ ---
await page.evaluate(() => {
  const d = window.__debug;
  d.player.pos.set(d.LOC.camp.x + 1.5, d.LOC.camp.y, d.LOC.camp.z + 1.5);
});
await page.waitForTimeout(700);
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await runDialog(page);
r.check('祭壇クエストに進む', await page.evaluate(() => window.__debug.game.quest), 'altar');

// --- ボス戦 ---
await page.evaluate(() => {
  const d = window.__debug;
  d.player.pos.set(d.LOC.altar.x, d.LOC.altar.y, d.LOC.altar.z + 20);
  d.player.hp = d.player.maxHp;
  d.player.invulnT = 99999;
});
const bossOk = await waitState(page, 'd.game.bossActive');
r.truthy('祭壇に近づくとボスが出現する', bossOk);
r.truthy('ボスHPバーが出る',
  await page.evaluate(() => document.getElementById('bossbar').classList.contains('show')));
await page.screenshot({ path: '/tmp/q_boss.png' });

await page.evaluate(() => {
  const d = window.__debug;
  const b = d.enemies.find(e => e.type === 'boss');
  d.damageEnemy(b, b.maxHp / 2);
});
await page.waitForTimeout(900);
r.truthy('HP半分で第2形態になる',
  await page.evaluate(() => !!window.__debug.enemies.find(e => e.type === 'boss')?.phase2));

await page.evaluate(() => {
  const d = window.__debug;
  d.damageEnemy(d.enemies.find(e => e.type === 'boss'), 999);
});
await page.waitForTimeout(3000);
await skipNarration(page, 14);
await page.waitForTimeout(1200);
r.check('エンディングに到達する', await page.evaluate(() => ({
  quest: window.__debug.game.quest, defeated: window.__debug.game.bossDefeated,
})), { quest: 'ending', defeated: true });
await page.screenshot({ path: '/tmp/q_ending.png' });

r.finish(errors);
await browser.close();
