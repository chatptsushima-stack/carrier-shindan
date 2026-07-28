// サイドクエストのE2E:狩人トキの3つの依頼(討伐・風鈴収集・登頂)
import { launch, startGame, skipNarration, runDialog, waitState, makeReporter } from './helper.mjs';

const r = makeReporter('サイドクエスト');
const { browser, page, errors } = await launch();
await startGame(page);

const goToToki = async () => {
  await page.evaluate(() => {
    const d = window.__debug;
    d.player.pos.set(d.LOC.toki.x + 1.2, d.LOC.toki.y, d.LOC.toki.z + 1.2);
    d.player.hp = d.player.maxHp;
    d.player.invulnT = 99999;
  });
  await page.waitForTimeout(600);
};

// ---------- 依頼1:岩背獣の討伐 ----------
await goToToki();
await page.keyboard.press('KeyE');
await page.waitForTimeout(600);
r.truthy('トキとの会話が始まる',
  await page.evaluate(() => document.getElementById('dialog').classList.contains('show')));
await page.screenshot({ path: '/tmp/sq_toki.png' });
await runDialog(page, 20);
r.check('討伐依頼を受注する', await page.evaluate(() => window.__debug.game.side.hunt), 'active');
r.truthy('依頼がHUDに表示される',
  await page.evaluate(() => document.getElementById('sidequest').classList.contains('show')));

// 岩背獣を3頭倒す
for (let i = 1; i <= 3; i++) {
  await page.evaluate(() => {
    const d = window.__debug;
    const e = d.spawnEnemy('charger', d.player.pos.x + 3, d.player.pos.z + 3);
    d.damageEnemy(e, 999);
  });
  await page.waitForTimeout(400);
  const kills = await page.evaluate(() => window.__debug.game.side.huntKills);
  r.check(`岩背獣 ${i} 頭目の討伐がカウントされる`, kills, i);
}
r.check('3頭倒すと報告待ちになる', await page.evaluate(() => window.__debug.game.side.hunt), 'ready');

// 報告 → 槍を入手
await goToToki();
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await runDialog(page, 20);
r.check('報告で依頼が完了する', await page.evaluate(() => window.__debug.game.side.hunt), 'done');
r.truthy('報酬「風薙の槍」を入手する', await page.evaluate(() => window.__debug.player.weapons.spear));
r.check('入手した武器が装備される', await page.evaluate(() => window.__debug.player.weapon), 'spear');

// ---------- 依頼2:風鈴の収集 ----------
await goToToki();
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await runDialog(page, 20);
r.check('風鈴の依頼を受注する', await page.evaluate(() => window.__debug.game.side.chimes), 'active');
r.truthy('風鈴の光の柱が出る',
  await page.evaluate(() => window.__debug.game.side.chimes === 'active'));

const maxHpBefore = await page.evaluate(() => window.__debug.player.maxHp);
for (const k of [1, 2, 3]) {
  await page.evaluate((key) => {
    const d = window.__debug;
    const loc = d.LOC[`chime${key}`];
    d.player.pos.set(loc.x + 1, loc.y, loc.z + 1);
  }, k);
  await page.waitForTimeout(600);
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(400);
  r.truthy(`風鈴 ${k} を回収する`, await page.evaluate(key => !!window.__debug.game.side.chimeFound[key], k));
}
r.check('3つ揃うと報告待ちになる', await page.evaluate(() => window.__debug.game.side.chimes), 'ready');

await goToToki();
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await runDialog(page, 20);
await page.waitForTimeout(400);
r.check('報告で依頼が完了する', await page.evaluate(() => window.__debug.game.side.chimes), 'done');
r.check('報酬で最大HPが増える',
  await page.evaluate(() => window.__debug.player.maxHp), maxHpBefore + 4);

// ---------- 依頼3:風見の頂 ----------
await goToToki();
await page.keyboard.press('KeyE');
await page.waitForTimeout(500);
await runDialog(page, 20);
r.check('登頂の依頼を受注する', await page.evaluate(() => window.__debug.game.side.summit), 'active');

await page.evaluate(() => {
  const d = window.__debug;
  d.player.pos.set(d.LOC.summit.x + 1.5, d.LOC.summit.y, d.LOC.summit.z + 1.5);
});
await page.waitForTimeout(900);
await page.screenshot({ path: '/tmp/sq_summit.png' });
await page.keyboard.press('KeyE');
await skipNarration(page, 8);
await page.waitForTimeout(600);
r.check('頂で依頼が完了する', await page.evaluate(() => window.__debug.game.side.summit), 'done');
r.truthy('報酬「古の大剣」を入手する', await page.evaluate(() => window.__debug.player.weapons.great));

// ---------- セーブの永続化 ----------
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('kaze_no_zankyo_save')));
r.check('依頼の進捗が保存される',
  [save.side.hunt, save.side.chimes, save.side.summit], ['done', 'done', 'done']);
r.check('武器と最大HPが保存される',
  [save.weapons.spear, save.weapons.great, save.maxHp], [true, true, maxHpBefore + 4]);

// リロードして「続きから」で復元されるか
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
r.truthy('「続きから」ボタンが出る',
  await page.evaluate(() => document.getElementById('contBtn').style.display !== 'none'));
await page.click('#contBtn');
await page.waitForTimeout(1500);
r.check('ロード後も武器と依頼が復元される', await page.evaluate(() => ({
  spear: window.__debug.player.weapons.spear,
  great: window.__debug.player.weapons.great,
  maxHp: window.__debug.player.maxHp,
  summit: window.__debug.game.side.summit,
})), { spear: true, great: true, maxHp: maxHpBefore + 4, summit: 'done' });

r.finish(errors);
await browser.close();
