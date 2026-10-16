<script setup>
import {computed, onMounted, onUnmounted, ref, watch} from 'vue';

/**
 * The weather, drawn behind the top of the page: rain, snow, fog, cloud and
 * the odd lightning flash. Two layers: a WebGL "sky" for fog and cloud (soft
 * drifting noise), and a 2D canvas for falling precipitation in three depth
 * layers, so near drops are longer, brighter and faster than far ones.
 *
 * Like Apple's Weather app, the nearer drops land on the cards: anything in
 * the hero marked data-rain-catch stops them at its top edge with a small
 * splash, while the far layer keeps falling behind.
 *
 * It stays smooth and cheap: the rain moves every display frame (60 or 120
 * Hz) with real elapsed time, the soft sky only redraws about 30 times a
 * second, both pause when the tab is hidden or the band is scrolled away, and with reduced motion only a still sky is
 * drawn (no particles, no flashes).
 */
const props = defineProps({
  conditionId: {type: Number, default: null},
  rainNow: {type: Number, default: 0}, // mm/h right now (Buienradar)
  windSpeed: {type: Number, default: 0}, // km/h
});

/* OpenWeather condition codes → what to draw. Intensities are 0–1. */
const effect = computed(() => {
  const id = Number(props.conditionId) || 0;
  const fx = {rain: 0, snow: 0, fog: 0, cloud: 0, lightning: false};

  if (id >= 200 && id < 300) Object.assign(fx, {rain: 0.9, cloud: 0.6, lightning: true});
  else if (id >= 300 && id < 400) Object.assign(fx, {rain: 0.25, cloud: 0.45});
  else if (id === 500) Object.assign(fx, {rain: 0.35, cloud: 0.45});
  else if (id === 501) Object.assign(fx, {rain: 0.6, cloud: 0.5});
  else if (id >= 502 && id <= 504) Object.assign(fx, {rain: 0.95, cloud: 0.6});
  else if (id >= 500 && id < 600) Object.assign(fx, {rain: 0.55, cloud: 0.5});
  else if (id >= 611 && id <= 616) Object.assign(fx, {rain: 0.35, snow: 0.4, cloud: 0.5});
  else if (id === 600) Object.assign(fx, {snow: 0.4, cloud: 0.45});
  else if (id === 602 || id === 622) Object.assign(fx, {snow: 1, cloud: 0.6});
  else if (id >= 600 && id < 700) Object.assign(fx, {snow: 0.7, cloud: 0.5});
  else if (id === 701 || id === 741) Object.assign(fx, {fog: 0.85});
  else if (id >= 700 && id < 800) Object.assign(fx, {fog: 0.5});
  else if (id === 801) fx.cloud = 0.2;
  else if (id === 802) fx.cloud = 0.35;
  else if (id === 803) fx.cloud = 0.5;
  else if (id === 804) fx.cloud = 0.65;

  // The radar knows better than the hourly code whether it is raining now.
  const mm = Number(props.rainNow) || 0;
  if (mm >= 0.1 && fx.snow === 0) {
    fx.rain = Math.max(fx.rain, Math.min(1, 0.25 + mm / 4));
    fx.cloud = Math.max(fx.cloud, 0.45);
  }
  // Drizzle hangs in the air as a faint mist; heavy rain falls in sheets.
  if (fx.rain > 0 && fx.rain < 0.35) fx.fog = Math.max(fx.fog, 0.22);
  if (fx.rain >= 0.8) fx.fog = Math.max(fx.fog, 0.3);
  return fx;
});

const box = ref(null);
const skyCanvas = ref(null);
const fallCanvas = ref(null);

let gl = null;
let program = null;
let uniforms = {};
let ctx2d = null;
let width = 0;
let height = 0;
let dpr = 1;
let raf = 0;
let last = 0;
let startedAt = 0;
let visible = true;
let onScreen = true;
let reduceMotion = false;
let resizeObserver = null;
let intersectionObserver = null;
let motionQuery = null;
let drops = [];
let flakes = [];
let flakeSprite = null;
let nextFlashAt = 0;
let obstacles = [];
let lastScan = -1;
let splashes = [];
const SPLASH_MAX = 260;

/* Where the cards are, relative to the canvas. Re-read twice a second:
   cheap, and it follows layout changes without observers on every card. */
function scanObstacles() {
  const root = box.value?.parentElement;
  if (!root || !box.value) return;
  const b = box.value.getBoundingClientRect();
  obstacles = [...root.querySelectorAll('[data-rain-catch]')]
    .map((el) => {
      const r = el.getBoundingClientRect();
      // Keep clear of the rounded corners.
      return {left: r.left - b.left + 6, right: r.right - b.left - 6, top: r.top - b.top};
    })
    .filter((o) => o.right - o.left > 12 && o.top > 0 && o.top < height);
}

function hitTop(x, fromY, toY) {
  for (const o of obstacles) {
    if (x >= o.left && x <= o.right && fromY < o.top && toY >= o.top) return o.top;
  }
  return null;
}

function splash(x, y, slant, strength) {
  const n = 2 + Math.floor(Math.random() * 3);
  for (let i = 0; i < n && splashes.length < SPLASH_MAX; i += 1) {
    splashes.push({
      x,
      y: y - 0.5,
      vx: (Math.random() - 0.5) * 110 + slant * 60,
      vy: -(45 + Math.random() * 80) * strength,
      life: 0,
      ttl: 0.22 + Math.random() * 0.2,
      r: 0.8 + Math.random() * 0.8,
    });
  }
}
let flashStart = -1;

const SKY_FRAME_S = 1 / 30;
let lastSky = -1;

/* ---------- Sky: WebGL fog and cloud ---------- */

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_fog;
uniform float u_cloud;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.y;
  float y = gl_FragCoord.y / u_res.y;

  // Fog: low, wide banks drifting slowly sideways.
  float t = u_time * 0.018;
  float f1 = fbm(uv * 1.4 + vec2(t, 0.0));
  float f2 = fbm(uv * 2.6 - vec2(t * 1.7, t * 0.2));
  float fog = smoothstep(0.30, 0.85, f1 * 0.7 + f2 * 0.45) * (0.55 + 0.45 * (1.0 - y));

  // Cloud: larger shapes, heavier toward the top of the band.
  float c1 = fbm(uv * 2.2 + vec2(t * 0.8, t * 0.15));
  float c2 = fbm(uv * 4.4 + vec2(t * 1.4, 0.0));
  float cloud = smoothstep(0.42, 0.88, c1 * 0.75 + c2 * 0.35) * smoothstep(0.05, 0.95, y);

  float a = clamp(fog * u_fog * 0.42 + cloud * u_cloud * 0.30, 0.0, 0.6);
  vec3 tint = mix(vec3(0.62, 0.66, 0.72), vec3(0.86, 0.88, 0.92), y);
  gl_FragColor = vec4(tint * a, a);
}
`;

function initSky() {
  const canvas = skyCanvas.value;
  if (!canvas) return;
  gl = canvas.getContext('webgl', {premultipliedAlpha: true, alpha: true, antialias: false});
  if (!gl) return;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Weather shader:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  };

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) {
    gl = null;
    return;
  }

  program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl = null;
    return;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  uniforms = {
    res: gl.getUniformLocation(program, 'u_res'),
    time: gl.getUniformLocation(program, 'u_time'),
    fog: gl.getUniformLocation(program, 'u_fog'),
    cloud: gl.getUniformLocation(program, 'u_cloud'),
  };
}

function drawSky(seconds) {
  if (!gl) return;
  const fx = effect.value;
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  if (fx.fog === 0 && fx.cloud === 0) return;
  gl.uniform2f(uniforms.res, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.uniform1f(uniforms.time, seconds);
  gl.uniform1f(uniforms.fog, fx.fog);
  gl.uniform1f(uniforms.cloud, fx.cloud);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/* ---------- Precipitation: 2D canvas ---------- */

const RAIN_LAYERS = [
  {share: 0.45, len: [8, 12], width: 0.7, alpha: 0.13, speed: 650},
  {share: 0.35, len: [15, 22], width: 1, alpha: 0.2, speed: 980},
  {share: 0.2, len: [26, 38], width: 1.4, alpha: 0.32, speed: 1350},
];

/* How rain looks at a given strength (0-1), so drizzle, rain and heavy
   rain read differently, not just as more or fewer of the same drop:
   drizzle is short, faint and slow, almost a mist; heavy rain is long,
   bright, fast streaks, with the near layer doing more of the work. */
const lerp = (a, b, t) => a + (b - a) * Math.max(0, Math.min(1, t));
function rainLook(i) {
  return {
    count: lerp(0.75, 1.25, i), // relative to the base count
    len: lerp(0.28, 1.6, (i - 0.2) / 0.8),
    speed: lerp(0.45, 1.4, (i - 0.2) / 0.8),
    alpha: lerp(0.75, 1.5, (i - 0.3) / 0.7),
    width: lerp(0.75, 1.35, (i - 0.3) / 0.7),
    nearShare: lerp(0.08, 0.3, i),
    splash: i < 0.35 ? 0 : lerp(0.35, 1, (i - 0.35) / 0.65),
  };
}
let look = rainLook(0.5);

function areaScale() {
  return (width * height) / (1440 * 460);
}

function seedDrops() {
  const i = effect.value.rain;
  look = rainLook(i);
  const count = i > 0 ? Math.round(420 * areaScale() * look.count) : 0;
  const near = look.nearShare;
  const shares = [0.55 - near / 2, 0.45 - near / 2, near];
  drops = [];
  RAIN_LAYERS.forEach((layer, layerIndex) => {
    const n = Math.round(count * shares[layerIndex]);
    for (let i = 0; i < n; i += 1) {
      drops.push({
        layer: layerIndex,
        x: Math.random() * width,
        y: Math.random() * height,
        len: (layer.len[0] + Math.random() * (layer.len[1] - layer.len[0])) * look.len,
        speed: layer.speed * look.speed * (0.85 + Math.random() * 0.3),
      });
    }
  });
}

function seedFlakes() {
  const count = Math.round(effect.value.snow * 260 * areaScale());
  flakes = Array.from({length: count}, () => {
    const z = Math.random();
    return {
      z,
      x: Math.random() * width,
      y: Math.random() * height,
      r: 0.8 + z * z * 3.2,
      speed: 22 + z * 60,
      sway: 6 + z * 16,
      phase: Math.random() * Math.PI * 2,
      freq: 0.4 + Math.random() * 0.5,
    };
  });
}

function makeFlakeSprite() {
  const size = 32;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function drawFall(dt, seconds) {
  if (!ctx2d) return;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx2d.clearRect(0, 0, width, height);

  // Wind leans the rain; never more than a gentle slant.
  const slant = Math.min(0.32, (Number(props.windSpeed) || 0) / 90);

  if (drops.length) {
    ctx2d.lineCap = 'round';
    RAIN_LAYERS.forEach((layer, layerIndex) => {
      ctx2d.beginPath();
      ctx2d.lineWidth = layer.width * look.width;
      ctx2d.strokeStyle = `rgba(205, 218, 238, ${Math.min(0.6, layer.alpha * look.alpha)})`;
      for (const d of drops) {
        if (d.layer !== layerIndex) continue;
        const fromY = d.y;
        d.y += d.speed * dt;
        d.x += d.speed * slant * dt;
        // Mid and near drops land on the cards; the far layer passes behind.
        const top = layerIndex > 0 && obstacles.length ? hitTop(d.x, fromY, d.y) : null;
        if (top !== null) {
          const chance = look.splash * (layerIndex === 2 ? 1 : 0.45);
          if (Math.random() < chance) splash(d.x, top, slant, look.splash * (layerIndex === 2 ? 1 : 0.7));
          d.y = -Math.random() * 60;
          d.x = Math.random() * (width + height * slant) - height * slant;
          continue;
        }
        if (d.y - d.len > height) {
          d.y = -Math.random() * 40;
          d.x = Math.random() * (width + height * slant) - height * slant;
        }
        ctx2d.moveTo(d.x, d.y);
        ctx2d.lineTo(d.x - d.len * slant, d.y - d.len);
      }
      ctx2d.stroke();
    });
  }

  // Splashes: tiny droplets thrown up and pulled back down.
  if (splashes.length) {
    ctx2d.fillStyle = 'rgb(215, 226, 244)';
    let keep = 0;
    for (const p of splashes) {
      p.life += dt;
      if (p.life >= p.ttl) continue;
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx2d.globalAlpha = 0.7 * (1 - p.life / p.ttl);
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx2d.fill();
      splashes[keep++] = p;
    }
    splashes.length = keep;
    ctx2d.globalAlpha = 1;
  }

  if (flakes.length) {
    for (const f of flakes) {
      const fromY = f.y;
      f.y += f.speed * dt;
      // Near flakes settle on the cards and vanish.
      if (f.z > 0.55 && obstacles.length && hitTop(f.x, fromY, f.y) !== null) {
        f.y = -f.r * 2 - Math.random() * 40;
        f.x = Math.random() * width;
        continue;
      }
      f.x += Math.sin(seconds * f.freq + f.phase) * f.sway * dt + f.speed * slant * 0.6 * dt;
      if (f.y - f.r > height) {
        f.y = -f.r * 2;
        f.x = Math.random() * width;
      }
      if (f.x > width + 10) f.x = -10;
      if (f.x < -10) f.x = width + 10;
      const size = f.r * 4;
      ctx2d.globalAlpha = 0.25 + f.z * 0.55;
      ctx2d.drawImage(flakeSprite, f.x - size / 2, f.y - size / 2, size, size);
    }
    ctx2d.globalAlpha = 1;
  }

  // Lightning: a soft, rare double flicker. Never with reduced motion.
  if (effect.value.lightning && !reduceMotion) {
    if (flashStart < 0 && seconds >= nextFlashAt) {
      flashStart = seconds;
      nextFlashAt = seconds + 8 + Math.random() * 10;
    }
    if (flashStart >= 0) {
      const t = seconds - flashStart;
      const a = t < 0.08 ? t / 0.08 : t < 0.18 ? 1 - (t - 0.08) / 0.1 : t < 0.26 ? (t - 0.18) / 0.08 * 0.6 : Math.max(0, 0.6 - (t - 0.26) / 0.5);
      if (t > 0.8) flashStart = -1;
      ctx2d.fillStyle = `rgba(205, 215, 255, ${0.09 * a})`;
      ctx2d.fillRect(0, 0, width, height);
    }
  }
}

/* ---------- Loop and lifecycle ---------- */

function resize() {
  const el = box.value;
  if (!el) return;
  width = el.clientWidth;
  height = el.clientHeight;
  // Thin moving streaks don't need retina pixels; this keeps the canvas
  // a quarter of the size on a 2x screen.
  dpr = 1;
  for (const canvas of [skyCanvas.value, fallCanvas.value]) {
    if (!canvas) continue;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
  }
  // The sky is soft; half resolution is indistinguishable and much cheaper.
  if (skyCanvas.value) {
    skyCanvas.value.width = Math.max(1, Math.round(width * 0.5));
    skyCanvas.value.height = Math.max(1, Math.round(height * 0.5));
  }
  reseed();
  if (reduceMotion) drawStill();
}

function reseed() {
  splashes = [];
  lastScan = -1;
  if (reduceMotion) {
    drops = [];
    flakes = [];
    return;
  }
  seedDrops();
  seedFlakes();
}

function drawStill() {
  drawSky(0);
  if (ctx2d) {
    ctx2d.setTransform(1, 0, 0, 1, 0, 0);
    ctx2d.clearRect(0, 0, fallCanvas.value.width, fallCanvas.value.height);
  }
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (!visible || !onScreen) {
    last = now;
    return;
  }
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const seconds = (now - startedAt) / 1000;
  if (seconds - lastScan > 0.5 || lastScan < 0) {
    scanObstacles();
    lastScan = seconds;
  }
  // The sky drifts slowly; redrawing it every other frame looks the same.
  if (seconds - lastSky >= SKY_FRAME_S || lastSky < 0) {
    drawSky(seconds);
    lastSky = seconds;
  }
  drawFall(dt, seconds);
}

function start() {
  cancelAnimationFrame(raf);
  if (reduceMotion) {
    drawStill();
    return;
  }
  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function onVisibility() {
  visible = document.visibilityState === 'visible';
}

function onMotionChange() {
  reduceMotion = Boolean(motionQuery?.matches);
  reseed();
  start();
}

onMounted(() => {
  motionQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)') || null;
  reduceMotion = Boolean(motionQuery?.matches);
  motionQuery?.addEventListener?.('change', onMotionChange);

  initSky();
  ctx2d = fallCanvas.value?.getContext('2d', {desynchronized: true}) || null;
  flakeSprite = makeFlakeSprite();
  startedAt = performance.now();
  nextFlashAt = 4 + Math.random() * 6;

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(box.value);
  intersectionObserver = new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
  });
  intersectionObserver.observe(box.value);
  document.addEventListener('visibilitychange', onVisibility);

  resize();
  start();
});

/* A change of weather fades out, swaps, and fades back in. */
const fading = ref(false);
let fadeTimer = null;
watch(effect, (next, prev) => {
  if (JSON.stringify(next) === JSON.stringify(prev)) return;
  if (reduceMotion) {
    reseed();
    drawStill();
    return;
  }
  clearTimeout(fadeTimer);
  fading.value = true;
  fadeTimer = setTimeout(() => {
    reseed();
    fading.value = false;
  }, 450);
}, {deep: true});

onUnmounted(() => {
  cancelAnimationFrame(raf);
  clearTimeout(fadeTimer);
  resizeObserver?.disconnect();
  intersectionObserver?.disconnect();
  document.removeEventListener('visibilitychange', onVisibility);
  motionQuery?.removeEventListener?.('change', onMotionChange);
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
});
</script>

<template>
  <div ref="box" class="weather-backdrop pointer-events-none absolute overflow-hidden" :class="{'is-fading': fading}" aria-hidden="true">
    <canvas ref="skyCanvas" class="absolute inset-0 h-full w-full"></canvas>
    <canvas ref="fallCanvas" class="absolute inset-0 h-full w-full"></canvas>
  </div>
</template>

<style scoped>
/* Full-bleed: the hero sits in a centred column, but the weather spans the
   whole window and runs up under the translucent header. The page clips
   the horizontal overflow (Dashboard root). Fades out at the bottom so the
   weather dissolves into the page. */
.weather-backdrop {
  top: -4rem;
  bottom: 0;
  left: 50%;
  width: 100vw;
  margin-left: -50vw;
  -webkit-mask-image: linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%);
  mask-image: linear-gradient(to bottom, #000 0%, #000 55%, transparent 100%);
  transition: opacity 450ms var(--ease);
}

.weather-backdrop.is-fading {
  opacity: 0;
}
</style>
