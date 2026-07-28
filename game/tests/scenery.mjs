// 見た目の確認用:主要ロケーションのスクリーンショットを撮る
// node game/tests/scenery.mjs  → /tmp/scene_*.png
import { launch, startGame, makeReporter } from './helper.mjs';

const r = makeReporter('風景の撮影');
const { browser, page, errors } = await launch({ width: 1280, height: 720 });
await startGame(page);

// カメラを対象へ向けて撮影する(dist/pitch/yawを指定)
async function shot(name, setup) {
  await page.evaluate((cfg) => {
    const d = window.__debug;
    const L = d.LOC[cfg.at] || { x: cfg.x, z: cfg.z, y: 0 };
    const px = L.x + (cfg.dx ?? 0), pz = L.z + (cfg.dz ?? 0);
    d.player.pos.set(px, d.terrainHeight(px, pz), pz);
    d.player.vel.set(0, 0, 0);
    d.player.invulnT = 0;                       // 点滅させない
    d.player.hp = d.player.maxHp;
    d.cam.yaw = cfg.yaw ?? Math.PI;
    d.cam.pitch = cfg.pitch ?? 0.25;
    d.cam.dist = cfg.dist ?? 7;
    if (cfg.time !== undefined) d.game.time = cfg.time;
    if (cfg.weapon) { d.player.weapons[cfg.weapon] = true; d.setWeapon(cfg.weapon, true); }
    if (cfg.spawn) for (const [type, ox, oz] of cfg.spawn) d.spawnEnemy(type, L.x + ox, L.z + oz);
  }, setup);
  // 低FPS環境でもカメラの補間が落ち着くまで待つ
  await page.evaluate(() => new Promise(res => {
    let n = 0;
    const step = () => (++n < 14 ? requestAnimationFrame(step) : res());
    requestAnimationFrame(step);
  }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `/tmp/scene_${name}.png` });
  console.log(`  撮影: ${name}`);
}

await shot('summit_far', { at: 'summit', dx: -170, dz: 130, yaw: Math.PI * 1.25, pitch: 0.05, dist: 9 });
await shot('summit_top', { at: 'summit', dx: 4, dz: 5, yaw: Math.PI * 1.22, pitch: 0.1, dist: 7 });
await shot('toki', { at: 'toki', dx: 3.2, dz: 3.4, yaw: Math.PI * 0.82, pitch: 0.14, dist: 5.5 });
await shot('chime', { at: 'chime1', dx: 3.0, dz: 3.4, yaw: Math.PI * 0.82, pitch: 0.06, dist: 5.5 });
await shot('wisp', {
  at: 'shrineB', dx: 0, dz: 12, yaw: Math.PI, pitch: 0.12, dist: 7,
  spawn: [['wisp', 0, 4], ['wisp', 4, 6]],
});
await shot('charger', {
  at: 'shrineC', dx: 0, dz: 14, yaw: Math.PI, pitch: 0.12, dist: 7,
  spawn: [['charger', 0, 6], ['charger', 5, 9]],
});
await shot('great', { at: 'camp', dx: 3, dz: 8, yaw: Math.PI, pitch: 0.2, dist: 5, weapon: 'great' });
await shot('spear', { at: 'camp', dx: 3, dz: 8, yaw: Math.PI, pitch: 0.2, dist: 5, weapon: 'spear' });

r.truthy('撮影中にエラーが出ない', errors.length === 0);
r.finish(errors);
await browser.close();
