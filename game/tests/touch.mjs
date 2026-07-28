// タッチ操作のE2E:仮想スティックでの移動、視点ドラッグ、アクションボタン
import { launch, startGame, waitState, makeReporter } from './helper.mjs';

const r = makeReporter('タッチ操作');
const { browser, page, errors } = await launch({ touch: true, width: 844, height: 390 });

// 合成タッチイベントを送るユーティリティ(ページ内で実行)
const TOUCH_UTIL = `
  window.__t = (zoneId, type, x, y, id, onWindow) => {
    const zone = document.getElementById(zoneId);
    const t = new Touch({ identifier: id, target: zone, clientX: x, clientY: y });
    const ev = new TouchEvent(type, {
      bubbles: true, cancelable: true,
      touches: type === 'touchend' ? [] : [t],
      changedTouches: [t],
    });
    (onWindow ? window : zone).dispatchEvent(ev);
  };
`;
await page.evaluate(TOUCH_UTIL);

await page.screenshot({ path: '/tmp/touch_title.png' });
await startGame(page);
await page.evaluate(TOUCH_UTIL);
await page.screenshot({ path: '/tmp/touch_game.png' });

r.truthy('タッチUIが表示される',
  await page.evaluate(() => document.getElementById('touch').classList.contains('show')));

// --- 仮想スティック:入力が伝わるか ---
await page.evaluate(() => window.__t('stickZone', 'touchstart', 120, 300, 1, false));
await page.evaluate(() => window.__t('stickZone', 'touchmove', 120, 220, 1, true));
const stickState = await page.evaluate(() => ({
  mag: +window.__debug.touch.stick.mag.toFixed(2),
  z: +window.__debug.touch.stick.z.toFixed(2),
  iz: +window.__debug.readMoveInput().iz.toFixed(2),
}));
r.check('スティックを前へ倒すと前進入力になる', stickState, { mag: 1, z: -1, iz: -1 });
r.truthy('スティックのUIが出ている',
  await page.evaluate(() => document.getElementById('stickBase').classList.contains('show')));

// --- 実際に前進する(低FPS環境なので状態をポーリング) ---
const before = await page.evaluate(() => [window.__debug.player.pos.x, window.__debug.player.pos.z]);
const movedOk = await waitState(page,
  `Math.hypot(d.player.pos.x - ${before[0]}, d.player.pos.z - ${before[1]}) > 1.5`, 25000);
const dist = await page.evaluate(([bx, bz]) =>
  +Math.hypot(window.__debug.player.pos.x - bx, window.__debug.player.pos.z - bz).toFixed(2), before);
r.truthy(`スティック入力で実際に移動する(${dist}m)`, movedOk);

await page.evaluate(() => window.__t('stickZone', 'touchend', 120, 220, 1, true));
r.check('スティックを離すと入力が0に戻る',
  await page.evaluate(() => window.__debug.touch.stick.mag), 0);
r.check('スティックのUIが消える',
  await page.evaluate(() => document.getElementById('stickBase').classList.contains('show')), false);

// --- 視点ドラッグ ---
const yaw0 = await page.evaluate(() => window.__debug.cam.yaw);
await page.evaluate(() => {
  window.__t('lookZone', 'touchstart', 600, 180, 2, false);
  window.__t('lookZone', 'touchmove', 700, 200, 2, true);
  window.__t('lookZone', 'touchend', 700, 200, 2, true);
});
const camNow = await page.evaluate(() => ({ yaw: window.__debug.cam.yaw, pitch: window.__debug.cam.pitch }));
r.truthy(`横ドラッグでカメラが回る(Δyaw ${(camNow.yaw - yaw0).toFixed(2)})`, Math.abs(camNow.yaw - yaw0) > 0.1);

// --- アクションボタン:回避 → 攻撃の順(攻撃中は回避できない仕様のため) ---
await waitState(page, 'd.player.attackT <= 0 && d.player.rollT <= 0');
await page.evaluate(() => document.getElementById('tbRoll')
  .dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true })));
r.truthy('回避ボタンでロールする', await page.evaluate(() => window.__debug.player.rollT > 0));

await waitState(page, 'd.player.rollT <= 0');
const hpBefore = await page.evaluate(() => {
  const d = window.__debug;
  const e = d.spawnEnemy('slime',
    d.player.pos.x + Math.sin(d.player.yaw) * 1.6,
    d.player.pos.z + Math.cos(d.player.yaw) * 1.6);
  e.testTag = true;      // この個体だけを追跡する
  return e.hp;
});
await page.evaluate(() => document.getElementById('tbAttack')
  .dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true })));
r.truthy('攻撃ボタンで攻撃モーションに入る', await page.evaluate(() => window.__debug.player.attackT > 0));
const hitOk = await waitState(page, `(() => {
  const t = d.enemies.find(e => e.testTag);
  return !t || t.dead || t.hp < ${hpBefore};
})()`);
r.truthy('攻撃が敵に当たる', hitOk);

// --- 武器切替ボタン ---
await page.evaluate(() => {
  window.__debug.player.weapons.spear = true;
  document.getElementById('tbWeapon').dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true }));
});
r.check('武器ボタンで武器が切り替わる', await page.evaluate(() => window.__debug.player.weapon), 'spear');

// --- 会話はタップで送れる ---
await page.evaluate(() => {
  const d = window.__debug;
  d.player.pos.set(d.LOC.toki.x + 1.2, d.LOC.toki.y, d.LOC.toki.z + 1.2);
});
await page.evaluate(() => document.getElementById('tbInteract')
  .dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true })));
r.truthy('調べるボタンで会話が始まる',
  await page.evaluate(() => document.getElementById('dialog').classList.contains('show')));
const line0 = await page.evaluate(() => document.querySelector('#dialog .body').textContent);
await page.evaluate(() => window.__t('lookZone', 'touchstart', 400, 200, 3, false));
const line1 = await page.evaluate(() => document.querySelector('#dialog .body').textContent);
r.truthy('画面タップで会話が進む', line0 !== line1);

await page.screenshot({ path: '/tmp/touch_action.png' });
r.finish(errors);
await browser.close();
