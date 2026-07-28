// 戦闘のE2E:武器3種の性能差と、新しい敵(迷イ火・岩背獣)の挙動
import { launch, startGame, waitState, makeReporter } from './helper.mjs';

const r = makeReporter('戦闘・武器・敵');
const { browser, page, errors } = await launch();
await startGame(page);

// 検証中に死なないよう無敵にし、開けた場所へ
await page.evaluate(() => {
  const d = window.__debug;
  d.player.pos.set(d.SPAWN?.x ?? 0, 0, 120);
  d.player.hp = d.player.maxHp;
  d.player.invulnT = 1e9;
  d.player.weapons.spear = true;
  d.player.weapons.great = true;
});
await page.waitForTimeout(600);

// 敵をプレイヤーの正面 dist[m] に置き、1回攻撃して与ダメージを測る
async function attackTest(weapon, dist, enemyType = 'shade') {
  return page.evaluate(async ([w, dd, type]) => {
    const d = window.__debug;
    d.setWeapon(w, true);
    // 直前の攻撃・回避が終わるまで待つ
    while (d.player.attackT > 0 || d.player.rollT > 0) await new Promise(res => requestAnimationFrame(res));
    d.player.stamina = 100; d.player.exhausted = false;
    // 既存の検証用個体を片付ける
    for (const e of d.enemies) if (e.testTag) { e.dead = true; e.deathT = 0.01; }
    const e = d.spawnEnemy(type,
      d.player.pos.x + Math.sin(d.player.yaw) * dd,
      d.player.pos.z + Math.cos(d.player.yaw) * dd);
    e.testTag = true;
    e.aggro = 0;                       // 動かないように
    e.speed = 0;
    const hp0 = e.hp;
    d.tryAttack();
    // 溜め〜判定が終わるまで進める
    while (d.player.attackT > 0) await new Promise(res => requestAnimationFrame(res));
    return { dealt: hp0 - e.hp, dead: e.dead };
  }, [weapon, dist, enemyType]);
}

// --- 武器ごとの威力 ---
const swordNear = await attackTest('sword', 1.8);
r.check('旅人の剣:近距離で1ダメージ', swordNear.dealt, 1);
const greatNear = await attackTest('great', 1.8);
r.check('古の大剣:近距離で3ダメージ', greatNear.dealt, 3);

// --- 間合いの違い ---
const swordFar = await attackTest('sword', 3.6);
r.check('旅人の剣:3.6mは届かない', swordFar.dealt, 0);
const spearFar = await attackTest('spear', 3.6);
r.truthy('風薙の槍:3.6mでも届く', spearFar.dealt > 0);

// --- 槍は複数体を貫く ---
const pierce = await page.evaluate(async () => {
  const d = window.__debug;
  d.setWeapon('spear', true);
  while (d.player.attackT > 0) await new Promise(res => requestAnimationFrame(res));
  d.player.stamina = 100; d.player.exhausted = false;
  for (const e of d.enemies) if (e.testTag) { e.dead = true; e.deathT = 0.01; }
  const made = [];
  for (const dist of [2.0, 3.4]) {
    const e = d.spawnEnemy('shade',
      d.player.pos.x + Math.sin(d.player.yaw) * dist,
      d.player.pos.z + Math.cos(d.player.yaw) * dist);
    e.testTag = true; e.aggro = 0; e.speed = 0;
    made.push(e);
  }
  const hp0 = made.map(e => e.hp);
  d.tryAttack();
  while (d.player.attackT > 0) await new Promise(res => requestAnimationFrame(res));
  return made.map((e, i) => hp0[i] - e.hp);
});
r.check('風薙の槍:直線上の2体に当たる', pierce, [1, 1]);

// --- 大剣はスタミナを使う / 空振りでは減らない ---
const stam = await page.evaluate(async () => {
  const d = window.__debug;
  d.setWeapon('great', true);
  while (d.player.attackT > 0) await new Promise(res => requestAnimationFrame(res));
  d.player.stamina = 100; d.player.exhausted = false;
  const before = d.player.stamina;
  d.tryAttack();
  const after = d.player.stamina;
  while (d.player.attackT > 0) await new Promise(res => requestAnimationFrame(res));
  return { before, after };
});
r.truthy(`大剣はスタミナを消費する(${stam.before} → ${stam.after})`, stam.after < stam.before - 10);

const noStam = await page.evaluate(async () => {
  const d = window.__debug;
  while (d.player.attackT > 0) await new Promise(res => requestAnimationFrame(res));
  d.player.stamina = 3; d.player.exhausted = false;
  d.tryAttack();
  return d.player.attackT;
});
r.check('スタミナ不足では大剣を振れない', noStam, 0);

// --- 武器の切替 ---
await page.evaluate(() => window.__debug.setWeapon('sword', true));
await page.keyboard.press('KeyQ');
await page.waitForTimeout(200);
r.truthy('Qキーで武器が切り替わる',
  await page.evaluate(() => window.__debug.player.weapon !== 'sword'));
await page.keyboard.press('Digit3');
await page.waitForTimeout(200);
r.check('数字キーで武器を直接選べる', await page.evaluate(() => window.__debug.player.weapon), 'great');
r.check('HUDに武器名が出る',
  await page.evaluate(() => document.querySelector('#weapon .wname').textContent), '古の大剣');

// --- 迷イ火:距離を取って火の玉を撃つ ---
const wisp = await page.evaluate(async () => {
  const d = window.__debug;
  for (const e of d.enemies) if (e.testTag) { e.dead = true; e.deathT = 0.01; }
  const e = d.spawnEnemy('wisp', d.player.pos.x + 9, d.player.pos.z);
  e.testTag = true;
  const t0 = performance.now();
  while (d.projectiles.length === 0 && performance.now() - t0 < 20000) {
    await new Promise(res => requestAnimationFrame(res));
  }
  return { fired: d.projectiles.length > 0, type: e.type };
});
r.truthy('迷イ火が火の玉を撃ってくる', wisp.fired);

const projHit = await page.evaluate(async () => {
  const d = window.__debug;
  d.player.invulnT = 0;                       // 当たり判定を有効に
  const hp0 = d.player.hp;
  // 火の玉をプレイヤーの目の前に置いて当てる
  const p = d.projectiles[0];
  if (!p) return { ok: false };
  p.mesh.position.set(d.player.pos.x, d.player.pos.y + 1, d.player.pos.z);
  const t0 = performance.now();
  while (d.player.hp === hp0 && performance.now() - t0 < 8000) {
    await new Promise(res => requestAnimationFrame(res));
  }
  const dmg = hp0 - d.player.hp;
  d.player.hp = d.player.maxHp; d.player.invulnT = 1e9;
  return { ok: dmg > 0, dmg };
});
r.truthy(`火の玉が当たるとダメージを受ける(${projHit.dmg ?? 0})`, projHit.ok);

// --- 岩背獣:溜めてから突進する ---
const charge = await page.evaluate(async () => {
  const d = window.__debug;
  for (const e of d.enemies) if (e.testTag) { e.dead = true; e.deathT = 0.01; }
  const e = d.spawnEnemy('charger', d.player.pos.x + 10, d.player.pos.z);
  e.testTag = true;
  let sawWind = false, sawCharge = false;
  const t0 = performance.now();
  while (performance.now() - t0 < 25000 && !(sawWind && sawCharge)) {
    if (e.windT > 0) sawWind = true;
    if (e.chargeT > 0) sawCharge = true;
    await new Promise(res => requestAnimationFrame(res));
  }
  e.dead = true; e.deathT = 0.01;
  return { sawWind, sawCharge };
});
r.truthy('岩背獣が突進前に溜める', charge.sawWind);
r.truthy('岩背獣が突進してくる', charge.sawCharge);

await page.screenshot({ path: '/tmp/combat.png' });
r.finish(errors);
await browser.close();
