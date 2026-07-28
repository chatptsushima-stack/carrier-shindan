// ============================================================
//  風ノ残響 — Echoes of the Wind
//  オープンワールド・アクションRPG プロトタイプ
// ============================================================
import * as THREE from 'three';
import { EffectComposer } from './lib/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './lib/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './lib/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './lib/jsm/postprocessing/OutputPass.js';

// ------------------------------------------------------------
// 定数
// ------------------------------------------------------------
const WORLD = 1000;            // ワールド一辺
const WORLD_EDGE = 460;        // 行動可能半径
const WATER_LEVEL = -5.2;
const DAY_LENGTH = 480;        // 1日(秒)
const SPAWN = new THREE.Vector3(0, 0, 60);

const V3 = () => new THREE.Vector3();
const _v1 = V3(), _v2 = V3(), _v3 = V3();

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const rand = (a = 1, b = 0) => b + Math.random() * (a - b);

// ------------------------------------------------------------
// ノイズ(値ノイズ + fBM)
// ------------------------------------------------------------
function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, oct = 5) {
  let v = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    v += amp * vnoise(x * f, y * f);
    amp *= 0.5; f *= 2.02;
  }
  return v; // 0..~1
}

// ------------------------------------------------------------
// 地形高さ関数(全システム共通)
// ------------------------------------------------------------
const SUMMIT_X = 296, SUMMIT_Z = -236;   // 風見の頂(独立峰)
function terrainHeight(x, z) {
  let h = (fbm(x * 0.004 + 13.7, z * 0.004 + 7.1) - 0.42) * 78;
  h += (fbm(x * 0.018 + 3.3, z * 0.018 + 9.9) - 0.5) * 9;
  // 中央の谷(スポーン周辺)をなだらかに
  const dSpawn = Math.hypot(x - SPAWN.x, z - SPAWN.z);
  const flat = smoothstep(220, 50, dSpawn);
  h = lerp(h, 1.6 + (fbm(x * 0.03, z * 0.03) - 0.5) * 3.5, flat * 0.92);
  // 東の独立峰「風見の頂」:遠くからでもそれと分かる目印
  const dSummit2 = (x - SUMMIT_X) ** 2 + (z - SUMMIT_Z) ** 2;
  h += 64 * Math.exp(-dSummit2 / (2 * 72 * 72));
  // 外周の山脈
  const dC = Math.hypot(x, z);
  h += smoothstep(WORLD_EDGE - 60, WORLD / 2, dC) * 90;
  return h;
}
function terrainNormal(x, z, out) {
  const e = 1.2;
  const hL = terrainHeight(x - e, z), hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e), hU = terrainHeight(x, z + e);
  return out.set(hL - hR, 2 * e, hD - hU).normalize();
}

// ------------------------------------------------------------
// レンダラ / シーン
// ------------------------------------------------------------
// モバイル(タッチ端末)や ?perf=low 指定では最初から軽量設定で始める
const PERF_PARAM = new URLSearchParams(location.search).get('perf');
const IS_COARSE = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
const LOW_SPEC = PERF_PARAM === 'low' || (PERF_PARAM !== 'high' && IS_COARSE);

const renderer = new THREE.WebGLRenderer({ antialias: !LOW_SPEC });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW_SPEC ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = LOW_SPEC ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfd8d2, 90, 760);

const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 2400);

// ポストプロセス(ブルーム:夕陽・発光体・剣戟エフェクトの輝き)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.7, 0.82);
bloomPass.enabled = !LOW_SPEC;
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ------------------------------------------------------------
// ライティング
// ------------------------------------------------------------
const sun = new THREE.DirectionalLight(0xffeecb, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(LOW_SPEC ? 1024 : 2048, LOW_SPEC ? 1024 : 2048);
sun.shadow.camera.left = -70; sun.shadow.camera.right = 70;
sun.shadow.camera.top = 70; sun.shadow.camera.bottom = -70;
sun.shadow.camera.near = 10; sun.shadow.camera.far = 380;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);

const hemi = new THREE.HemisphereLight(0xbcd8e8, 0x6e7d5a, 0.9);
scene.add(hemi);

// ------------------------------------------------------------
// 空(シェーダースカイドーム + 太陽 + 雲 + 星)
// ------------------------------------------------------------
const skyUniforms = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uTime: { value: 0 },
  uNight: { value: 0 },
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1500, 32, 20),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: skyUniforms,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir;
      uniform vec3 uSunDir;
      uniform float uTime;
      uniform float uNight;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p){
        vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
                   mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
      }
      float fbm(vec2 p){
        float v=0., a=.5;
        for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; }
        return v;
      }
      void main(){
        vec3 d = normalize(vDir);
        float sunH = uSunDir.y;                       // 太陽高度
        float dayF = smoothstep(-0.08, 0.25, sunH);   // 昼係数
        float duskF = smoothstep(0.35,0.04,abs(sunH)) * smoothstep(-0.18,0.0,sunH); // 朝夕

        // --- 基本グラデーション ---
        vec3 zenithDay  = vec3(0.30,0.52,0.82);
        vec3 horizonDay = vec3(0.82,0.88,0.90);
        vec3 zenithNight  = vec3(0.015,0.025,0.06);
        vec3 horizonNight = vec3(0.05,0.07,0.12);
        float t = pow(clamp(1.0 - d.y, 0., 1.), 2.2);
        vec3 day = mix(zenithDay, horizonDay, t);
        vec3 night = mix(zenithNight, horizonNight, t);
        vec3 col = mix(night, day, dayF);

        // --- 朝焼け / 夕焼け ---
        float sunSide = max(dot(normalize(vec3(d.x,0.,d.z)), normalize(vec3(uSunDir.x,0.,uSunDir.z))), 0.);
        vec3 dusk = vec3(1.0,0.55,0.26);
        col = mix(col, dusk, duskF * pow(t,1.5) * (0.35 + 0.65*sunSide));
        col += vec3(1.0,0.72,0.4) * duskF * pow(sunSide,3.) * pow(t,2.) * 0.55;

        // --- 太陽 ---
        float sd = dot(d, uSunDir);
        float disc = smoothstep(0.9993, 0.9997, sd);
        float glow = pow(max(sd,0.), 90.) * 0.5 + pow(max(sd,0.), 700.) * 1.4;
        vec3 sunCol = mix(vec3(1.0,0.85,0.6), vec3(1.0,0.45,0.2), duskF);
        col += sunCol * (disc*2.2 + glow) * smoothstep(-0.12,0.0,sunH);

        // --- 月 ---
        vec3 moonDir = -uSunDir;
        float md = dot(d, moonDir);
        col += vec3(0.85,0.9,1.0) * smoothstep(0.9995,0.9999,md) * 0.9 * uNight;
        col += vec3(0.5,0.6,0.8) * pow(max(md,0.),300.)*0.25*uNight;

        // --- 星 ---
        if(uNight > 0.01 && d.y > 0.0){
          vec2 sp = d.xz / (d.y + 0.4) * 60.;
          float s = hash(floor(sp));
          float star = smoothstep(0.985, 1.0, s) * (0.5 + 0.5*sin(uTime*2.+s*40.));
          col += vec3(0.9,0.95,1.0) * star * uNight * smoothstep(0.05,0.3,d.y);
        }

        // --- 雲 ---
        if(d.y > 0.02){
          vec2 cuv = d.xz / (d.y + 0.25);
          float c = fbm(cuv*1.4 + vec2(uTime*0.008, uTime*0.003));
          c = smoothstep(0.52, 0.78, c);
          float cm = c * smoothstep(0.02,0.12,d.y);
          vec3 cloudCol = mix(vec3(0.25,0.28,0.36), vec3(1.04,1.0,0.97), dayF);
          cloudCol = mix(cloudCol, vec3(1.05,0.62,0.38), duskF*0.8);
          col = mix(col, cloudCol, cm*0.85);
        }
        gl_FragColor = vec4(col, 1.0);
      }`
  })
);
sky.frustumCulled = false;
scene.add(sky);

// ------------------------------------------------------------
// 地形メッシュ(頂点カラー)
// ------------------------------------------------------------
const _tc = {
  grass: new THREE.Color(0x8fae6a), dry: new THREE.Color(0xb3b878),
  rock: new THREE.Color(0x8d8678), sand: new THREE.Color(0xcbbd91),
  snow: new THREE.Color(0xe8e9e4), n: V3(),
};
function terrainColorAt(x, z, out) {
  const h = terrainHeight(x, z);
  terrainNormal(x, z, _tc.n);
  const slope = 1 - _tc.n.y;
  const patch = fbm(x * 0.013 + 50, z * 0.013 + 21);
  out.copy(_tc.grass).lerp(_tc.dry, smoothstep(0.45, 0.75, patch));
  out.lerp(_tc.sand, smoothstep(WATER_LEVEL + 3.5, WATER_LEVEL + 0.5, h));
  out.lerp(_tc.rock, smoothstep(0.16, 0.34, slope));
  out.lerp(_tc.snow, smoothstep(58, 75, h) * (1 - smoothstep(0.3, 0.5, slope)));
  const tint = 0.92 + fbm(x * 0.05, z * 0.05) * 0.16;
  out.multiplyScalar(tint);
  return out;
}
function buildTerrain() {
  const seg = 256;
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, terrainHeight(x, z));
    terrainColorAt(x, z, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);
}
buildTerrain();

// ------------------------------------------------------------
// 高さマップテクスチャ(草シェーダー用)
// ------------------------------------------------------------
const HMAP = 512;
const heightTex = (() => {
  const data = new Uint16Array(HMAP * HMAP);
  for (let j = 0; j < HMAP; j++) {
    for (let i = 0; i < HMAP; i++) {
      const x = (i / (HMAP - 1) - 0.5) * WORLD;
      const z = (j / (HMAP - 1) - 0.5) * WORLD;
      data[j * HMAP + i] = THREE.DataUtils.toHalfFloat(terrainHeight(x, z));
    }
  }
  const tex = new THREE.DataTexture(data, HMAP, HMAP, THREE.RedFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
})();

// 地形カラーマップ(草を地面の色に馴染ませる)
const colorTex = (() => {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  const c = new THREE.Color();
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = (i / (N - 1) - 0.5) * WORLD;
      const z = (j / (N - 1) - 0.5) * WORLD;
      terrainColorAt(x, z, c);
      const k = (j * N + i) * 4;
      data[k] = c.r * 255; data[k + 1] = c.g * 255; data[k + 2] = c.b * 255; data[k + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
})();

// ------------------------------------------------------------
// 草原(インスタンシング + 頂点シェーダーで無限ラップ)
// ------------------------------------------------------------
const GRASS_COUNT = LOW_SPEC ? 20000 : 52000;
const GRASS_TILE = LOW_SPEC ? 150 : 190;
const grassUniforms = {
  uTime: { value: 0 },
  uCenter: { value: new THREE.Vector2() },
  uHeightTex: { value: heightTex },
  uColorTex: { value: colorTex },
  uWorld: { value: WORLD },
  uTile: { value: GRASS_TILE },
  uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  uAmbCol: { value: new THREE.Color(0.45, 0.55, 0.5) },
  uFogColor: { value: new THREE.Color(0xcfd8d2) },
  uFogNear: { value: 90 },
  uFogFar: { value: 760 },
};
function buildGrass() {
  // 1本 = 細い三角形ブレード(4頂点・2三角形で湾曲)
  const blade = new THREE.BufferGeometry();
  const verts = new Float32Array([
    -0.042, 0, 0, 0.042, 0, 0, -0.02, 0.62, 0,
    0.02, 0.62, 0, 0, 1.15, 0,
  ]);
  const uv = new Float32Array([0, 0, 0, 0, 0, 0.55, 0, 0.55, 0, 1]);
  blade.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  blade.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index;
  geo.attributes.position = blade.attributes.position;
  geo.attributes.uv = blade.attributes.uv;
  const offsets = new Float32Array(GRASS_COUNT * 2);
  const rands = new Float32Array(GRASS_COUNT * 4);
  for (let i = 0; i < GRASS_COUNT; i++) {
    offsets[i * 2] = Math.random() * GRASS_TILE;
    offsets[i * 2 + 1] = Math.random() * GRASS_TILE;
    rands[i * 4] = Math.random();
    rands[i * 4 + 1] = Math.random();
    rands[i * 4 + 2] = Math.random();
    rands[i * 4 + 3] = Math.random();
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 2));
  geo.setAttribute('aRand', new THREE.InstancedBufferAttribute(rands, 4));
  geo.instanceCount = GRASS_COUNT;

  const mat = new THREE.ShaderMaterial({
    uniforms: grassUniforms,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      attribute vec2 aOffset;
      attribute vec4 aRand;
      uniform float uTime;
      uniform vec2 uCenter;
      uniform sampler2D uHeightTex;
      uniform sampler2D uColorTex;
      uniform float uWorld;
      uniform float uTile;
      varying float vShade;
      varying float vTip;
      varying float vFogDepth;
      varying vec3 vColMix;
      varying vec3 vGroundCol;
      void main(){
        // タイル内オフセットをプレイヤー中心にラップ → 無限草原
        vec2 wpos = aOffset + uTile * floor((uCenter - aOffset)/uTile + 0.5);
        float h = texture2D(uHeightTex, wpos/uWorld + 0.5).r;
        vGroundCol = texture2D(uColorTex, wpos/uWorld + 0.5).rgb;

        float dist = distance(wpos, uCenter);
        float scale = (0.7 + aRand.z*0.75);
        scale *= 1.0 - smoothstep(uTile*0.36, uTile*0.5, dist);  // 距離フェード
        scale *= step(${(WATER_LEVEL + 0.4).toFixed(2)}, h);       // 水中は非表示
        scale *= 1.0 - smoothstep(44.0, 60.0, h);                 // 雪線より上には生えない

        // 向きランダム回転
        float ang = aRand.x * 6.2831;
        float ca = cos(ang), sa = sin(ang);
        vec3 p = position;
        p.xz = mat2(ca,-sa,sa,ca) * p.xz;
        p *= scale;

        // 風:大きなうねり + 個別の揺れ
        float tip = uv.y;
        float gust = sin(uTime*1.3 + wpos.x*0.045 + wpos.y*0.06);
        float sway = gust*0.55 + sin(uTime*2.6 + aRand.y*6.28)*0.18 + 0.25;
        p.x += tip*tip * sway * 0.45;
        p.z += tip*tip * sway * 0.18;

        vec3 world = vec3(wpos.x + p.x, h + p.y, wpos.y + p.z);
        vec4 mv = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mv;
        vFogDepth = -mv.z;
        vTip = tip;
        vShade = 0.75 + 0.25*sin(ang) ;
        vShade *= 0.85 + gust*0.15;   // 風の波で明暗(草原の波)
        vColMix = vec3(aRand.w, aRand.x, aRand.y);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSunCol;
      uniform vec3 uAmbCol;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      varying float vShade;
      varying float vTip;
      varying float vFogDepth;
      varying vec3 vColMix;
      varying vec3 vGroundCol;
      void main(){
        // 根元は地面の色、先端へ行くほど明るく黄みがかる
        vec3 base = vGroundCol * mix(0.55, 1.35, vTip);
        base += vec3(0.10, 0.08, -0.02) * vTip * (0.4 + vColMix.x*0.6);
        base = mix(base, base * vec3(1.08,1.02,0.7), vColMix.y*0.35);
        vec3 col = base * (uAmbCol + uSunCol * vShade);
        float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return geo;
}
const grassGeo = buildGrass();

// ------------------------------------------------------------
// 水面
// ------------------------------------------------------------
const waterUniforms = {
  uTime: { value: 0 },
  uFogColor: grassUniforms.uFogColor,
  uFogNear: grassUniforms.uFogNear,
  uFogFar: grassUniforms.uFogFar,
  uSunCol: grassUniforms.uSunCol,
};
{
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    transparent: true, uniforms: waterUniforms,
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      varying float vFogDepth;
      void main(){
        vec4 wp = modelMatrix * vec4(position,1.0);
        vWorld = wp.xyz;
        vec4 mv = viewMatrix * wp;
        vFogDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogNear;
      uniform float uFogFar;
      uniform vec3 uSunCol;
      varying vec3 vWorld;
      varying float vFogDepth;
      void main(){
        float r1 = sin(vWorld.x*0.5 + uTime*1.1) * sin(vWorld.z*0.43 - uTime*0.9);
        float r2 = sin(vWorld.x*1.7 - uTime*1.7) * sin(vWorld.z*1.3 + uTime*1.3);
        float ripple = r1*0.5 + r2*0.3;
        vec3 col = mix(vec3(0.14,0.32,0.36), vec3(0.32,0.52,0.55), 0.5+ripple*0.5);
        col += uSunCol * pow(max(ripple,0.0), 6.0) * 1.4;
        float fogF = smoothstep(uFogNear, uFogFar, vFogDepth);
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, 0.82);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = WATER_LEVEL;
  scene.add(mesh);
}

// ------------------------------------------------------------
// 当たり判定用コライダー(円柱)
// ------------------------------------------------------------
const colliders = []; // {x, z, r}

// ------------------------------------------------------------
// 木 / 岩 / 花(インスタンシング)
// ------------------------------------------------------------
const treeWind = { value: 0 };
function scatterTrees() {
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.5, 4.4, 6);
  trunkGeo.translate(0, 2.2, 0);
  const folGeo = new THREE.IcosahedronGeometry(2.1, 1);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 1 });
  const folMat = new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: false });
  // 葉の風揺れ(インスタンス位置を位相にして個体差を出す)
  folMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = treeWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float wph = dot(instanceMatrix[3].xz, vec2(0.13, 0.17));
        transformed += vec3(sin(uTime*1.5 + wph), sin(uTime*0.9 + wph)*0.4, cos(uTime*1.2 + wph))
                       * 0.12 * (position.y*0.2 + 0.6);`);
  };

  const positions = [];
  let attempts = 0;
  while (positions.length < 300 && attempts++ < 6000) {
    const x = rand(WORLD_EDGE, -WORLD_EDGE), z = rand(WORLD_EDGE, -WORLD_EDGE);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 1.5 || h > 50) continue;
    terrainNormal(x, z, _v1);
    if (_v1.y < 0.86) continue;
    if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 30) continue;
    if (fbm(x * 0.008 + 99, z * 0.008 + 4) < 0.46) continue; // 森のまとまり
    positions.push([x, h, z]);
  }
  const trunk = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  const fol = new THREE.InstancedMesh(folGeo, folMat, positions.length * 3);
  trunk.castShadow = fol.castShadow = true;
  fol.receiveShadow = true;

  // 紅葉パレット(スクリーンショットの雰囲気)
  const palette = [
    [0x4f7a3a, 0.40], [0x6f9440, 0.18], [0xb6a83e, 0.16],
    [0xc97e2e, 0.14], [0xb8512a, 0.12],
  ];
  const pickCol = () => {
    let r = Math.random();
    for (const [c, w] of palette) { if ((r -= w) <= 0) return c; }
    return palette[0][0];
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V3(), p = V3();
  const col = new THREE.Color();
  let fi = 0;
  positions.forEach(([x, h, z], i) => {
    const sc = rand(1.5, 0.8);
    q.setFromEuler(new THREE.Euler(0, rand(Math.PI * 2), rand(0.07, -0.07)));
    m.compose(p.set(x, h - 0.3, z), q, s.set(sc, sc * rand(1.25, 0.95), sc));
    trunk.setMatrixAt(i, m);
    colliders.push({ x, z, r: 0.7 * sc });
    const treeCol = pickCol();
    for (let k = 0; k < 3; k++) {
      const fs = sc * rand(1.25, 0.75);
      q.setFromEuler(new THREE.Euler(rand(0.4, -0.4), rand(Math.PI * 2), rand(0.4, -0.4)));
      m.compose(
        p.set(x + rand(1.3, -1.3) * sc, h + 4.4 * sc + rand(1.6, -0.6), z + rand(1.3, -1.3) * sc),
        q, s.set(fs, fs * 0.85, fs)
      );
      fol.setMatrixAt(fi, m);
      col.setHex(treeCol).offsetHSL(rand(0.02, -0.02), 0, rand(0.06, -0.06));
      fol.setColorAt(fi, col);
      fi++;
    }
  });
  scene.add(trunk, fol);
}
scatterTrees();

function scatterRocks() {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1 });
  const N = 130;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  mesh.castShadow = mesh.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V3(), p = V3();
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const x = rand(WORLD_EDGE, -WORLD_EDGE), z = rand(WORLD_EDGE, -WORLD_EDGE);
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.5) { i--; continue; }
    const sc = rand(2.4, 0.5);
    q.setFromEuler(new THREE.Euler(rand(Math.PI), rand(Math.PI), rand(Math.PI)));
    m.compose(p.set(x, h + sc * 0.2, z), q, s.set(sc, sc * rand(1.1, 0.7), sc));
    mesh.setMatrixAt(i, m);
    col.setHex(0x8a8478).offsetHSL(0, 0, rand(0.08, -0.08));
    mesh.setColorAt(i, col);
    if (sc > 1.2) colliders.push({ x, z, r: sc * 0.85 });
  }
  scene.add(mesh);
}
scatterRocks();

function scatterFlowers() {
  const geo = new THREE.PlaneGeometry(0.32, 0.32);
  geo.translate(0, 0.4, 0);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false });
  const N = 900;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V3(), p = V3();
  const col = new THREE.Color();
  const cols = [0xe8b4cc, 0xe8d44a, 0xd8624a, 0xe8e8e0, 0xb088d8];
  for (let i = 0; i < N; i++) {
    const a = rand(Math.PI * 2), d = Math.sqrt(Math.random()) * 220;
    const x = SPAWN.x + Math.cos(a) * d, z = SPAWN.z + Math.sin(a) * d;
    const h = terrainHeight(x, z);
    if (h < WATER_LEVEL + 0.5) { i--; continue; }
    q.setFromEuler(new THREE.Euler(rand(0.3, -0.3), rand(Math.PI * 2), rand(0.3, -0.3)));
    const sc = rand(1.3, 0.7);
    m.compose(p.set(x, h, z), q, s.set(sc, sc, sc));
    mesh.setMatrixAt(i, m);
    col.setHex(cols[Math.floor(rand(cols.length))]);
    mesh.setColorAt(i, col);
  }
  scene.add(mesh);
}
scatterFlowers();

// ------------------------------------------------------------
// 遺跡ビルダー
// ------------------------------------------------------------
const stoneMat = new THREE.MeshStandardMaterial({ color: 0xa39b86, roughness: 1 });
const stoneDark = new THREE.MeshStandardMaterial({ color: 0x7e7766, roughness: 1 });
function addPillar(x, z, h = 7, broken = false, lean = 0) {
  const gy = terrainHeight(x, z);
  const geo = new THREE.CylinderGeometry(0.85, 1.05, h, 8);
  const m = new THREE.Mesh(geo, stoneMat);
  m.position.set(x, gy + h / 2 - 0.4, z);
  m.rotation.z = lean;
  m.castShadow = m.receiveShadow = true;
  scene.add(m);
  if (!broken) {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.8, 2.6), stoneDark);
    cap.position.set(x, gy + h + 0.1, z);
    cap.castShadow = true;
    scene.add(cap);
  }
  colliders.push({ x, z, r: 1.3 });
  return m;
}
function addRuinSite(cx, cz, radius = 9, count = 6) {
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand(0.3);
    const x = cx + Math.cos(a) * radius, z = cz + Math.sin(a) * radius;
    const broken = Math.random() < 0.45;
    addPillar(x, z, broken ? rand(5, 2.5) : rand(9, 6), broken, rand(0.06, -0.06));
  }
  // 倒れた柱
  const gy = terrainHeight(cx + radius * 0.4, cz);
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.95, 7, 8), stoneMat);
  fallen.position.set(cx + radius * 0.4, gy + 0.9, cz + 2);
  fallen.rotation.set(Math.PI / 2 - 0.08, 0, rand(Math.PI));
  fallen.castShadow = fallen.receiveShadow = true;
  scene.add(fallen);
}

// ------------------------------------------------------------
// ストーリー上のロケーション
// ------------------------------------------------------------
const LOC = {
  camp: new THREE.Vector3(38, 0, 18),
  shrineA: new THREE.Vector3(-150, 0, -90),   // 森の祠
  shrineB: new THREE.Vector3(170, 0, -160),   // 湖畔の祠
  shrineC: new THREE.Vector3(-60, 0, 210),    // 丘の祠
  altar: new THREE.Vector3(-200, 0, -320),    // 北西の祭壇(ボス)
  toki: new THREE.Vector3(-62, 0, 60),        // 狩人トキの野営
  summit: new THREE.Vector3(SUMMIT_X, 0, SUMMIT_Z),  // 東の高峰(風見の頂)
  chime1: new THREE.Vector3(-210, 0, 140),
  chime2: new THREE.Vector3(240, 0, 60),
  chime3: new THREE.Vector3(-120, 0, -230),
};
for (const k in LOC) LOC[k].y = terrainHeight(LOC[k].x, LOC[k].z);

addRuinSite(LOC.shrineA.x, LOC.shrineA.z, 8, 5);
addRuinSite(LOC.shrineB.x, LOC.shrineB.z, 8, 5);
addRuinSite(LOC.shrineC.x, LOC.shrineC.z, 8, 5);
addRuinSite(LOC.altar.x, LOC.altar.z, 16, 10);
// スポーン地点の目印:壊れた門(スクリーンショット右の構造物风)
addPillar(SPAWN.x - 14, SPAWN.z - 8, 8);
addPillar(SPAWN.x - 9, SPAWN.z - 8, 8);
{
  const gy = Math.max(terrainHeight(SPAWN.x - 14, SPAWN.z - 8), terrainHeight(SPAWN.x - 9, SPAWN.z - 8));
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 3), stoneDark);
  lintel.position.set(SPAWN.x - 11.5, gy + 8.2, SPAWN.z - 8);
  lintel.rotation.y = 0.04;
  lintel.castShadow = true;
  scene.add(lintel);
}

// ------------------------------------------------------------
// 目標ビーム(導きの光)
// ------------------------------------------------------------
function makeBeam(color = 0x7fd8c8) {
  const geo = new THREE.CylinderGeometry(0.8, 1.6, 240, 12, 1, true);
  const mat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.28,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.visible = false;
  scene.add(m);
  return m;
}
const beams = { camp: makeBeam(0xe8c87a), A: makeBeam(), B: makeBeam(), C: makeBeam(), altar: makeBeam(0xd84a3a) };
// サイドクエスト用(細く控えめな光)
const sideBeams = {
  chime1: makeBeam(0xffd88a), chime2: makeBeam(0xffd88a), chime3: makeBeam(0xffd88a),
  summit: makeBeam(0xaac8e8),
};
for (const b of Object.values(sideBeams)) b.scale.set(0.45, 1, 0.45);
beams.camp.position.copy(LOC.camp).y += 110;
beams.A.position.copy(LOC.shrineA).y += 110;
beams.B.position.copy(LOC.shrineB).y += 110;
beams.C.position.copy(LOC.shrineC).y += 110;
beams.altar.position.copy(LOC.altar).y += 110;
for (const k of ['chime1', 'chime2', 'chime3', 'summit']) sideBeams[k].position.copy(LOC[k]).y += 110;

// ------------------------------------------------------------
// 記憶の欠片(クリスタル)
// ------------------------------------------------------------
function makeShard(loc) {
  const g = new THREE.Group();
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7, 0),
    new THREE.MeshStandardMaterial({
      color: 0x7fd8c8, emissive: 0x3fb8a8, emissiveIntensity: 1.6,
      roughness: 0.2, metalness: 0.1,
    })
  );
  crystal.scale.y = 1.6;
  g.add(crystal);
  const light = new THREE.PointLight(0x7fd8c8, 12, 18);
  light.position.y = 1;
  g.add(light);
  g.position.copy(loc);
  g.position.y = terrainHeight(loc.x, loc.z) + 1.4;
  scene.add(g);
  return g;
}

// ------------------------------------------------------------
// キャラクター(主人公)
// ------------------------------------------------------------
function buildHero() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8c49a, roughness: 0.9 });
  const tunic = new THREE.MeshStandardMaterial({ color: 0x3a7a5e, roughness: 0.95 });
  const pants = new THREE.MeshStandardMaterial({ color: 0xd8d2c0, roughness: 0.95 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 1 });
  const belt = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 1 });

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 10), tunic);
  body.position.y = 1.05; g.add(body);
  const beltM = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.12, 10), belt);
  beltM.position.y = 0.92; g.add(beltM);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), skin);
  head.position.y = 1.74; g.add(head);
  const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 12), hair);
  hairM.position.set(0, 1.81, -0.04);
  hairM.scale.set(1, 0.82, 1); g.add(hairM);

  const mkLimb = (mat, len, r) => {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), mat);
    m.position.y = -len / 2 - r;
    pivot.add(m);
    return pivot;
  };
  const armL = mkLimb(skin, 0.42, 0.09); armL.position.set(-0.38, 1.42, 0);
  const armR = mkLimb(skin, 0.42, 0.09); armR.position.set(0.38, 1.42, 0);
  const legL = mkLimb(pants, 0.5, 0.11); legL.position.set(-0.16, 0.72, 0);
  const legR = mkLimb(pants, 0.5, 0.11); legR.position.set(0.16, 0.72, 0);
  g.add(armL, armR, legL, legR);

  // 武器(右手のマウントに3種を仕込み、可視を切り替える)
  const mount = new THREE.Group();
  mount.position.y = -0.95;
  mount.rotation.x = Math.PI;
  armR.add(mount);

  const steel = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, metalness: 0.85, roughness: 0.25 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xa8862e, metalness: 0.6, roughness: 0.4 });
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2e20, roughness: 1 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 });
  const oldSteel = new THREE.MeshStandardMaterial({
    color: 0x9aa2a8, metalness: 0.7, roughness: 0.5,
    emissive: 0x2a3038, emissiveIntensity: 0.5,
  });

  // 旅人の剣
  const sword = new THREE.Group();
  {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.0, 0.16), steel);
    blade.position.y = -0.75;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.1), brass);
    guard.position.y = -0.22;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 6), leather);
    grip.position.y = -0.1;
    sword.add(blade, guard, grip);
  }

  // 風薙の槍(長い柄 + 穂先)
  const spear = new THREE.Group();
  {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 2.5, 7), wood);
    shaft.position.y = -0.85;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 7), steel);
    head.position.y = -2.3;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.1, 7), brass);
    collar.position.y = -2.03;
    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.06, 7, 6), brass);
    tail.position.y = 0.4;
    spear.add(shaft, head, collar, tail);
    spear.visible = false;
  }

  // 古の大剣(幅広・重い)
  const great = new THREE.Group();
  {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.55, 0.3), oldSteel);
    blade.position.y = -1.05;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), oldSteel);
    tip.position.y = -1.96;
    tip.rotation.y = Math.PI / 4;
    tip.scale.z = 0.55;
    const guard = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.14), brass);
    guard.position.y = -0.26;
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 6), leather);
    grip.position.y = -0.06;
    const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.09, 0), brass);
    pommel.position.y = 0.14;
    great.add(blade, tip, guard, grip, pommel);
    great.visible = false;
  }
  mount.add(sword, spear, great);

  // 背中の盾っぽい装備
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.5, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 1 }));
  pack.position.set(0, 1.2, -0.3);
  pack.rotation.x = 0.1;
  g.add(pack);

  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return { group: g, armL, armR, legL, legR, head, sword, mount, weapons: { sword, spear, great } };
}
const hero = buildHero();
hero.group.rotation.order = 'YXZ';   // ロール回転(X)をヨー(Y)の後に適用
hero.group.position.copy(SPAWN);
hero.group.position.y = terrainHeight(SPAWN.x, SPAWN.z);
scene.add(hero.group);

// 剣の軌跡エフェクト
const slashArc = (() => {
  const geo = new THREE.RingGeometry(0.7, 1.9, 18, 1, 0, Math.PI * 1.15);
  const mat = new THREE.MeshBasicMaterial({
    color: 0xd8eeff, transparent: true, opacity: 0,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2.4;
  m.position.y = 1.2;
  hero.group.add(m);
  return m;
})();

// ------------------------------------------------------------
// パーティクルプール
// ------------------------------------------------------------
const PARTICLE_MAX = 600;
const particles = (() => {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PARTICLE_MAX * 3);
  const col = new Float32Array(PARTICLE_MAX * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({
    size: 0.22, vertexColors: true, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  const items = [];
  for (let i = 0; i < PARTICLE_MAX; i++) items.push({ life: 0, vel: V3(), idx: i });
  return { geo, pos, col, items, points };
})();
function spawnParticles(origin, count, color, speed = 4, life = 0.7, up = 2) {
  const c = new THREE.Color(color);
  let spawned = 0;
  for (const p of particles.items) {
    if (p.life > 0) continue;
    p.life = life * rand(1.2, 0.6);
    p.maxLife = p.life;
    p.vel.set(rand(1, -1), rand(1, 0.1) * up / 2, rand(1, -1)).normalize().multiplyScalar(speed * rand(1.3, 0.4));
    particles.pos[p.idx * 3] = origin.x;
    particles.pos[p.idx * 3 + 1] = origin.y;
    particles.pos[p.idx * 3 + 2] = origin.z;
    particles.col[p.idx * 3] = c.r;
    particles.col[p.idx * 3 + 1] = c.g;
    particles.col[p.idx * 3 + 2] = c.b;
    if (++spawned >= count) break;
  }
}
function updateParticles(dt) {
  let any = false;
  for (const p of particles.items) {
    if (p.life <= 0) continue;
    any = true;
    p.life -= dt;
    p.vel.y -= 6 * dt;
    particles.pos[p.idx * 3] += p.vel.x * dt;
    particles.pos[p.idx * 3 + 1] += p.vel.y * dt;
    particles.pos[p.idx * 3 + 2] += p.vel.z * dt;
    if (p.life <= 0) {
      particles.pos[p.idx * 3 + 1] = -9999;
    }
  }
  if (any) {
    particles.geo.attributes.position.needsUpdate = true;
    particles.geo.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------
// 敵
// ------------------------------------------------------------
const enemies = [];

function buildSlimeModel() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 14, 12),
    new THREE.MeshStandardMaterial({
      color: 0x86b83e, roughness: 0.35, transparent: true, opacity: 0.92,
      emissive: 0x2a4a10, emissiveIntensity: 0.4,
    })
  );
  body.position.y = 0.62;
  body.castShadow = true;
  g.add(body);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a14 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), eyeMat);
    eye.position.set(0.22 * s, 0.78, 0.55);
    g.add(eye);
  }
  return { group: g, body };
}

function buildShadeModel() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x241a30, roughness: 0.8, emissive: 0x1a0a28, emissiveIntensity: 0.5,
  });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.7, 4, 10), mat);
  body.position.y = 1.1; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), mat);
  head.position.y = 1.95; head.castShadow = true; g.add(head);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5533 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), eyeMat);
    eye.position.set(0.11 * s, 2.0, 0.22);
    g.add(eye);
  }
  const mkArm = () => {
    const pivot = new THREE.Group();
    const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 3, 8), mat);
    a.position.y = -0.4; a.castShadow = true;
    pivot.add(a);
    return pivot;
  };
  const armL = mkArm(); armL.position.set(-0.42, 1.55, 0);
  const armR = mkArm(); armR.position.set(0.42, 1.55, 0);
  g.add(armL, armR);
  // 爪
  const clawMat = new THREE.MeshStandardMaterial({ color: 0x885566, metalness: 0.3, roughness: 0.4 });
  const claw = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.5, 6), clawMat);
  claw.position.y = -0.95; claw.rotation.x = Math.PI;
  armR.add(claw);
  return { group: g, armL, armR };
}

function buildBossModel() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1c1426, roughness: 0.7, emissive: 0x2a0a3a, emissiveIntensity: 0.6,
  });
  const torso = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 14), mat);
  torso.scale.set(1.25, 1.0, 1.9);
  torso.position.y = 2.0; torso.castShadow = true; g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 12), mat);
  head.position.set(0, 2.7, 2.4); head.castShadow = true; g.add(head);
  const hornMat = new THREE.MeshStandardMaterial({ color: 0xc8b890, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.18, 1.4, 7), hornMat);
    horn.position.set(0.55 * s, 3.5, 2.2);
    horn.rotation.z = -0.45 * s;
    horn.castShadow = true;
    g.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4422 }));
    eye.position.set(0.36 * s, 2.85, 3.1);
    g.add(eye);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new THREE.Group();
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 1.3, 4, 8), mat);
    l.position.y = -0.9; l.castShadow = true;
    leg.add(l);
    leg.position.set(1.15 * sx, 2.0, 1.3 * sz);
    g.add(leg);
    legs.push(leg);
  }
  const glow = new THREE.PointLight(0x8a2aff, 8, 16);
  glow.position.y = 2.5;
  g.add(glow);
  return { group: g, legs, head };
}

function buildWispModel() {
  const g = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.34, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffb45a, emissive: 0xff7a20, emissiveIntensity: 2.2, roughness: 0.4,
    })
  );
  core.position.y = 1.5;
  g.add(core);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0xff9a3a, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })
  );
  halo.position.y = 1.5;
  g.add(halo);
  const light = new THREE.PointLight(0xff8a30, 7, 14);
  light.position.y = 1.5;
  g.add(light);
  return { group: g, core, halo };
}

function buildChargerModel() {
  const g = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x5a4638, roughness: 1 });
  const rock = new THREE.MeshStandardMaterial({ color: 0x7d776b, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 0.9, 4, 10), hide);
  body.rotation.z = Math.PI / 2;
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 12, 10), hide);
  head.position.set(0, 0.92, 1.05);
  head.scale.z = 1.25;
  head.castShadow = true;
  g.add(head);
  // 背の岩甲
  for (let i = 0; i < 4; i++) {
    const plate = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), rock);
    plate.position.set(rand(0.2, -0.2), 1.5 - i * 0.06, 0.55 - i * 0.42);
    plate.rotation.set(rand(1), rand(1), rand(1));
    plate.castShadow = true;
    g.add(plate);
  }
  // 牙
  const tuskMat = new THREE.MeshStandardMaterial({ color: 0xd8cfb4, roughness: 0.5 });
  for (const sgn of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.44, 6), tuskMat);
    tusk.position.set(0.24 * sgn, 0.82, 1.36);
    tusk.rotation.set(-1.1, 0, 0.3 * sgn);
    g.add(tusk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffcc44 }));
    eye.position.set(0.26 * sgn, 1.12, 1.25);
    g.add(eye);
  }
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = new THREE.Group();
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.5, 3, 7), hide);
    l.position.y = -0.35;
    l.castShadow = true;
    leg.add(l);
    leg.position.set(0.4 * sx, 0.72, 0.5 * sz);
    g.add(leg);
    legs.push(leg);
  }
  return { group: g, legs, head };
}

// 敵の性能表
const ENEMY_STATS = {
  slime:   { hp: 2,  speed: 3.4, dmg: 1, aggro: 26, radius: 0.8, cd: 1.2 },
  shade:   { hp: 5,  speed: 4.4, dmg: 2, aggro: 26, radius: 0.8, cd: 1.2 },
  wisp:    { hp: 3,  speed: 3.0, dmg: 2, aggro: 30, radius: 0.7, cd: 2.2 },
  charger: { hp: 8,  speed: 3.6, dmg: 3, aggro: 32, radius: 1.2, cd: 2.6 },
  boss:    { hp: 36, speed: 7.5, dmg: 3, aggro: 90, radius: 2.6, cd: 1.4 },
};
const ENEMY_NAMES = { slime: '草の粘塊', shade: '影の魔物', wisp: '迷イ火', charger: '岩背獣', boss: '影ノ獣' };
const ENEMY_COLOR = { slime: 0x9ad84a, shade: 0x8a2aff, wisp: 0xff8a30, charger: 0xc8a878, boss: 0xb86aff };

function spawnEnemy(type, x, z) {
  const model = type === 'slime' ? buildSlimeModel()
    : type === 'shade' ? buildShadeModel()
    : type === 'wisp' ? buildWispModel()
    : type === 'charger' ? buildChargerModel()
    : buildBossModel();
  const st = ENEMY_STATS[type];
  const e = {
    type, model,
    pos: new THREE.Vector3(x, terrainHeight(x, z), z),
    home: new THREE.Vector3(x, 0, z),
    vel: V3(),
    hp: st.hp, maxHp: st.hp,
    state: 'idle', t: rand(3),
    attackCd: 0, hurtT: 0, dead: false, deathT: 0,
    yaw: rand(Math.PI * 2),
    aggro: st.aggro, speed: st.speed, dmg: st.dmg, radius: st.radius, cd: st.cd,
    windT: 0, chargeT: 0, chargeDir: V3(),
  };
  e.model.group.position.copy(e.pos);
  scene.add(e.model.group);
  enemies.push(e);
  return e;
}

// 敵の配置:祠の守り + 草原に点在
function populateEnemies() {
  const guard = (loc, n, type) => {
    for (let i = 0; i < n; i++) {
      const a = rand(Math.PI * 2), d = rand(14, 6);
      spawnEnemy(type, loc.x + Math.cos(a) * d, loc.z + Math.sin(a) * d);
    }
  };
  // 森の祠:粘塊と影、木立に潜む迷イ火
  guard(LOC.shrineA, 3, 'slime');
  guard(LOC.shrineA, 1, 'shade');
  guard(LOC.shrineA, 1, 'wisp');
  // 湖畔の祠:遠距離の迷イ火が多い
  guard(LOC.shrineB, 2, 'slime');
  guard(LOC.shrineB, 2, 'shade');
  guard(LOC.shrineB, 2, 'wisp');
  // 丘の祠:岩背獣の縄張り
  guard(LOC.shrineC, 2, 'slime');
  guard(LOC.shrineC, 1, 'shade');
  guard(LOC.shrineC, 2, 'charger');
  // 草原に点在
  for (let i = 0; i < 8; i++) {
    const a = rand(Math.PI * 2), d = rand(200, 80);
    const x = SPAWN.x + Math.cos(a) * d, z = SPAWN.z + Math.sin(a) * d;
    if (terrainHeight(x, z) < WATER_LEVEL + 1) continue;
    spawnEnemy('slime', x, z);
  }
  // 荒野の岩背獣(討伐依頼の対象)
  for (let i = 0; i < 6; i++) {
    const a = rand(Math.PI * 2), d = rand(250, 120);
    const x = SPAWN.x + Math.cos(a) * d, z = SPAWN.z + Math.sin(a) * d;
    if (terrainHeight(x, z) < WATER_LEVEL + 2) continue;
    spawnEnemy('charger', x, z);
  }
  // 夜の湿地を漂う迷イ火
  for (let i = 0; i < 5; i++) {
    const a = rand(Math.PI * 2), d = rand(230, 100);
    const x = SPAWN.x + Math.cos(a) * d, z = SPAWN.z + Math.sin(a) * d;
    if (terrainHeight(x, z) < WATER_LEVEL + 1) continue;
    spawnEnemy('wisp', x, z);
  }
}
populateEnemies();

// ------------------------------------------------------------
// 投射物(迷イ火の火の玉)
// ------------------------------------------------------------
const projectiles = [];
const projCoreGeo = new THREE.SphereGeometry(0.14, 8, 7);
const projGlowGeo = new THREE.SphereGeometry(0.4, 10, 8);
const projCoreMat = new THREE.MeshBasicMaterial({ color: 0xffeec4 });
const projGlowMat = new THREE.MeshBasicMaterial({
  color: 0xff8a30, transparent: true, opacity: 0.4,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
function spawnProjectile(from, dir, speed, dmg) {
  const mesh = new THREE.Mesh(projCoreGeo, projCoreMat);
  const glow = new THREE.Mesh(projGlowGeo, projGlowMat);
  mesh.add(glow);
  mesh.position.copy(from);
  mesh.add(new THREE.PointLight(0xff8a30, 6, 9));
  scene.add(mesh);
  projectiles.push({ mesh, glow, vel: dir.clone().multiplyScalar(speed), dmg, life: 4, trail: 0 });
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.life -= dt;
    p.mesh.position.addScaledVector(p.vel, dt);
    p.vel.y -= 2.2 * dt;
    // 尾を引かせる
    p.glow.scale.setScalar(0.85 + Math.sin(p.life * 30) * 0.15);
    p.trail -= dt;
    if (p.trail <= 0) { p.trail = 0.06; spawnParticles(p.mesh.position, 1, 0xff9a3a, 0.6, 0.35, 0.4); }
    let gone = p.life <= 0;
    if (!gone && p.mesh.position.distanceTo(player.pos) < 1.5 && player.pos.y + 2.2 > p.mesh.position.y) {
      damagePlayer(p.dmg, p.mesh.position);
      spawnParticles(p.mesh.position, 12, 0xff8a30, 4, 0.5, 2);
      gone = true;
    }
    if (!gone && p.mesh.position.y < terrainHeight(p.mesh.position.x, p.mesh.position.z)) {
      spawnParticles(p.mesh.position, 8, 0xff8a30, 3, 0.4, 2);
      gone = true;
    }
    if (gone) { scene.remove(p.mesh); projectiles.splice(i, 1); }
  }
}

// ------------------------------------------------------------
// 回復ハート(ドロップ)
// ------------------------------------------------------------
const pickups = [];
function dropHeart(pos) {
  const m = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.3, 0),
    new THREE.MeshStandardMaterial({ color: 0xd84a5a, emissive: 0xa82a3a, emissiveIntensity: 1.2 })
  );
  m.position.copy(pos);
  m.position.y = terrainHeight(pos.x, pos.z) + 0.8;
  scene.add(m);
  pickups.push({ mesh: m, t: 0 });
}

// ------------------------------------------------------------
// NPC(長老ナギ)
// ------------------------------------------------------------
function buildNPC() {
  const g = new THREE.Group();
  const robe = new THREE.MeshStandardMaterial({ color: 0x7a5a8a, roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8b890, roughness: 1 });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.46, 1.5, 10), robe);
  body.position.y = 0.75; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.y = 1.66; head.castShadow = true; g.add(head);
  const beard = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 8),
    new THREE.MeshStandardMaterial({ color: 0xe0ddd0, roughness: 1 }));
  beard.position.set(0, 1.42, 0.14);
  g.add(beard);
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.9, 6),
    new THREE.MeshStandardMaterial({ color: 0x6a4a2e, roughness: 1 }));
  staff.position.set(0.5, 0.95, 0.1);
  g.add(staff);
  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0x7fd8c8, emissive: 0x3fb8a8, emissiveIntensity: 2 }));
  orb.position.set(0.5, 1.95, 0.1);
  g.add(orb);
  g.position.copy(LOC.camp);
  scene.add(g);
  return g;
}
const npc = buildNPC();

// 焚き火
{
  const fire = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 1 }));
    log.rotation.set(Math.PI / 2.3, 0, (i / 4) * Math.PI * 2);
    fire.add(log);
  }
  const fireLight = new THREE.PointLight(0xff8830, 16, 20);
  fireLight.position.y = 1;
  fire.add(fireLight);
  fire.position.copy(LOC.camp);
  fire.position.x += 2.5;
  fire.position.y = terrainHeight(LOC.camp.x + 2.5, LOC.camp.z) + 0.2;
  scene.add(fire);
  fire.userData.light = fireLight;
  npc.userData.fire = fire;
}

// ------------------------------------------------------------
// サウンド(全て手続き生成・外部ファイル不要)
// ------------------------------------------------------------
const audio = {
  ctx: null, master: null, windGain: null, musicGain: null,
  init() {
    if (this.ctx) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(ctx.destination);

    // ---- 風(ループするノイズ + ゆらぎ) ----
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.97 + (Math.random() * 2 - 1) * 0.03; // ブラウンノイズ風
      d[i] = last * 8;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.4;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(this.windGain.gain);
    src.connect(lp).connect(this.windGain).connect(this.master);
    src.start(); lfo.start();

    // ---- 環境音楽(ゆっくり移ろうパッド) ----
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.05;
    this.musicGain.connect(this.master);
    const chords = [
      [220.0, 261.6, 329.6],   // Am
      [174.6, 220.0, 261.6],   // F
      [196.0, 246.9, 293.7],   // G
      [164.8, 220.0, 246.9],   // Em-ish
    ];
    let ci = 0;
    const playChord = () => {
      if (!this.ctx) return;
      const t = ctx.currentTime;
      for (const f of chords[ci % chords.length]) {
        for (const det of [-2.5, 2.5]) {
          const o = ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = f; o.detune.value = det;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.16, t + 4);
          g.gain.linearRampToValueAtTime(0, t + 11);
          o.connect(g).connect(this.musicGain);
          o.start(t); o.stop(t + 11.5);
        }
      }
      ci++;
      setTimeout(playChord, 8000);
    };
    playChord();
    // ---- 小鳥(昼のみ・ランダム) ----
    const bird = () => {
      if (this.ctx && skyUniforms.uNight.value < 0.3 && Math.random() < 0.65) {
        const t = ctx.currentTime;
        const n = 2 + Math.floor(Math.random() * 3);
        const base = 2400 + Math.random() * 1400;
        for (let i = 0; i < n; i++) {
          const o = ctx.createOscillator();
          o.type = 'sine';
          const t0 = t + i * 0.12 + Math.random() * 0.04;
          o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), t0);
          o.frequency.exponentialRampToValueAtTime(base * 0.8, t0 + 0.09);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0, t0);
          g.gain.linearRampToValueAtTime(0.025, t0 + 0.02);
          g.gain.linearRampToValueAtTime(0, t0 + 0.1);
          o.connect(g).connect(this.master);
          o.start(t0); o.stop(t0 + 0.12);
        }
      }
      setTimeout(bird, 3500 + Math.random() * 7000);
    };
    setTimeout(bird, 2500);
  },
  blip(freq = 880, dur = 0.05, vol = 0.05, type = 'sine') {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  noiseBurst(dur = 0.18, freq = 1800, vol = 0.14, sweep = 0.4) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(freq, t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(80, freq * sweep), t + dur);
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
  },
  sword(pitch = 1) { this.noiseBurst(0.16 / pitch, 2400 * pitch, 0.12, 0.25); },
  hit() {
    this.noiseBurst(0.1, 900, 0.16, 0.5);
    this.blip(120, 0.12, 0.12, 'square');
  },
  hurt() { this.blip(110, 0.25, 0.16, 'sawtooth'); this.noiseBurst(0.2, 400, 0.1, 0.4); },
  pickup() { this.blip(880, 0.1, 0.06); setTimeout(() => this.blip(1320, 0.14, 0.06), 70); },
  shard() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => setTimeout(() => this.blip(f, 0.5, 0.05), i * 130));
  },
  kill() { this.noiseBurst(0.35, 700, 0.12, 0.2); },
  roar() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, t);
    o.frequency.exponentialRampToValueAtTime(180, t + 0.6);
    o.frequency.exponentialRampToValueAtTime(40, t + 1.6);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600;
    o.connect(lp).connect(g).connect(this.master);
    o.start(t); o.stop(t + 2);
    this.noiseBurst(1.2, 200, 0.14, 0.3);
  },
  dialogBlip() { this.blip(660, 0.04, 0.03); },
};

// ------------------------------------------------------------
// 入力
// ------------------------------------------------------------
const keys = {};
let pointerLocked = false;
addEventListener('keydown', e => { keys[e.code] = true; });
addEventListener('keyup', e => { keys[e.code] = false; });
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
});

const cam = { yaw: Math.PI, pitch: 0.32, dist: 6.8 };

// ------------------------------------------------------------
// タッチ操作(仮想スティック + 視点ドラッグ + アクションボタン)
// ------------------------------------------------------------
const IS_TOUCH = matchMedia('(pointer: coarse)').matches
  || navigator.maxTouchPoints > 0
  || new URLSearchParams(location.search).has('touch');

const touch = {
  stick: { id: null, ox: 0, oy: 0, x: 0, z: 0, mag: 0 },
  look: { id: null, lx: 0, ly: 0 },
  pinch: null,
};
function readMoveInput() {
  let ix = 0, iz = 0;
  if (keys['KeyW']) iz -= 1;
  if (keys['KeyS']) iz += 1;
  if (keys['KeyA']) ix -= 1;
  if (keys['KeyD']) ix += 1;
  if (touch.stick.mag > 0) { ix += touch.stick.x; iz += touch.stick.z; }
  return { ix, iz };
}

function showTouchUI() {
  if (IS_TOUCH) document.getElementById('touch').classList.add('show');
}
function setupTouch() {
  const layer = document.getElementById('touch');
  const stickZone = document.getElementById('stickZone');
  const lookZone = document.getElementById('lookZone');
  const base = document.getElementById('stickBase');
  const knob = document.getElementById('stickKnob');
  const STICK_R = 58;
  document.body.classList.add('is-touch');
  cam.dist = 8.2;                      // 小さい画面では少し引く
  // タイトル画面では邪魔になるので、旅を始めてから表示する
  layer.classList.remove('show');

  // --- 仮想スティック(触れた場所に出現) ---
  const stickSet = (t) => {
    const dx = t.clientX - touch.stick.ox;
    const dy = t.clientY - touch.stick.oy;
    const d = Math.hypot(dx, dy);
    const k = d > STICK_R ? STICK_R / d : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const mag = Math.min(1, d / STICK_R);
    touch.stick.mag = mag < 0.12 ? 0 : mag;
    if (touch.stick.mag === 0) { touch.stick.x = touch.stick.z = 0; return; }
    touch.stick.x = (dx / Math.max(d, 1)) * mag;
    touch.stick.z = (dy / Math.max(d, 1)) * mag;
  };
  stickZone.addEventListener('touchstart', e => {
    if (touch.stick.id !== null) return;
    const t = e.changedTouches[0];
    touch.stick.id = t.identifier;
    touch.stick.ox = t.clientX; touch.stick.oy = t.clientY;
    base.style.left = `${t.clientX}px`;
    base.style.top = `${t.clientY - stickZone.getBoundingClientRect().top}px`;
    base.classList.add('show');
    knob.style.transform = 'translate(0,0)';
    e.preventDefault();
  }, { passive: false });
  const stickEnd = () => {
    touch.stick.id = null;
    touch.stick.mag = touch.stick.x = touch.stick.z = 0;
    base.classList.remove('show');
  };

  // --- 視点ドラッグ(右側 or スティック以外) ---
  lookZone.addEventListener('touchstart', e => {
    // 会話・ナレーション中はタップで送る
    if (dialogState.active) { advanceDialog(); e.preventDefault(); return; }
    if (narrationState.active) { if (narrationState.ready) nextNarration(); e.preventDefault(); return; }
    if (touch.look.id !== null) return;
    const t = e.changedTouches[0];
    touch.look.id = t.identifier;
    touch.look.lx = t.clientX; touch.look.ly = t.clientY;
    e.preventDefault();
  }, { passive: false });

  addEventListener('touchmove', e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stick.id) stickSet(t);
      else if (t.identifier === touch.look.id) {
        cam.yaw -= (t.clientX - touch.look.lx) * 0.006;
        cam.pitch = clamp(cam.pitch + (t.clientY - touch.look.ly) * 0.005, -0.5, 1.25);
        touch.look.lx = t.clientX; touch.look.ly = t.clientY;
      }
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.stick.id) stickEnd();
      if (t.identifier === touch.look.id) touch.look.id = null;
    }
  };
  addEventListener('touchend', endTouch);
  addEventListener('touchcancel', endTouch);

  // --- アクションボタン ---
  const bind = (id, onDown, onUp) => {
    const el = document.getElementById(id);
    const down = e => {
      e.preventDefault(); e.stopPropagation();
      el.classList.add('on');
      audioResume();
      onDown();
    };
    const up = e => {
      e.preventDefault(); e.stopPropagation();
      el.classList.remove('on');
      if (onUp) onUp();
    };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
    el.addEventListener('mousedown', down);
    el.addEventListener('mouseup', up);
  };
  bind('tbAttack', () => tryAttack());
  bind('tbRoll', () => tryRoll());
  bind('tbJump', () => { keys['Space'] = true; }, () => { keys['Space'] = false; });
  bind('tbInteract', () => tryInteract());
  bind('tbWeapon', () => cycleWeapon());
}
function audioResume() { if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume(); }
if (IS_TOUCH) {
  setupTouch();
  const hint = document.querySelector('#title .hint');
  if (hint) hint.innerHTML = '左半分をなぞって移動／右側をドラッグで視点<br>右下のボタンで攻撃・回避・調べる';
  const next = document.querySelector('#dialog .next');
  if (next) next.textContent = '▼ タップで次へ';
  const skip = document.querySelector('#narration .skip');
  if (skip) skip.textContent = 'タップで進む';
}
addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  cam.yaw -= e.movementX * 0.0024;
  cam.pitch = clamp(cam.pitch + e.movementY * 0.0022, -0.5, 1.25);
});
addEventListener('wheel', e => {
  cam.dist = clamp(cam.dist + e.deltaY * 0.005, 3.2, 13);
});

// ------------------------------------------------------------
// UI 要素
// ------------------------------------------------------------
const ui = {
  hud: document.getElementById('hud'),
  hearts: document.getElementById('hearts'),
  staminaFill: document.getElementById('staminaFill'),
  stamina: document.getElementById('stamina'),
  objective: document.querySelector('#objective .text'),
  prompt: document.getElementById('prompt'),
  promptText: document.querySelector('#prompt span'),
  dialog: document.getElementById('dialog'),
  dialogName: document.querySelector('#dialog .name'),
  dialogBody: document.querySelector('#dialog .body'),
  notice: document.getElementById('notice'),
  sidequest: document.getElementById('sidequest'),
  sidequestText: document.querySelector('#sidequest .text'),
  weaponName: document.querySelector('#weapon .wname'),
  weaponMark: document.querySelector('#weapon .mark'),
  weaponAlt: document.querySelector('#weapon .walt'),
  vignette: document.getElementById('vignette'),
  bossbar: document.getElementById('bossbar'),
  bossName: document.querySelector('#bossbar .name'),
  bossFill: document.querySelector('#bossbar .fill'),
  narration: document.getElementById('narration'),
  narrationP: document.querySelector('#narration p'),
  title: document.getElementById('title'),
  gameover: document.getElementById('gameover'),
  loading: document.getElementById('loading'),
};

const HEART_SVG = (fill) => `<svg class="heart" viewBox="0 0 24 24"><path d="M12 21s-7.5-4.8-10-9.3C.4 8.4 2 4.5 5.7 4.1c2.2-.2 4.2 1 5.3 2.8h2c1.1-1.8 3.1-3 5.3-2.8 3.7.4 5.3 4.3 3.7 7.6C19.5 16.2 12 21 12 21z" fill="${fill}" stroke="rgba(0,0,0,.5)" stroke-width="1.2"/></svg>`;
function renderHearts() {
  const full = Math.floor(player.hp / 2), half = player.hp % 2;
  let html = '';
  for (let i = 0; i < player.maxHp / 2; i++) {
    if (i < full) html += HEART_SVG('#e8473f');
    else if (i === full && half) html += HEART_SVG('url(#half)') // simple: half = orange
      .replace('url(#half)', '#e8973f');
    else html += HEART_SVG('rgba(30,30,30,.7)');
  }
  ui.hearts.innerHTML = html;
}

let noticeTimer = null;
function showNotice(text, dur = 3.2) {
  ui.notice.textContent = text;
  ui.notice.classList.add('show');
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ui.notice.classList.remove('show'), dur * 1000);
}
function setObjective(text) {
  ui.objective.textContent = text;
}
function flashVignette(heal = false) {
  ui.vignette.classList.toggle('heal', heal);
  ui.vignette.style.opacity = '1';
  setTimeout(() => { ui.vignette.style.opacity = '0'; }, 450);
}

// ------------------------------------------------------------
// ダイアログ / ナレーション システム
// ------------------------------------------------------------
const dialogState = { active: false, lines: [], idx: 0, onEnd: null };
function startDialog(lines, onEnd) {
  dialogState.active = true;
  dialogState.lines = lines;
  dialogState.idx = 0;
  dialogState.onEnd = onEnd || null;
  showDialogLine();
  ui.dialog.classList.add('show');
}
function showDialogLine() {
  audio.dialogBlip();
  const l = dialogState.lines[dialogState.idx];
  ui.dialogName.textContent = l.name ? `― ${l.name} ―` : '';
  ui.dialogBody.textContent = l.text;
}
let interactBlockUntil = 0;
function advanceDialog() {
  dialogState.idx++;
  if (dialogState.idx >= dialogState.lines.length) {
    dialogState.active = false;
    ui.dialog.classList.remove('show');
    interactBlockUntil = performance.now() + 500; // 連打での再会話を防ぐ
    if (dialogState.onEnd) dialogState.onEnd();
  } else showDialogLine();
}

const narrationState = { active: false, paras: [], idx: 0, onEnd: null, ready: false };
function startNarration(paras, onEnd) {
  narrationState.active = true;
  narrationState.paras = paras;
  narrationState.idx = -1;
  narrationState.onEnd = onEnd || null;
  ui.narration.classList.add('show');
  document.exitPointerLock?.();
  nextNarration();
}
function nextNarration() {
  narrationState.idx++;
  if (narrationState.idx >= narrationState.paras.length) {
    narrationState.active = false;
    ui.narration.classList.remove('show');
    if (narrationState.onEnd) narrationState.onEnd();
    return;
  }
  const p = ui.narrationP;
  p.classList.remove('visible');
  narrationState.ready = false;
  setTimeout(() => {
    p.textContent = narrationState.paras[narrationState.idx];
    p.classList.add('visible');
    setTimeout(() => { narrationState.ready = true; }, 600);
  }, 350);
}
ui.narration.addEventListener('click', () => {
  if (narrationState.active && narrationState.ready) nextNarration();
});

// ------------------------------------------------------------
// インタラクション
// ------------------------------------------------------------
const interactables = []; // {pos, r, label, onUse, enabled:()=>bool}
function addInteract(pos, r, label, onUse, enabled = () => true) {
  interactables.push({ pos, r, label, onUse, enabled });
}

// ------------------------------------------------------------
// プレイヤー状態
// ------------------------------------------------------------
const player = {
  pos: hero.group.position,
  vel: V3(),
  yaw: 0,
  hp: 10, maxHp: 10,
  stamina: 100, staminaRegenDelay: 0, exhausted: false,
  onGround: true,
  attackT: 0, attackDur: 0.42, attackCombo: 0, hitT: -1,
  weapon: 'sword', weapons: { sword: true, spear: false, great: false },
  rollT: 0, rollDir: new THREE.Vector3(),
  invulnT: 0,
  speedSmooth: 0,
  animPhase: 0,
  dead: false,
};

function damagePlayer(amount, fromPos) {
  if (player.invulnT > 0 || player.dead || !game.started) return;
  player.hp = Math.max(0, player.hp - amount);
  player.invulnT = 1.0;
  audio.hurt();
  renderHearts();
  flashVignette(false);
  shake = 0.35;
  if (fromPos) {
    _v1.subVectors(player.pos, fromPos).setY(0).normalize().multiplyScalar(9);
    player.vel.x += _v1.x; player.vel.z += _v1.z; player.vel.y += 3;
  }
  if (player.hp <= 0) {
    player.dead = true;
    document.exitPointerLock?.();
    ui.gameover.classList.add('show');
  }
}
function healPlayer(amount) {
  audio.pickup();
  player.hp = Math.min(player.maxHp, player.hp + amount);
  renderHearts();
  flashVignette(true);
}
document.getElementById('respawnBtn').addEventListener('click', () => {
  player.hp = player.maxHp;
  player.dead = false;
  player.pos.set(SPAWN.x, terrainHeight(SPAWN.x, SPAWN.z), SPAWN.z);
  player.vel.set(0, 0, 0);
  renderHearts();
  ui.gameover.classList.remove('show');
  if (game.bossActive) {
    // ボスをリセット
    const b = enemies.find(e => e.type === 'boss' && !e.dead);
    if (b) { b.hp = b.maxHp; b.pos.copy(b.home); b.pos.y = terrainHeight(b.home.x, b.home.z); }
    game.bossActive = false;
    ui.bossbar.classList.remove('show');
  }
});

// ------------------------------------------------------------
// ストーリー / クエスト進行
// ------------------------------------------------------------
const game = {
  started: false,
  quest: 'intro',        // intro → meetNagi → shards → altar → boss → ending
  shards: { A: false, B: false, C: false },
  shardCount: 0,
  bossActive: false,
  bossDefeated: false,
  time: DAY_LENGTH * 0.66,  // 夕方前からスタート(黄金の光が続く)
  playTime: 0,
};

const MEMORIES = {
  A: ['【記憶の欠片 ― 一】\n\n…雨の音。誰かが私の手を引いて、森を駆けていた。\n「振り返ってはいけない」と、その人は言った。\n世界が影に呑まれた日。私は、何かを守れなかった。'],
  B: ['【記憶の欠片 ― 二】\n\n湖のほとり、銀の鎧を着た騎士団が並んでいた。\n私はその先頭で、誓いの剣を掲げていた。\n「光が絶えるとも、風は憶えている」――それが我らの言葉だった。'],
  C: ['【記憶の欠片 ― 三】\n\n丘の上の祭壇。私は最後の力で「影ノ獣」を封じた。\nだが封印は私の記憶を代償に求めた。\n名前も、誓いも、すべて風に解けて――そして百年が過ぎた。'],
};

const NAGI_FIRST = [
  { name: '???', text: 'おお……目を覚ましたか、旅の人。いや――その面影、まさか。' },
  { name: '長老ナギ', text: 'わしはナギ。この朽ちた草原で、風の声を聞いて生きてきた。お前さんは三日もの間、あの門の下で眠っておったのだ。' },
  { name: '長老ナギ', text: '何も憶えておらん、という顔じゃな。無理もない。この地は百年前、「影ノ獣」によって一度滅んだ。' },
  { name: '長老ナギ', text: 'だが近頃、封印が緩んでおる。夜ごと、影どもが草原に這い出してくるのよ。' },
  { name: '長老ナギ', text: 'お前さんの失った記憶……それは奪われたのではない。「預けられた」のだ。三つの祠に、光となってな。' },
  { name: '長老ナギ', text: '見えるか、あの光の柱が。森の祠、湖畔の祠、丘の祠。記憶の欠片を取り戻せば、自ずと道は開けよう。' },
  { name: '長老ナギ', text: '気をつけよ。祠は影どもに見張られておる。剣の使い方は……その手が憶えておるはずじゃ。' },
];
const NAGI_HINT = [
  { name: '長老ナギ', text: '祠の光を辿るのじゃ。剣を恐れるな、風がお前さんと共にある。' },
];
const NAGI_AFTER_SHARDS = [
  { name: '長老ナギ', text: '…そうか。思い出したのじゃな。封印の騎士、その最後の一人よ。' },
  { name: '長老ナギ', text: '北の祭壇で封印が破られかけておる。「影ノ獣」を今度こそ……頼んだぞ。風はお前さんを憶えていた。' },
];

function updateQuest(q) {
  game.quest = q;
  for (const b of Object.values(beams)) b.visible = false;
  switch (q) {
    case 'intro':
      setObjective('風の声を辿り、焚き火の老人に会う');
      beams.camp.visible = true;
      break;
    case 'shards':
      setObjective(`三つの祠で記憶の欠片を取り戻す(${game.shardCount} / 3)`);
      beams.A.visible = !game.shards.A;
      beams.B.visible = !game.shards.B;
      beams.C.visible = !game.shards.C;
      break;
    case 'return':
      setObjective('長老ナギのもとへ戻る');
      beams.camp.visible = true;
      break;
    case 'altar':
      setObjective('北の祭壇へ向かい、「影ノ獣」を討つ');
      beams.altar.visible = true;
      break;
    case 'boss':
      setObjective('「影ノ獣」を討伐せよ');
      break;
    case 'ending':
      setObjective('世界に朝が戻った');
      break;
  }
  saveGame();
}

// 記憶の欠片の設置
const shards = {
  A: makeShard(LOC.shrineA),
  B: makeShard(LOC.shrineB),
  C: makeShard(LOC.shrineC),
};
function collectShard(key) {
  if (game.shards[key]) return;
  game.shards[key] = true;
  game.shardCount++;
  audio.shard();
  const s = shards[key];
  spawnParticles(s.position, 40, 0x7fd8c8, 5, 1.2, 3);
  scene.remove(s);
  startNarration(MEMORIES[key], () => {
    if (game.shardCount >= 3) {
      showNotice('すべての記憶が戻った――\n長老ナギのもとへ');
      updateQuest('return');
    } else {
      showNotice(`記憶の欠片を取り戻した(${game.shardCount} / 3)`);
      updateQuest('shards');
    }
  });
}

addInteract(LOC.shrineA, 3.2, '記憶の欠片に触れる', () => collectShard('A'), () => game.quest === 'shards' && !game.shards.A);
addInteract(LOC.shrineB, 3.2, '記憶の欠片に触れる', () => collectShard('B'), () => game.quest === 'shards' && !game.shards.B);
addInteract(LOC.shrineC, 3.2, '記憶の欠片に触れる', () => collectShard('C'), () => game.quest === 'shards' && !game.shards.C);

addInteract(LOC.camp, 3.5, '話す', () => {
  if (game.quest === 'intro') {
    startDialog(NAGI_FIRST, () => {
      showNotice('クエスト:三つの祠を巡れ');
      updateQuest('shards');
    });
  } else if (game.quest === 'shards') {
    startDialog(NAGI_HINT);
  } else if (game.quest === 'return') {
    startDialog(NAGI_AFTER_SHARDS, () => {
      showNotice('最後のクエスト:影ノ獣の討伐');
      updateQuest('altar');
    });
  } else {
    startDialog([{ name: '長老ナギ', text: '行くがよい。風はいつでもお前さんの味方じゃ。' }]);
  }
}, () => !dialogState.active);

// ============================================================
//  サイドクエスト:狩人トキの依頼
// ============================================================
game.side = {
  hunt: 'none', huntKills: 0,           // 岩背獣 討伐
  chimes: 'none', chimeFound: {},       // 風鈴 収集
  summit: 'none',                       // 風見の頂
};
const HUNT_TARGET = 3;
const CHIME_TARGET = 3;

// ---- 狩人トキ ----
function buildToki() {
  const g = new THREE.Group();
  const cloak = new THREE.MeshStandardMaterial({ color: 0x3f5a3a, roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xdcb289, roughness: 1 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.62, 4, 10), cloak);
  body.position.y = 1.02; body.castShadow = true; g.add(body);
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.42, 9), cloak);
  hood.position.y = 1.72; hood.castShadow = true; g.add(hood);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10), skin);
  head.position.set(0, 1.62, 0.06); g.add(head);
  const braid = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.4, 3, 7), hair);
  braid.position.set(0, 1.4, -0.24); braid.rotation.x = 0.35; g.add(braid);
  // 弓
  const bow = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.035, 6, 14, Math.PI * 1.15),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 })
  );
  bow.position.set(-0.42, 1.05, -0.06);
  bow.rotation.set(0, Math.PI / 2, Math.PI / 2 - 0.2);
  bow.castShadow = true;
  g.add(bow);
  // 矢筒
  const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a4028, roughness: 1 }));
  quiver.position.set(0.2, 1.24, -0.26);
  quiver.rotation.x = 0.4;
  g.add(quiver);
  g.position.copy(LOC.toki);
  scene.add(g);
  return g;
}
const toki = buildToki();

// ---- 風鈴(世界に散らばる3つ) ----
function buildChime(loc, key) {
  const g = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 2.3, 7),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }));
  post.position.y = 1.15; post.castShadow = true; g.add(post);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }));
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.3, 2.24, 0); g.add(arm);
  const bell = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62),
    new THREE.MeshStandardMaterial({
      color: 0xdcc07a, metalness: 0.75, roughness: 0.3,
      emissive: 0x8a6a20, emissiveIntensity: 0.5, side: THREE.DoubleSide,
    }));
  bell.position.set(0.6, 2.1, 0); bell.castShadow = true; g.add(bell);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.42),
    new THREE.MeshStandardMaterial({ color: 0xe8e2d0, side: THREE.DoubleSide, roughness: 1 }));
  paper.position.set(0.6, 1.76, 0); g.add(paper);
  const light = new THREE.PointLight(0xffd88a, 3, 9);
  light.position.set(0.6, 2.1, 0); g.add(light);
  g.position.copy(loc);
  g.position.y = terrainHeight(loc.x, loc.z);
  scene.add(g);
  return { group: g, bell, paper, key };
}
const chimes = {
  1: buildChime(LOC.chime1, 1),
  2: buildChime(LOC.chime2, 2),
  3: buildChime(LOC.chime3, 3),
};
function chimeCount() { return Object.values(game.side.chimeFound).filter(Boolean).length; }
function collectChime(key) {
  if (game.side.chimeFound[key]) return;
  game.side.chimeFound[key] = true;
  const c = chimes[key];
  spawnParticles(c.group.position.clone().setY(c.group.position.y + 2.1), 24, 0xffd88a, 4, 1, 3);
  scene.remove(c.group);
  // 風鈴の澄んだ音
  [1568, 2093, 2637].forEach((f, i) => setTimeout(() => audio.blip(f, 0.9, 0.045, 'sine'), i * 90));
  const n = chimeCount();
  if (game.side.chimes === 'active' && n >= CHIME_TARGET) {
    game.side.chimes = 'ready';
    showNotice('三つの風鈴が揃った\nトキのもとへ', 3.5);
  } else {
    showNotice(`風鈴を見つけた(${n} / ${CHIME_TARGET})`, 2.6);
  }
  refreshSideQuestUI();
  saveGame();
}
for (const k of [1, 2, 3]) {
  addInteract(LOC[`chime${k}`], 3.4, '風鈴を手に取る',
    () => collectChime(k), () => !game.side.chimeFound[k] && !dialogState.active);
}

// ---- 風見の頂:石塚に刺さった大剣 ----
const summitCairn = (() => {
  const g = new THREE.Group();
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 1 });
  const baseY = terrainHeight(LOC.summit.x, LOC.summit.z);
  for (let i = 0; i < 7; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.7, 0.35), 0), rockMat);
    const a = (i / 7) * Math.PI * 2;
    const ox = Math.cos(a) * rand(1.1, 0.4), oz = Math.sin(a) * rand(1.1, 0.4);
    // 斜面でも浮かないよう、岩ごとに地面の高さを拾う
    const dy = terrainHeight(LOC.summit.x + ox, LOC.summit.z + oz) - baseY;
    r.position.set(ox, dy + 0.1 + i * 0.14, oz);
    r.rotation.set(rand(3), rand(3), rand(3));
    r.castShadow = r.receiveShadow = true;
    g.add(r);
  }
  // 突き立った大剣
  const sw = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.13, 1.7, 0.34),
    new THREE.MeshStandardMaterial({
      color: 0x9aa2a8, metalness: 0.7, roughness: 0.5,
      emissive: 0x2a3038, emissiveIntensity: 0.8,
    }));
  blade.position.y = 0.95;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.1, 0.16),
    new THREE.MeshStandardMaterial({ color: 0xa8862e, metalness: 0.6, roughness: 0.4 }));
  guard.position.y = 1.84;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.38, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2e20, roughness: 1 }));
  grip.position.y = 2.08;
  sw.add(blade, guard, grip);
  sw.rotation.z = 0.13;
  sw.position.y = 0.75;
  sw.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.add(sw);
  const light = new THREE.PointLight(0xaac8e8, 5, 14);
  light.position.y = 2.4;
  g.add(light);
  g.position.copy(LOC.summit);
  g.position.y = terrainHeight(LOC.summit.x, LOC.summit.z);
  scene.add(g);
  return { group: g, sword: sw, light };
})();
// 頂の周りの露岩(規模感)
{
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8d8678, roughness: 1 });
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const N = 22;
  const mesh = new THREE.InstancedMesh(geo, rockMat, N);
  mesh.castShadow = mesh.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V3(), pv = V3();
  for (let i = 0; i < N; i++) {
    const a = rand(Math.PI * 2), d = rand(46, 8);
    const x = LOC.summit.x + Math.cos(a) * d, z = LOC.summit.z + Math.sin(a) * d;
    const s0 = rand(3.2, 0.8);
    q.setFromEuler(new THREE.Euler(rand(Math.PI), rand(Math.PI), rand(Math.PI)));
    m.compose(pv.set(x, terrainHeight(x, z) + s0 * 0.15, z), q, sc.set(s0, s0 * rand(1.1, 0.6), s0));
    mesh.setMatrixAt(i, m);
    if (s0 > 1.6) colliders.push({ x, z, r: s0 * 0.8 });
  }
  scene.add(mesh);
}
addInteract(LOC.summit, 4.2, '大剣を引き抜く', () => {
  game.side.summit = 'done';
  scene.remove(summitCairn.group);
  spawnParticles(LOC.summit.clone().setY(terrainHeight(LOC.summit.x, LOC.summit.z) + 2), 45, 0xaac8e8, 6, 1.4, 3.5);
  shake = 0.45;
  grantWeapon('great');
  startNarration([
    '【風見の頂】\n\n石塚に突き立てられた大剣。\n刃は錆びていない――百年、この風に磨かれてきたのだ。',
    '柄を握った瞬間、遠い斉唱が聴こえた気がした。\n名もなき騎士たちが、ここに眠っている。',
  ], () => { refreshSideQuestUI(); saveGame(); });
}, () => game.side.summit === 'active' && !dialogState.active);

// ---- 討伐カウント ----
function onEnemyKilled(e) {
  if (game.side.hunt === 'active' && e.type === 'charger') {
    game.side.huntKills++;
    if (game.side.huntKills >= HUNT_TARGET) {
      game.side.hunt = 'ready';
      showNotice('岩背獣を退けた\nトキのもとへ', 3.2);
    } else {
      showNotice(`岩背獣 ${game.side.huntKills} / ${HUNT_TARGET}`, 2);
    }
    refreshSideQuestUI();
    saveGame();
  }
}

// ---- 依頼のUI ----
function activeSideQuest() {
  const sd = game.side;
  if (sd.hunt === 'active') return `岩背獣を退ける(${sd.huntKills} / ${HUNT_TARGET})`;
  if (sd.hunt === 'ready') return 'トキに岩背獣の件を報せる';
  if (sd.chimes === 'active') return `風鈴を探す(${chimeCount()} / ${CHIME_TARGET})`;
  if (sd.chimes === 'ready') return 'トキに風鈴のことを報せる';
  if (sd.summit === 'active') return '東の高峰「風見の頂」に登る';
  return null;
}
function refreshSideQuestUI() {
  const t = activeSideQuest();
  ui.sidequest.classList.toggle('show', !!t);
  if (t) ui.sidequestText.textContent = t;
  const showChimes = game.side.chimes === 'active';
  for (const k of [1, 2, 3]) {
    sideBeams[`chime${k}`].visible = showChimes && !game.side.chimeFound[k];
  }
  sideBeams.summit.visible = game.side.summit === 'active';
}

// ---- トキとの会話 ----
const TOKI_FIRST = [
  { name: '???', text: '……動くな。そこ、獣道だ。' },
  { name: '狩人トキ', text: '……人か。驚いた、この草原で生きた人間に会うのは半年ぶりだ。私はトキ。獣を追って北から来た。' },
  { name: '狩人トキ', text: 'ナギの爺さんのところに寄ったんだろう。なら話は早い。あんたが影を相手にするなら、こっちの厄介ごとも聞いてくれ。' },
];
function tokiDialog() {
  const sd = game.side;
  // --- 報告 ---
  if (sd.hunt === 'ready') {
    sd.hunt = 'done';
    startDialog([
      { name: '狩人トキ', text: '岩背獣を三頭……あんた、本当に人間か?' },
      { name: '狩人トキ', text: '約束のものだ。持っていけ――「風薙の槍」。私の師の得物だった。' },
      { name: '狩人トキ', text: '間合いが長い。突けば穂先が二度走る。影相手には、近づかれる前に決めるのが一番だ。' },
    ], () => { grantWeapon('spear'); refreshSideQuestUI(); saveGame(); });
    return;
  }
  if (sd.chimes === 'ready') {
    sd.chimes = 'done';
    startDialog([
      { name: '狩人トキ', text: '……全部、見つけてきたのか。' },
      { name: '狩人トキ', text: 'あれは風見の民が、行方知れずの身内を待つために吊るしたものだ。鳴るたび「まだ帰らない」と数えるための。' },
      { name: '狩人トキ', text: '礼を言う。……これを。獣の胆を煮詰めた薬だ。腹に入れておけば、少しは死ににくくなる。' },
    ], () => {
      player.maxHp += 4;
      player.hp = player.maxHp;
      renderHearts();
      flashVignette(true);
      showNotice('体力の上限が上がった', 3);
      refreshSideQuestUI();
      saveGame();
    });
    return;
  }
  // --- 受注 ---
  if (sd.hunt === 'none') {
    startDialog([...(sd.met ? [] : TOKI_FIRST), 
      { name: '狩人トキ', text: '岩背獣という獣がいる。背に岩を生やした猪だ。近ごろ影の気配に当てられて気が立っていてな、この辺りを走り回っている。' },
      { name: '狩人トキ', text: '三頭。それだけ減らしてくれれば、私の獲物場が戻る。……礼はする。悪くない得物を一本、預けよう。' },
      { name: '狩人トキ', text: '溜めてから真っ直ぐ突っ込んでくる。避けてから横を叩け。正面で受けるな、死ぬぞ。' },
    ], () => {
      sd.met = true;
      sd.hunt = 'active';
      showNotice('依頼:牙を折る\n岩背獣を3頭退ける', 3.5);
      refreshSideQuestUI();
      saveGame();
    });
    return;
  }
  if (sd.hunt === 'active') {
    startDialog([{ name: '狩人トキ', text: `あと ${HUNT_TARGET - sd.huntKills} 頭だ。正面で受けるなよ。` }]);
    return;
  }
  if (sd.chimes === 'none') {
    startDialog([
      { name: '狩人トキ', text: 'もう一つ、頼まれてくれるか。……これは私の私事だ。' },
      { name: '狩人トキ', text: 'この草原には、風鈴が三つ吊るされている。風見の民が遺したものだ。私は探しているが、獣を追いながらでは手が回らない。' },
      { name: '狩人トキ', text: '見つけたら、外して持ってきてくれ。……もう、鳴らし続ける必要はないんだ。' },
    ], () => {
      sd.chimes = 'active';
      showNotice('依頼:風鈴の在り処\n三つの風鈴を見つける', 3.5);
      refreshSideQuestUI();
      saveGame();
    });
    return;
  }
  if (sd.chimes === 'active') {
    startDialog([{ name: '狩人トキ', text: `風鈴は ${CHIME_TARGET - chimeCount()} つ残っている。風の音をよく聴け。人の手が入った場所にある。` }]);
    return;
  }
  if (sd.summit === 'none') {
    startDialog([
      { name: '狩人トキ', text: '最後に一つ。これは依頼じゃない、忠告だ。' },
      { name: '狩人トキ', text: '東の高峰――「風見の頂」に、石塚がある。百年前、影を食い止めて死んだ騎士たちの墓だ。' },
      { name: '狩人トキ', text: '頂には剣が一振り、突き立ったままだ。誰も抜けなかった。……あんたなら、抜けるかもしれん。' },
    ], () => {
      sd.summit = 'active';
      showNotice('依頼:風見の頂\n東の高峰に登る', 3.5);
      refreshSideQuestUI();
      saveGame();
    });
    return;
  }
  if (sd.summit === 'active') {
    startDialog([{ name: '狩人トキ', text: '東の高峰だ。登れば分かる。風がいちばん強い場所だからな。' }]);
    return;
  }
  startDialog([
    { name: '狩人トキ', text: '獲物場は戻った。風鈴も鳴り止んだ。……あんたのおかげだ。' },
    { name: '狩人トキ', text: '行け。私はここで、あんたが戻るのを待つ。それくらいはできる。' },
  ]);
}
addInteract(LOC.toki, 3.5, '話す', tokiDialog, () => !dialogState.active);

// ボス
let boss = null;
function checkBossTrigger() {
  if (game.quest !== 'altar' || game.bossActive || game.bossDefeated) return;
  if (player.pos.distanceTo(LOC.altar) < 28) {
    game.bossActive = true;
    boss = spawnEnemy('boss', LOC.altar.x, LOC.altar.z - 10);
    ui.bossName.textContent = '影 ノ 獣';
    ui.bossbar.classList.add('show');
    audio.roar();
    showNotice('封印が、破られた');
    shake = 0.8;
    spawnParticles(boss.pos.clone().add(new THREE.Vector3(0, 2, 0)), 80, 0x8a2aff, 8, 1.5, 4);
    updateQuest('boss');
  }
}
function onBossDefeated() {
  game.bossDefeated = true;
  game.bossActive = false;
  ui.bossbar.classList.remove('show');
  setTimeout(() => {
    startNarration([
      '影ノ獣は、風に解けるように消えていった。',
      '百年の長い夜が、終わる。\n地平の彼方から、忘れていた色の光が射しはじめた。',
      '記憶は戻った。誓いも、名前も。\nだが旅人はもう、過去のために剣を取るのではない。',
      'この草原に、また花が咲く。\n風はそのすべてを、静かに憶えていくだろう。',
      '― 風ノ残響 ―\n\n了',
    ], () => {
      updateQuest('ending');
      showNotice('― 完 ―\nこの世界はあなたのもの。自由に旅を続けよう', 6);
      game.time = DAY_LENGTH * 0.3; // 朝に
    });
  }, 1600);
}

// ------------------------------------------------------------
// 戦闘
// ------------------------------------------------------------
let shake = 0;
let hitStop = 0;

// ------------------------------------------------------------
// 武器
// ------------------------------------------------------------
const WEAPONS = {
  sword: {
    name: '旅人の剣', mark: '⚔', dmg: 1, range: 2.6, arc: 0.25,
    time: 0.42, windup: 0.28, stam: 0, knock: 6, arcScale: 1, pitch: 1, idle: [0, 0, 0],
    desc: '軽く、素早い。手が憶えている重さ。',
  },
  spear: {
    name: '風薙の槍', mark: '⟋', dmg: 1, range: 4.3, arc: 0.62,
    time: 0.5, windup: 0.34, stam: 6, knock: 8, arcScale: 1.5, pitch: 1.25, multi: 2,
    idle: [-0.3, 0, -0.16],
    desc: '間合いは長く、狙いは細い。突けば二度刺さる。',
  },
  great: {
    name: '古の大剣', mark: '⛨', dmg: 3, range: 3.2, arc: -0.15,
    time: 0.8, windup: 0.45, stam: 16, knock: 13, arcScale: 1.25, pitch: 0.55,
    idle: [-0.46, 0, -0.28],
    desc: '重い。振り抜けば、影ごと薙ぐ。',
  },
};
const WEAPON_ORDER = ['sword', 'spear', 'great'];
function setWeapon(key, silent = false) {
  if (!WEAPONS[key] || !player.weapons[key]) return;
  player.weapon = key;
  for (const k of WEAPON_ORDER) hero.weapons[k].visible = (k === key);
  const w = WEAPONS[key];
  ui.weaponName.textContent = w.name;
  ui.weaponMark.textContent = w.mark;
  // 所持している武器を小さく併記(切替できることが分かるように)
  const others = WEAPON_ORDER.filter(k => player.weapons[k] && k !== key);
  ui.weaponAlt.textContent = others.length ? `　/ ${others.map(k => WEAPONS[k].name).join(' / ')}` : '';
  if (!silent) { audio.blip(520 * w.pitch, 0.08, 0.05, 'triangle'); saveGame(); }
}
function cycleWeapon() {
  const owned = WEAPON_ORDER.filter(k => player.weapons[k]);
  if (owned.length < 2) { showNotice('まだ他の武器を持っていない', 1.4); return; }
  const i = owned.indexOf(player.weapon);
  setWeapon(owned[(i + 1) % owned.length]);
  showNotice(WEAPONS[player.weapon].name, 1.3);
}
function grantWeapon(key) {
  if (player.weapons[key]) return;
  player.weapons[key] = true;
  setWeapon(key, true);
  audio.shard();
  showNotice(`${WEAPONS[key].name} を手に入れた\n${WEAPONS[key].desc}`, 4.5);
  saveGame();
}
addEventListener('keydown', e => {
  if (!game.started || dialogState.active || narrationState.active) return;
  if (e.code === 'KeyQ') cycleWeapon();
  const n = { Digit1: 'sword', Digit2: 'spear', Digit3: 'great' }[e.code];
  if (n) {
    if (player.weapons[n]) { setWeapon(n); showNotice(WEAPONS[n].name, 1.3); }
    else showNotice('まだ持っていない武器だ', 1.4);
  }
});
function tryRoll() {
  if (player.rollT > 0 || player.attackT > 0 || player.dead || !player.onGround) return;
  if (dialogState.active || narrationState.active || !game.started) return;
  if (player.exhausted || player.stamina < 15) return;
  player.stamina -= 15;
  player.staminaRegenDelay = 0.8;
  player.rollT = 0.42;
  player.invulnT = Math.max(player.invulnT, 0.5);
  // 入力方向、なければ前方
  const { ix, iz } = readMoveInput();
  if (Math.hypot(ix, iz) > 0.15) {
    const len = Math.hypot(ix, iz);
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    player.rollDir.set((ix * cy + iz * sy) / len, 0, (-ix * sy + iz * cy) / len);
  } else {
    player.rollDir.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  }
  player.yaw = Math.atan2(player.rollDir.x, player.rollDir.z);
  audio.noiseBurst(0.12, 600, 0.07, 0.5);
}
function tryAttack() {
  if (player.attackT > 0 || player.dead || dialogState.active || narrationState.active) return;
  if (player.rollT > 0 || !game.started) return;
  const w = WEAPONS[player.weapon];
  if (w.stam > 0 && (player.exhausted || player.stamina < w.stam)) {
    audio.blip(150, 0.1, 0.04, 'square');
    return;
  }
  if (w.stam > 0) { player.stamina -= w.stam; player.staminaRegenDelay = 0.7; }
  player.attackT = w.time;
  player.attackDur = w.time;
  player.hitT = w.time * w.windup;
  player.attackCombo = (player.attackCombo + 1) % 2;
  audio.sword(w.pitch);
  // ダッシュ中は踏み込み斬り
  if ((keys['ShiftLeft'] || keys['ShiftRight'] || touch.stick.mag > 0.88) && !player.exhausted) {
    const lunge = player.weapon === 'great' ? 4 : 7;
    player.vel.x += Math.sin(player.yaw) * lunge;
    player.vel.z += Math.cos(player.yaw) * lunge;
  }
}
// 溜めの後に実際の判定を行う(武器ごとの間合い・薙ぎ角)
function doAttackHit() {
  const w = WEAPONS[player.weapon];
  _v2.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
  let hits = 0;
  for (const e of enemies) {
    if (e.dead) continue;
    _v1.subVectors(e.pos, player.pos).setY(0);
    if (_v1.length() > w.range + e.radius) continue;
    _v1.normalize();
    if (_v1.dot(_v2) < w.arc) continue;
    damageEnemy(e, w.dmg, w.knock);
    if (++hits >= (w.multi ?? 99)) break;
  }
  if (hits === 0) audio.noiseBurst(0.1, 900, 0.03, 0.6);
}
function damageEnemy(e, amount, knock = 6) {
  e.hp -= amount;
  e.hurtT = 0.25;
  hitStop = Math.max(hitStop, 0.06);
  audio.hit();
  shake = Math.max(shake, 0.15);
  _v1.copy(e.pos).y += 1;
  spawnParticles(_v1, 12, ENEMY_COLOR[e.type], 5, 0.5, 2.5);
  // ノックバック
  _v2.subVectors(e.pos, player.pos).setY(0).normalize()
    .multiplyScalar(e.type === 'boss' ? knock * 0.25 : knock);
  e.vel.add(_v2);
  if (e.type === 'boss') {
    ui.bossFill.style.width = `${Math.max(0, e.hp / e.maxHp) * 100}%`;
    if (!e.phase2 && e.hp <= e.maxHp * 0.5 && e.hp > 0) {
      e.phase2 = true;
      e.speed *= 1.45;
      audio.roar();
      shake = 0.7;
      showNotice('影ノ獣の眼が、紅く燃え上がる', 2.5);
      spawnParticles(_v1.copy(e.pos).add(new THREE.Vector3(0, 2.5, 0)), 50, 0xff3322, 9, 1.2, 4);
      for (const sgn of [-1, 1]) spawnEnemy('shade', e.pos.x + 6 * sgn, e.pos.z + 4);
    }
  }
  if (e.hp <= 0 && !e.dead) {
    e.dead = true;
    e.deathT = 0.8;
    hitStop = Math.max(hitStop, 0.11);
    audio.kill();
    _v1.copy(e.pos).y += 1;
    spawnParticles(_v1, 30, ENEMY_COLOR[e.type], 6, 1, 3);
    if (e.type !== 'boss' && Math.random() < 0.45) dropHeart(e.pos);
    onEnemyKilled(e);
    if (e.type === 'boss') onBossDefeated();
  }
}

addEventListener('mousedown', e => {
  if (!game.started) return;
  if (narrationState.active) return; // ナレーションはオーバーレイのクリックで進む
  if (dialogState.active) { advanceDialog(); return; }
  if (player.dead) return;
  if (!pointerLocked && !IS_TOUCH) {
    renderer.domElement.requestPointerLock?.();
    return;
  }
  if (e.button === 0) tryAttack();
  if (e.button === 2) tryRoll();
});
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => { if (e.code === 'KeyC') tryRoll(); });

function tryInteract() {
  if (!game.started || player.dead) return;
  if (dialogState.active) { advanceDialog(); return; }
  if (narrationState.active) { if (narrationState.ready) nextNarration(); return; }
  if (performance.now() < interactBlockUntil) return;
  for (const it of interactables) {
    if (!it.enabled()) continue;
    if (player.pos.distanceTo(it.pos) < it.r) { it.onUse(); break; }
  }
}
addEventListener('keydown', e => { if (e.code === 'KeyE') tryInteract(); });

// ------------------------------------------------------------
// 敵の更新
// ------------------------------------------------------------
function updateEnemies(dt, time) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const g = e.model.group;
    if (e.dead) {
      e.deathT -= dt;
      g.scale.setScalar(Math.max(0.01, e.deathT / 0.8));
      g.position.y += dt * 1.5;
      if (e.deathT <= 0) {
        scene.remove(g);
        enemies.splice(i, 1);
      }
      continue;
    }
    const distP = e.pos.distanceTo(player.pos);
    // 遠い敵は休眠
    if (distP > 160) { g.visible = distP < 220; continue; }
    g.visible = true;

    e.t += dt;
    e.attackCd -= dt;
    e.hurtT -= dt;

    const canSee = distP < e.aggro && !player.dead && game.started;
    if (canSee) e.state = 'chase';
    else if (e.state === 'chase' && distP > e.aggro * 1.6) e.state = 'idle';

    let mvx = 0, mvz = 0;
    if (e.state === 'chase') {
      _v1.subVectors(player.pos, e.pos).setY(0);
      const d = _v1.length();
      _v1.normalize();
      if (e.chargeT <= 0) e.yaw = Math.atan2(_v1.x, _v1.z);

      if (e.type === 'wisp') {
        // 一定の間合いを保ちながら火の玉を放つ
        const want = 11;
        const drift = d < want - 2 ? -1 : d > want + 3 ? 1 : 0;
        mvx = _v1.x * e.speed * drift;
        mvz = _v1.z * e.speed * drift;
        // 横滑り(狙いを絞らせない)
        mvx += -_v1.z * e.speed * 0.5 * Math.sin(e.t * 0.9);
        mvz += _v1.x * e.speed * 0.5 * Math.sin(e.t * 0.9);
        if (e.attackCd <= 0 && d < 26) {
          e.attackCd = e.cd;
          _v3.copy(player.pos).setY(player.pos.y + 1.1).sub(_v2.copy(e.pos).setY(e.pos.y + 1.5)).normalize();
          _v3.y += 0.12;
          spawnProjectile(_v2, _v3.normalize(), 15, e.dmg);
          audio.blip(340, 0.18, 0.05, 'sawtooth');
        }
      } else if (e.type === 'charger') {
        if (e.chargeT > 0) {
          // 突進中(方向固定・停止不能)
          e.chargeT -= dt;
          mvx = e.chargeDir.x * 17;
          mvz = e.chargeDir.z * 17;
          e.dustT = (e.dustT ?? 0) - dt;
          if (e.dustT <= 0) { e.dustT = 0.07; spawnParticles(e.pos, 2, 0xbfae90, 2.5, 0.5, 1.4); }
          if (d < 2.2 + e.radius && e.attackCd <= 0) {
            e.attackCd = e.cd;
            damagePlayer(e.dmg, e.pos);
            e.chargeT = 0;
          }
        } else if (e.windT > 0) {
          // 溜め(前脚で地を掻き、土煙を上げる)
          e.windT -= dt;
          e.dustT = (e.dustT ?? 0) - dt;
          if (e.dustT <= 0) {
            e.dustT = 0.09;
            _v3.copy(e.pos).addScaledVector(_v1, 1.2);
            spawnParticles(_v3, 3, 0xbfae90, 2.2, 0.45, 1.2);
          }
          if (e.windT <= 0) {
            e.chargeT = 1.1;
            e.chargeDir.copy(_v1);
            audio.noiseBurst(0.3, 260, 0.1, 0.4);
            spawnParticles(_v3.copy(e.pos), 12, 0xbfae90, 4, 0.7, 1.5);
          }
        } else if (d < 16 && e.attackCd <= 0) {
          e.windT = 0.7;
          audio.blip(90, 0.3, 0.07, 'sawtooth');
        } else if (d > 2.4) {
          mvx = _v1.x * e.speed; mvz = _v1.z * e.speed;
        }
      } else {
        const stop = e.type === 'boss' ? 3.4 : 1.5;
        if (d > stop) { mvx = _v1.x * e.speed; mvz = _v1.z * e.speed; }
        else if (e.attackCd <= 0) {
          e.attackCd = e.cd;
          damagePlayer(e.dmg, e.pos);
        }
      }
    } else {
      // うろうろ
      if (e.t > 4) { e.t = 0; e.yaw = rand(Math.PI * 2); }
      if (e.t < 1.6) {
        mvx = Math.sin(e.yaw) * e.speed * 0.3;
        mvz = Math.cos(e.yaw) * e.speed * 0.3;
      }
      // 帰巣
      _v1.set(e.home.x - e.pos.x, 0, e.home.z - e.pos.z);
      if (_v1.length() > 40) {
        _v1.normalize();
        mvx = _v1.x * e.speed * 0.4; mvz = _v1.z * e.speed * 0.4;
        e.yaw = Math.atan2(_v1.x, _v1.z);
      }
    }

    // 移動 + ノックバック減衰
    e.vel.x = lerp(e.vel.x, 0, dt * 6);
    e.vel.z = lerp(e.vel.z, 0, dt * 6);
    e.pos.x += (mvx + e.vel.x) * dt;
    e.pos.z += (mvz + e.vel.z) * dt;
    e.pos.y = terrainHeight(e.pos.x, e.pos.z);

    g.position.copy(e.pos);
    g.rotation.y = e.yaw;

    // 種類別アニメーション
    if (e.type === 'slime') {
      const hop = Math.abs(Math.sin(time * 5 + e.t * 3));
      g.position.y += hop * (e.state === 'chase' ? 0.6 : 0.2);
      const sq = 1 + Math.sin(time * 10 + e.t) * 0.08;
      g.scale.set(sq, 2 - sq, sq);
    } else if (e.type === 'shade') {
      g.position.y += Math.sin(time * 2 + e.t * 7) * 0.1 + 0.15;
      if (e.model.armR) e.model.armR.rotation.x = e.attackCd > 0.9 ? -2.2 : Math.sin(time * 3) * 0.2 - 0.3;
      if (e.model.armL) e.model.armL.rotation.x = Math.sin(time * 3 + 1) * 0.2 - 0.3;
    } else if (e.type === 'wisp') {
      g.position.y += 0.4 + Math.sin(time * 1.6 + e.t * 2) * 0.35;
      const pulse = 1 + Math.sin(time * 6 + e.t) * 0.12;
      e.model.core.scale.setScalar(pulse);
      e.model.halo.scale.setScalar(1 + Math.sin(time * 3 + e.t) * 0.14);
      e.model.core.rotation.y += dt * 1.6;
      e.model.core.rotation.x += dt * 0.9;
    } else if (e.type === 'charger') {
      const gait = time * (e.chargeT > 0 ? 18 : 7);
      e.model.legs.forEach((leg, k) => {
        leg.rotation.x = Math.sin(gait + (k % 2) * Math.PI) * (e.state === 'chase' ? 0.65 : 0.15);
      });
      if (e.windT > 0) {
        // 溜め中は身を低くして震える
        g.position.y -= 0.12;
        g.position.x += rand(0.05, -0.05);
        e.model.head.position.y = 0.78;
      } else {
        e.model.head.position.y = 0.92 + Math.sin(time * 3) * 0.04;
      }
    } else if (e.type === 'boss') {
      const gait = time * 7;
      e.model.legs.forEach((leg, k) => {
        leg.rotation.x = Math.sin(gait + (k % 2) * Math.PI) * (e.state === 'chase' ? 0.5 : 0.12);
      });
      e.model.head.position.y = 2.7 + Math.sin(time * 1.8) * 0.1;
    }
    // 被弾フラッシュ
    const flash = e.hurtT > 0;
    g.traverse(o => {
      if (o.isMesh && o.material.emissive !== undefined) {
        o.material.emissiveIntensity = flash ? 2.5 : (o.userData.baseEmissive ?? (o.userData.baseEmissive = o.material.emissiveIntensity));
      }
    });
  }
}

// ------------------------------------------------------------
// プレイヤー更新
// ------------------------------------------------------------
function updatePlayer(dt) {
  if (player.dead) return;
  const inCutscene = dialogState.active || narrationState.active || !game.started;

  // 入力ベクトル(カメラ基準)
  let ix = 0, iz = 0;
  if (!inCutscene) ({ ix, iz } = readMoveInput());
  const inMag = Math.min(1, Math.hypot(ix, iz));
  const moving = inMag > 0.15;
  const wantSprint = keys['ShiftLeft'] || keys['ShiftRight'] || touch.stick.mag > 0.88;

  // スタミナ
  const sprinting = moving && wantSprint && !player.exhausted && player.stamina > 0 && player.onGround;
  if (sprinting) {
    player.stamina -= 16 * dt;
    player.staminaRegenDelay = 0.8;
    if (player.stamina <= 0) { player.stamina = 0; player.exhausted = true; }
  } else {
    player.staminaRegenDelay -= dt;
    if (player.staminaRegenDelay <= 0) player.stamina = Math.min(100, player.stamina + 22 * dt);
    if (player.exhausted && player.stamina > 30) player.exhausted = false;
  }
  ui.staminaFill.style.width = `${player.stamina}%`;
  ui.staminaFill.style.background = player.exhausted
    ? 'linear-gradient(90deg,#d84a3a,#e8973f)' : 'linear-gradient(90deg,#7ddf6a,#b7e86a)';
  // 演出中はCSS側のフェードに任せる(インライン指定が優先されてしまうため)
  ui.stamina.style.opacity = inCutscene ? '' : ((player.stamina >= 99.5) ? '0' : '1');

  const speed = (sprinting ? 10.2 : 5.8) * (touch.stick.mag > 0 ? Math.max(0.35, inMag) : 1);
  let mx = 0, mz = 0;
  if (moving) {
    const len = Math.hypot(ix, iz);
    ix /= len; iz /= len;
    const sy = Math.sin(cam.yaw), cy = Math.cos(cam.yaw);
    mx = (ix * cy + iz * sy) * speed;
    mz = (-ix * sy + iz * cy) * speed;
    const targetYaw = Math.atan2(mx, mz);
    let dy = targetYaw - player.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    player.yaw += dy * Math.min(1, dt * 12);
  }

  // 攻撃中は減速
  if (player.attackT > 0) { mx *= 0.25; mz *= 0.25; }

  // 回避ロール
  if (player.rollT > 0) {
    player.rollT = Math.max(0, player.rollT - dt);
    const rollSpeed = 13 * smoothstep(0, 0.12, player.rollT);
    mx = player.rollDir.x * rollSpeed;
    mz = player.rollDir.z * rollSpeed;
    hero.group.rotation.x = (1 - player.rollT / 0.42) * Math.PI * 2;
    if (player.rollT <= 0) hero.group.rotation.x = 0;
  } else hero.group.rotation.x = 0;

  // 重力 / ジャンプ
  player.vel.y -= 30 * dt;
  if (keys['Space'] && player.onGround && !inCutscene) {
    player.vel.y = 10.5;
    player.onGround = false;
  }

  // ノックバック減衰
  player.vel.x = lerp(player.vel.x, 0, dt * 7);
  player.vel.z = lerp(player.vel.z, 0, dt * 7);

  player.pos.x += (mx + player.vel.x) * dt;
  player.pos.z += (mz + player.vel.z) * dt;
  player.pos.y += player.vel.y * dt;

  // 地面
  const gh = terrainHeight(player.pos.x, player.pos.z);
  if (player.pos.y <= gh) {
    player.pos.y = gh;
    player.vel.y = 0;
    player.onGround = true;
  } else player.onGround = false;

  // コライダー押し出し
  for (const c of colliders) {
    const dx = player.pos.x - c.x, dz = player.pos.z - c.z;
    const d2 = dx * dx + dz * dz;
    const minD = c.r + 0.45;
    if (d2 < minD * minD && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      player.pos.x = c.x + dx / d * minD;
      player.pos.z = c.z + dz / d * minD;
    }
  }

  // 世界の果て
  const dC = Math.hypot(player.pos.x, player.pos.z);
  if (dC > WORLD_EDGE) {
    player.pos.x *= WORLD_EDGE / dC;
    player.pos.z *= WORLD_EDGE / dC;
    showNotice('風が行く手を阻んでいる', 1.6);
  }

  // 水
  if (player.pos.y < WATER_LEVEL + 0.2) {
    player.pos.y = Math.max(player.pos.y, WATER_LEVEL - 0.4);
  }

  hero.group.rotation.y = player.yaw;

  // ----- アニメーション -----
  const spd = Math.hypot(mx, mz);
  player.speedSmooth = lerp(player.speedSmooth, spd, dt * 8);
  player.animPhase += dt * (4 + player.speedSmooth * 1.6);
  const w = clamp(player.speedSmooth / 6, 0, 1.6);
  const ph = player.animPhase;

  hero.legL.rotation.x = Math.sin(ph) * 0.8 * w;
  hero.legR.rotation.x = Math.sin(ph + Math.PI) * 0.8 * w;
  hero.armL.rotation.x = Math.sin(ph + Math.PI) * 0.6 * w;
  if (player.attackT <= 0) {
    hero.armR.rotation.x = Math.sin(ph) * 0.6 * w;
    hero.armR.rotation.z = 0;
    // 待機中は武器ごとの構え(長柄は肩に預けて体を貫かないように)
    const idle = WEAPONS[player.weapon].idle;
    hero.mount.rotation.set(Math.PI + idle[0], idle[1], idle[2]);
    slashArc.material.opacity = Math.max(0, slashArc.material.opacity - dt * 6);
  } else {
    // 攻撃モーション(武器ごとに溜め・振り抜きの長さが変わる)
    player.attackT = Math.max(0, player.attackT - dt);
    if (player.hitT > 0) {
      player.hitT -= dt;
      if (player.hitT <= 0) doAttackHit();
    }
    const wp = WEAPONS[player.weapon];
    hero.mount.rotation.set(Math.PI, 0, 0);   // 振る間は素直に握り直す
    const t = 1 - player.attackT / player.attackDur;
    const dir = player.attackCombo === 0 ? 1 : -1;
    const wind = wp.windup;
    if (player.weapon === 'spear') {
      // 突き:腕を引いてから真っ直ぐ伸ばす
      const s = t < wind ? -(t / wind) * 0.5 : Math.min(1, (t - wind) / (1 - wind) * 1.8);
      hero.armR.rotation.x = lerp(0, -1.5, Math.max(s, 0)) + Math.min(s, 0) * 0.8;
      hero.armR.rotation.z = 0;
      slashArc.material.opacity = Math.max(0, (s > 0 ? 0.4 : 0) - s * 0.5);
      slashArc.rotation.z = 0;
    } else if (t < wind) {
      // 振りかぶり
      const k = t / wind;
      hero.armR.rotation.x = lerp(0, -2.6, k);
      hero.armR.rotation.z = lerp(0, -0.6 * dir, k);
    } else {
      // 振り抜き
      const s = (t - wind) / (1 - wind);
      hero.armR.rotation.x = lerp(-2.6, 0.8, Math.min(1, s * 1.6));
      hero.armR.rotation.z = lerp(-0.6 * dir, 0.8 * dir, Math.min(1, s * 1.6));
      slashArc.material.opacity = Math.max(0, 0.6 - s * 0.85);
      slashArc.rotation.z = -s * 2.4 * dir;
    }
    slashArc.scale.setScalar(wp.arcScale);
  }
  // アイドル呼吸
  if (w < 0.05 && player.attackT <= 0) {
    hero.group.children[0].position.y = 1.05 + Math.sin(performance.now() * 0.0018) * 0.012;
  }
  // 無敵点滅
  player.invulnT -= dt;
  hero.group.visible = player.invulnT > 0 ? (Math.floor(performance.now() / 80) % 2 === 0) : true;
}

// ------------------------------------------------------------
// カメラ更新
// ------------------------------------------------------------
let titleCamT = 0;
function updateCamera(dt) {
  // タイトル画面: 主人公の周りをゆっくり旋回
  if (!game.started) {
    titleCamT += dt;
    const a = titleCamT * 0.06 + Math.PI * 0.8;
    _v1.set(player.pos.x, player.pos.y + 1.4, player.pos.z);
    _v2.set(
      _v1.x + Math.sin(a) * 8.5,
      _v1.y + 1.6,
      _v1.z + Math.cos(a) * 8.5
    );
    const gh0 = terrainHeight(_v2.x, _v2.z) + 0.6;
    if (_v2.y < gh0) _v2.y = gh0;
    camera.position.lerp(_v2, 1 - Math.pow(0.001, dt));
    camera.lookAt(_v1);
    return;
  }
  // 会話中はシネマカメラ(話し相手とプレイヤーを横から収める)
  if (dialogState.active) {
    const speaker = player.pos.distanceTo(toki.position) < player.pos.distanceTo(npc.position) ? toki : npc;
    _v1.addVectors(speaker.position, player.pos).multiplyScalar(0.5);
    _v1.y += 1.5;
    _v2.subVectors(speaker.position, player.pos);
    const len = Math.max(_v2.length(), 2);
    _v2.normalize();
    _v3.set(-_v2.z, 0, _v2.x).multiplyScalar(len * 1.4 + 2.5).add(_v1);
    _v3.y += 0.7;
    const gh = terrainHeight(_v3.x, _v3.z) + 0.6;
    if (_v3.y < gh) _v3.y = gh;
    camera.position.lerp(_v3, 1 - Math.pow(0.001, dt));
    camera.lookAt(_v1);
    return;
  }
  _v1.set(player.pos.x, player.pos.y + 1.55, player.pos.z);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  _v2.set(
    _v1.x - Math.sin(cam.yaw) * cp * cam.dist,
    _v1.y + sp * cam.dist,
    _v1.z - Math.cos(cam.yaw) * cp * cam.dist
  );
  // 地形にめり込まない
  const gh = terrainHeight(_v2.x, _v2.z) + 0.5;
  if (_v2.y < gh) _v2.y = gh;
  camera.position.lerp(_v2, 1 - Math.pow(0.0001, dt));
  // 画面シェイク
  if (shake > 0) {
    shake = Math.max(0, shake - dt * 1.8);
    camera.position.x += rand(shake, -shake) * 0.4;
    camera.position.y += rand(shake, -shake) * 0.4;
  }
  camera.lookAt(_v1);
}

// ------------------------------------------------------------
// 昼夜サイクル
// ------------------------------------------------------------
const sunDir = V3();
function updateDayNight(dt) {
  // 夜は時の流れを速める(暗い時間を短縮)
  const nightNow = skyUniforms.uNight.value;
  game.time = (game.time + dt * (nightNow > 0.5 ? 2.4 : 1)) % DAY_LENGTH;
  const dayT = game.time / DAY_LENGTH;          // 0..1(0=深夜)
  const ang = (dayT - 0.25) * Math.PI * 2;       // 0.25で日の出
  sunDir.set(Math.cos(ang) * 0.6, Math.sin(ang), Math.cos(ang) * 0.45 + 0.3).normalize();
  skyUniforms.uSunDir.value.copy(sunDir);

  const sunH = sunDir.y;
  const dayF = smoothstep(-0.06, 0.25, sunH);
  const duskF = smoothstep(0.35, 0.04, Math.abs(sunH)) * smoothstep(-0.18, 0.0, sunH);
  const nightF = 1 - smoothstep(-0.18, 0.0, sunH);
  skyUniforms.uNight.value = nightF;

  // 太陽光
  sun.position.copy(player.pos).addScaledVector(sunDir, 180);
  sun.target.position.copy(player.pos);
  sun.intensity = lerp(0.02, 2.6, dayF);
  const cDay = _c1.setHex(0xfff2dd), cDusk = _c2.setHex(0xff9a4a);
  sun.color.copy(cDay).lerp(cDusk, duskF);

  // 環境光
  hemi.intensity = lerp(0.12, 0.85, dayF) + duskF * 0.12;
  hemi.color.setHex(0xbcd8e8).lerp(_c2.setHex(0xffc890), duskF);
  hemi.groundColor.setHex(0x6e7d5a);

  // 月光(夜の薄明かり)
  if (nightF > 0.5) {
    sun.intensity = 0.28;
    sun.color.setHex(0x6a82b8);
    sun.position.copy(player.pos).addScaledVector(sunDir, -180);
  }

  // フォグ / 背景色
  const fogDay = _c1.setHex(0xc8d8d0), fogDusk = _c2.setHex(0xe8b088), fogNight = _c3.setHex(0x0a1018);
  const fog = scene.fog.color;
  fog.copy(fogNight).lerp(fogDay, dayF).lerp(fogDusk, duskF * 0.7);
  grassUniforms.uFogColor.value.copy(fog);

  // 草の色温度
  grassUniforms.uSunCol.value.copy(sun.color).multiplyScalar(clamp(sun.intensity / 2.2, 0.05, 1.25));
  grassUniforms.uAmbCol.value.setRGB(
    lerp(0.06, 0.42, dayF) + duskF * 0.1,
    lerp(0.07, 0.5, dayF),
    lerp(0.12, 0.48, dayF)
  );
  renderer.toneMappingExposure = lerp(0.9, 1.08, dayF) + duskF * 0.12;
}
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();

// ------------------------------------------------------------
// 目標コンパス(方向矢印 + 距離)
// ------------------------------------------------------------
const obDirArrow = document.querySelector('#objective .dist .arrow');
const obDirM = document.querySelector('#objective .dist .m');
function questTarget() {
  switch (game.quest) {
    case 'intro': case 'return': return LOC.camp;
    case 'shards': {
      let best = null, bd = Infinity;
      for (const k of ['A', 'B', 'C']) {
        if (game.shards[k]) continue;
        const loc = k === 'A' ? LOC.shrineA : k === 'B' ? LOC.shrineB : LOC.shrineC;
        const d = player.pos.distanceTo(loc);
        if (d < bd) { bd = d; best = loc; }
      }
      return best;
    }
    case 'altar': case 'boss': return LOC.altar;
    default: return null;
  }
}
function updateCompass() {
  const t = questTarget();
  if (!t) { obDirArrow.style.display = 'none'; obDirM.textContent = ''; return; }
  obDirArrow.style.display = 'inline-block';
  const dx = t.x - player.pos.x, dz = t.z - player.pos.z;
  const dist = Math.hypot(dx, dz);
  // 画面上方向 = カメラ前方として相対角度を矢印に反映
  const worldAng = Math.atan2(dx, dz);
  const rel = worldAng - cam.yaw;
  obDirArrow.style.transform = `rotate(${(-rel * 180 / Math.PI - 90).toFixed(1)}deg)`;
  obDirM.textContent = `${Math.round(dist)} m`;
}

// ------------------------------------------------------------
// 鳥の群れ(昼の空を舞う)
// ------------------------------------------------------------
const birds = (() => {
  const flock = [];
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2c33, side: THREE.DoubleSide });
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Group();
    const wingGeo = new THREE.PlaneGeometry(0.9, 0.32);
    wingGeo.translate(0.45, 0, 0);
    const wL = new THREE.Mesh(wingGeo, mat);
    const wR = new THREE.Mesh(wingGeo, mat);
    wR.rotation.y = Math.PI;
    b.add(wL, wR);
    scene.add(b);
    flock.push({
      g: b, wL, wR,
      cx: rand(200, -200), cz: rand(200, -200),
      r: rand(70, 25), h: rand(75, 40),
      sp: rand(0.14, 0.06) * (Math.random() < 0.5 ? 1 : -1),
      ph: rand(10), flap: rand(8, 4),
    });
  }
  return flock;
})();
function updateBirds(time) {
  const day = skyUniforms.uNight.value < 0.4;
  for (const b of birds) {
    b.g.visible = day;
    if (!day) continue;
    const a = time * b.sp + b.ph;
    const x = b.cx + Math.cos(a) * b.r;
    const z = b.cz + Math.sin(a) * b.r;
    const y = Math.max(terrainHeight(x, z) + 22, b.h) + Math.sin(time * 0.7 + b.ph) * 3;
    b.g.position.set(x, y, z);
    b.g.rotation.y = -a - (b.sp > 0 ? 0 : Math.PI);
    const flap = Math.sin(time * b.flap + b.ph) * 0.65;
    b.wL.rotation.x = flap;
    b.wR.rotation.x = -flap;
  }
}

// ------------------------------------------------------------
// ホタル(夜の草原に灯る)
// ------------------------------------------------------------
const FIREFLY_N = LOW_SPEC ? 45 : 90;
const fireflies = (() => {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(FIREFLY_N * 3);
  const seeds = [];
  for (let i = 0; i < FIREFLY_N; i++) {
    seeds.push({ a: rand(Math.PI * 2), r: rand(45, 6), s: rand(1.5, 0.3), ph: rand(10) });
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xc8e86a, size: 0.16, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  return { geo, pos, seeds, mat, points };
})();
function updateFireflies(time) {
  const nightF = skyUniforms.uNight.value;
  const target = nightF > 0.4 ? 0.85 : 0;
  fireflies.mat.opacity = lerp(fireflies.mat.opacity, target, 0.02);
  fireflies.points.visible = fireflies.mat.opacity > 0.01;
  if (!fireflies.points.visible) return;
  for (let i = 0; i < FIREFLY_N; i++) {
    const f = fireflies.seeds[i];
    const a = f.a + time * 0.04 * f.s;
    const x = player.pos.x + Math.cos(a) * f.r + Math.sin(time * f.s + f.ph) * 3;
    const z = player.pos.z + Math.sin(a) * f.r + Math.cos(time * f.s * 0.8 + f.ph) * 3;
    const y = terrainHeight(x, z) + 0.8 + Math.sin(time * 1.3 * f.s + f.ph) * 0.6;
    fireflies.pos[i * 3] = x; fireflies.pos[i * 3 + 1] = y; fireflies.pos[i * 3 + 2] = z;
  }
  fireflies.geo.attributes.position.needsUpdate = true;
}

// ------------------------------------------------------------
// インタラクションプロンプト更新
// ------------------------------------------------------------
function updatePrompt() {
  ui.hud.classList.toggle('incutscene', dialogState.active || narrationState.active);
  if (dialogState.active || narrationState.active || player.dead || !game.started) {
    ui.prompt.classList.remove('show');
    return;
  }
  let found = null;
  for (const it of interactables) {
    if (!it.enabled()) continue;
    if (player.pos.distanceTo(it.pos) < it.r) { found = it; break; }
  }
  if (found) {
    ui.promptText.textContent = found.label;
    ui.prompt.classList.add('show');
  } else ui.prompt.classList.remove('show');
}

// ------------------------------------------------------------
// ピックアップ更新
// ------------------------------------------------------------
function updatePickups(dt, time) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.t += dt;
    p.mesh.rotation.y += dt * 2.5;
    p.mesh.position.y += Math.sin(time * 3 + p.t) * 0.003;
    if (p.mesh.position.distanceTo(player.pos) < 1.4) {
      healPlayer(2);
      spawnParticles(p.mesh.position, 14, 0xff7a8a, 3, 0.6, 3);
      scene.remove(p.mesh);
      pickups.splice(i, 1);
    } else if (p.t > 45) {
      scene.remove(p.mesh);
      pickups.splice(i, 1);
    }
  }
}

// ------------------------------------------------------------
// セーブ / ロード
// ------------------------------------------------------------
const SAVE_KEY = 'kaze_no_zankyo_save';
function saveGame() {
  if (!game.started) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      quest: game.quest === 'boss' ? 'altar' : game.quest,
      shards: game.shards,
      bossDefeated: game.bossDefeated,
      hp: player.hp,
      maxHp: player.maxHp,
      weapon: player.weapon,
      weapons: player.weapons,
      side: game.side,
      pos: [player.pos.x, player.pos.z],
      time: game.time,
    }));
  } catch (e) { /* プライベートモード等では保存しない */ }
}
function loadSaveData() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return null; }
}
let saveTimer = 0;

// ------------------------------------------------------------
// ゲーム開始フロー
// ------------------------------------------------------------
ui.loading.classList.add('hidden');

const contBtn = document.getElementById('contBtn');
// 本編が進んでいなくても、依頼・武器・強化のいずれかが進んでいれば続きから再開できる
function hasProgress(sv) {
  if (!sv) return false;
  if (sv.quest && sv.quest !== 'intro') return true;
  if (sv.bossDefeated) return true;
  if (sv.shards && Object.values(sv.shards).some(Boolean)) return true;
  if (sv.weapons && (sv.weapons.spear || sv.weapons.great)) return true;
  if (sv.maxHp && sv.maxHp > 10) return true;
  const sd = sv.side;
  if (sd && ['hunt', 'chimes', 'summit'].some(k => sd[k] && sd[k] !== 'none')) return true;
  return false;
}
if (hasProgress(loadSaveData())) contBtn.style.display = '';
contBtn.addEventListener('click', () => {
  const sv = loadSaveData();
  if (!sv) return;
  audio.init();
  ui.title.classList.add('hidden');
  game.shards = sv.shards || { A: false, B: false, C: false };
  game.shardCount = Object.values(game.shards).filter(Boolean).length;
  game.bossDefeated = !!sv.bossDefeated;
  game.time = sv.time ?? game.time;
  for (const k of ['A', 'B', 'C']) if (game.shards[k]) scene.remove(shards[k]);
  // 依頼・武器・強化の復元
  if (sv.side) {
    Object.assign(game.side, sv.side);
    game.side.chimeFound = sv.side.chimeFound || {};
    for (const k of [1, 2, 3]) if (game.side.chimeFound[k]) scene.remove(chimes[k].group);
    if (game.side.summit === 'done') scene.remove(summitCairn.group);
  }
  if (sv.weapons) Object.assign(player.weapons, sv.weapons);
  player.maxHp = sv.maxHp ?? player.maxHp;
  setWeapon(player.weapons[sv.weapon] ? sv.weapon : 'sword', true);
  refreshSideQuestUI();
  player.hp = clamp(sv.hp ?? 10, 1, player.maxHp);
  if (Array.isArray(sv.pos)) {
    player.pos.set(sv.pos[0], 0, sv.pos[1]);
    player.pos.y = terrainHeight(sv.pos[0], sv.pos[1]);
  }
  game.started = true;
  ui.hud.classList.add('show');
  showTouchUI();
  renderHearts();
  updateQuest(game.bossDefeated ? 'ending' : sv.quest);
  showNotice('旅の続きへ', 2.5);
  renderer.domElement.requestPointerLock?.();
});

document.getElementById('startBtn').addEventListener('click', () => {
  audio.init();
  ui.title.classList.add('hidden');
  startNarration([
    '百年前、世界は「影ノ獣」に呑まれた。',
    '光は絶え、王国は朽ち、人々の記憶から\nやがて「希望」という言葉が消えた。',
    'だが――風だけが、憶えていた。',
    'いま、名もなき草原で\nひとりの旅人が目を覚ます。',
  ], () => {
    game.started = true;
    ui.hud.classList.add('show');
    showTouchUI();
    renderHearts();
    setWeapon('sword', true);
    refreshSideQuestUI();
    updateQuest('intro');
    showNotice('草原で目を覚ました', 3);
    renderer.domElement.requestPointerLock?.();
  });
});

// ------------------------------------------------------------
// 自動品質調整(平均FPSが低ければ段階的に軽量化)
// ------------------------------------------------------------
const quality = { level: LOW_SPEC ? 1 : 0, accum: 0, frames: 0, timer: 0, real: 0 };
function applyQuality(level) {
  while (quality.level < level) {
    quality.level++;
    if (quality.level === 1) {
      bloomPass.enabled = false;
    } else if (quality.level === 2) {
      renderer.setPixelRatio(1);
      composer.setSize(innerWidth, innerHeight);
    } else if (quality.level === 3) {
      grassGeo.instanceCount = Math.floor(GRASS_COUNT / 2.5);
      sun.shadow.mapSize.set(1024, 1024);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    } else if (quality.level === 4) {
      grassGeo.instanceCount = Math.floor(GRASS_COUNT / 6);
      renderer.shadowMap.enabled = false;
      fireflies.points.visible = false;
    }
  }
}
function checkQuality(dtReal) {
  if (quality.level >= 4) return;
  quality.frames++; quality.real += dtReal;
  if (quality.real < 3) return;
  const avgFps = quality.frames / quality.real;
  quality.frames = quality.real = 0;
  if (avgFps >= 40) return;
  // 極端に重い環境では一気に下げる
  applyQuality(avgFps < 12 ? 4 : avgFps < 24 ? quality.level + 2 : quality.level + 1);
}

// ------------------------------------------------------------
// メインループ
// ------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;

function animate() {
  requestAnimationFrame(animate);
  const dtReal = Math.min(clock.getDelta(), 0.25);
  let dt = Math.min(dtReal, 0.05);
  if (hitStop > 0) { hitStop -= dt; dt *= 0.12; }   // ヒットストップ(手応え)
  elapsed += dt;
  if (game.started) game.playTime += dt;

  grassUniforms.uTime.value = elapsed;
  treeWind.value = elapsed;
  grassUniforms.uCenter.value.set(player.pos.x, player.pos.z);
  waterUniforms.uTime.value = elapsed;
  skyUniforms.uTime.value = elapsed;
  sky.position.copy(camera.position);

  updateDayNight(dt);
  updatePlayer(dt);
  updateCamera(dt);
  updateEnemies(dt, elapsed);
  updateParticles(dt);
  updateProjectiles(dt);
  updatePickups(dt, elapsed);
  updatePrompt();
  updateCompass();
  updateFireflies(elapsed);
  updateBirds(elapsed);
  checkBossTrigger();
  if (game.started) {
    checkQuality(dtReal);
    saveTimer += dt;
    if (saveTimer > 5) { saveTimer = 0; saveGame(); }
  }

  // NPCがプレイヤーの方を向く
  for (const person of [npc, toki]) {
    if (person && player.pos.distanceTo(person.position) < 12) {
      const targetYaw = Math.atan2(player.pos.x - person.position.x, player.pos.z - person.position.z);
      person.rotation.y = lerp(person.rotation.y, targetYaw, dt * 4);
    }
  }
  // 風鈴が風に揺れる
  for (const k of [1, 2, 3]) {
    const c = chimes[k];
    if (!c.group.parent) continue;
    const sway = Math.sin(elapsed * 1.7 + k) * 0.16 + Math.sin(elapsed * 4.3 + k) * 0.05;
    c.bell.rotation.z = sway;
    c.paper.rotation.z = sway * 1.5;
    c.paper.rotation.y = Math.sin(elapsed * 2.1 + k) * 0.5;
  }
  // 焚き火の揺らぎ
  const fire = npc.userData.fire;
  if (fire) fire.userData.light.intensity = 14 + Math.sin(elapsed * 9) * 3 + Math.sin(elapsed * 23) * 2;

  // 記憶の欠片の浮遊
  for (const k in shards) {
    if (!game.shards[k]) {
      shards[k].rotation.y += dt * 1.2;
      shards[k].children[0].position.y = Math.sin(elapsed * 1.8) * 0.18;
    }
  }
  // ビームの明滅
  for (const b of Object.values(beams)) {
    if (b.visible) b.material.opacity = 0.22 + Math.sin(elapsed * 2.2) * 0.08;
  }
  for (const b of Object.values(sideBeams)) {
    if (b.visible) b.material.opacity = 0.16 + Math.sin(elapsed * 1.6) * 0.06;
  }

  composer.render();
}
animate();

// 開発用フック(自動テスト・デバッグ)
window.__debug = {
  game, player, LOC, enemies, cam, touch, projectiles,
  collectShard, updateQuest, damageEnemy, spawnEnemy, setWeapon, grantWeapon,
  tokiDialog, collectChime, refreshSideQuestUI, WEAPONS,
  readMoveInput, quality, chimes, tryAttack, tryRoll, tryInteract, cycleWeapon,
  terrainHeight, SPAWN, camera, scene,
};
