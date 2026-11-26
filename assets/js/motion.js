// Bewegung & Berührung: Parallax-Licht, Glaskugel, Karten-Tilt, Technik-Kugeln, Dock
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

let scrollY = window.scrollY;
let pointer = { x: innerWidth / 2, y: innerHeight / 2 };
const tickers = new Set();

function loop() {
  for (const fn of tickers) fn();
  requestAnimationFrame(loop);
}
if (!reduced) requestAnimationFrame(loop);
addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });

/* Lichtflecken und Kugeln im Hintergrund wandern mit Scroll + Zeiger */
export function initSky() {
  if (reduced) return;
  const layers = [...document.querySelectorAll('[data-depth]')].map(el => ({ el, d: +el.dataset.depth, x: 0, y: 0 }));
  const words = [...document.querySelectorAll('[data-parallax-x]')];
  tickers.add(() => {
    const nx = pointer.x / innerWidth - .5, ny = pointer.y / innerHeight - .5;
    for (const l of layers) {
      const tx = -nx * 40 * l.d, ty = -ny * 30 * l.d - scrollY * l.d * .25;
      l.x += (tx - l.x) * .06; l.y += (ty - l.y) * .06;
      l.el.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0)`;
    }
    for (const w of words) w.style.transform = `translate3d(${(-scrollY * .35).toFixed(1)}px, ${(scrollY * .12).toFixed(1)}px, 0)`;
  });
}

/* Lichtwelle, die von der Kugel ausgeht */
export function ripple(orb, { x, y, strong = false } = {}) {
  if (reduced) return;
  const host = orb.parentElement;
  const r = host.getBoundingClientRect(), o = orb.getBoundingClientRect();
  const ring = document.createElement('span');
  ring.className = 'ripple';
  ring.style.left = ((x ?? o.left + o.width / 2) - r.left) + 'px';
  ring.style.top = ((y ?? o.top + o.height / 2) - r.top) + 'px';
  if (!strong) ring.style.borderColor = 'rgba(255,255,255,.45)';
  host.appendChild(ring);
  setTimeout(() => ring.remove(), 1200);
}

/* Irisierende Glaskugel: Glanzpunkt folgt dem Zeiger, dreht sich, hüpft beim Antippen.
   opts.onTap ersetzt das Hüpfen (z. B. Metronom starten/stoppen). */
export function initOrb(orb, opts = {}) {
  if (!orb) return;
  let spin = 0, hue = 0, ox = 0, oy = 0, vx = 0, vy = 0, dragging = false, start = null, moved = false;

  const bounce = (e) => {
    if (opts.onTap) return opts.onTap(e);
    orb.classList.remove('bounce'); void orb.offsetWidth; orb.classList.add('bounce');
    hue = (hue + 40 + Math.random() * 80) % 360;
    orb.style.setProperty('--hue', hue + 'deg');
    ripple(orb, { x: e?.clientX, y: e?.clientY, strong: true });
  };

  orb.addEventListener('pointerdown', e => {
    if (!orb.hasAttribute('data-draggable')) return;
    dragging = true; moved = false; start = { x: e.clientX - ox, y: e.clientY - oy };
    orb.setPointerCapture(e.pointerId);
  });
  orb.addEventListener('pointermove', e => {
    if (!dragging) return;
    const nx = e.clientX - start.x, ny = e.clientY - start.y;
    if (Math.hypot(nx - ox, ny - oy) > 3) moved = true;
    vx = nx - ox; vy = ny - oy; ox = nx; oy = ny;
  });
  const release = e => {
    if (!dragging) return;
    dragging = false;
    if (!moved) bounce(e);
  };
  orb.addEventListener('pointerup', release);
  orb.addEventListener('pointercancel', release);
  orb.addEventListener('click', e => { if (!orb.hasAttribute('data-draggable')) bounce(e); });
  orb.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); bounce(); } });

  if (reduced) return;
  let t = 0;
  tickers.add(() => {
    if (!orb.isConnected || orb.offsetParent === null) return;
    t += 1;
    const r = orb.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const ang = Math.atan2(pointer.y - cy, pointer.x - cx);
    const dist = Math.min(1, Math.hypot(pointer.x - cx, pointer.y - cy) / 600);
    orb.style.setProperty('--hx', (50 + Math.cos(ang) * 22 * dist).toFixed(1) + '%');
    orb.style.setProperty('--hy', (50 + Math.sin(ang) * 22 * dist).toFixed(1) + '%');
    spin = t * (opts.spinSpeed ?? .25) + scrollY * .6;
    orb.style.setProperty('--spin', spin.toFixed(1) + 'deg');
    if (!dragging) {
      const pull = finePointer ? (opts.pull ?? .025) : 0;
      const tx = (pointer.x - cx + ox) * pull, ty = (pointer.y - cy + oy) * pull;
      vx += (tx - ox) * .08; vy += (ty - oy) * .08;
      vx *= .82; vy *= .82; ox += vx; oy += vy;
    }
    orb.style.transform = `translate3d(${ox.toFixed(1)}px, ${oy.toFixed(1)}px, 0)`;
  });
  return { setSpinSpeed(v) { opts.spinSpeed = v; } };
}

/* Karten neigen sich zum Zeiger, Lichtreflex folgt */
export function initTilt(root) {
  if (reduced || !finePointer) return;
  root.addEventListener('pointermove', e => {
    const card = e.target.closest('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
    card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    card.style.setProperty('--rx', ((.5 - py) * 7).toFixed(2) + 'deg');
    card.style.setProperty('--ry', ((px - .5) * 9).toFixed(2) + 'deg');
  });
  root.addEventListener('pointerout', e => {
    const card = e.target.closest('.card');
    if (card && !card.contains(e.relatedTarget)) { card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); }
  });
}

/* Karten sanft einblenden, sobald sie sichtbar werden */
const io = 'IntersectionObserver' in window && !reduced
  ? new IntersectionObserver(entries => {
      let i = 0;
      for (const en of entries) if (en.isIntersecting) {
        en.target.style.setProperty('--delay', (i++ * 45) + 'ms');
        en.target.classList.add('enter');
        io.unobserve(en.target);
      }
    }, { rootMargin: '0px 0px -40px 0px' })
  : null;
export function reveal(nodes) { if (io) nodes.forEach(n => io.observe(n)); }

/* Technik-Kugeln: Größe nach Häufigkeit, kollisionsfrei verteilt, weichen dem Zeiger aus */
export function layoutBubbles(box, items, { onPick, active }) {
  box.innerHTML = '';
  const W = box.clientWidth || 600, H = Math.max(box.clientHeight, 300);
  const max = Math.max(...items.map(i => i.count), 1);
  const base = Math.min(W * .95, H * 1.5);
  const placed = [];
  const order = items.map((it, idx) => ({ it, idx })).sort((a, b) => b.it.count - a.it.count);
  let k = 1;
  const fits = () => { // Größe so lange verkleinern, bis alle Kugeln Platz finden
    placed.length = 0;
    return order.every(({ it, idx }) => {
      const s = Math.round(base * k * (.15 + .13 * (it.count / max)));
      let a = idx * 2.4, rad = 0;
      for (let tries = 0; tries < 900; tries++) {
        const x = W / 2 + Math.cos(a) * rad - s / 2, y = H / 2 + Math.sin(a) * rad * .62 - s / 2;
        a += .55; rad += 2.4;
        if (x < 0 || y < 0 || x + s > W || y + s > H) continue;
        if (placed.some(p => Math.hypot(p.x + p.s / 2 - x - s / 2, p.y + p.s / 2 - y - s / 2) < (p.s + s) / 2 + 6)) continue;
        placed.push({ x, y, s, name: it.name });
        return true;
      }
      return false;
    });
  };
  while (!fits() && k > .4) k -= .06;
  const spot = name => placed.find(p => p.name === name) || { x: 0, y: 0, s: 60 };
  const els = items.map((it, idx) => {
    const { x, y, s } = spot(it.name);
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.name = it.name;
    b.className = 'bubble' + (active === it.name ? ' is-on' : '');
    b.style.cssText = `--s:${s}px; --c:${it.color}; left:${x}px; top:${y}px; --d:${(-idx * .9).toFixed(1)}s`;
    b.innerHTML = `<span class="bubble-label"><b>${it.count}</b>${String(it.label ?? it.name).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])).replace('/', '/<wbr>')}</span>`;
    b.setAttribute('aria-pressed', String(active === it.name));
    b.addEventListener('click', () => {
      b.classList.remove('boing'); void b.offsetWidth; b.classList.add('boing');
      onPick(it.name);
    });
    box.appendChild(b);
    return { b, x, y, s };
  });

  if (reduced || !finePointer) return;
  box.onpointermove = e => {
    const r = box.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    for (const o of els) {
      const cx = o.x + o.s / 2, cy = o.y + o.s / 2;
      const dx = cx - px, dy = cy - py, d = Math.hypot(dx, dy);
      const reach = o.s * .9;
      const f = d < reach && d > o.s * .5 ? (1 - d / reach) * 26 : 0; // nur am Rand schubsen
      o.b.style.setProperty('--tx', (dx / (d || 1) * f).toFixed(1) + 'px');
      o.b.style.setProperty('--ty', (dy / (d || 1) * f).toFixed(1) + 'px');
    }
  };
  box.onpointerleave = () => els.forEach(o => { o.b.style.setProperty('--tx', '0px'); o.b.style.setProperty('--ty', '0px'); });
}

/* Dock vergrößert Symbole nahe am Zeiger */
export function initDock(dock) {
  if (reduced || !finePointer) return;
  const items = () => [...dock.querySelectorAll('.dock-item:not([hidden])')];
  dock.addEventListener('pointermove', e => {
    for (const it of items()) {
      const r = it.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      it.style.setProperty('--scale', (1 + Math.max(0, 1 - d / 140) * .32).toFixed(3));
    }
  });
  dock.addEventListener('pointerleave', () => items().forEach(it => it.style.setProperty('--scale', '1')));
}

export function popIcon(el) {
  if (!el || reduced) return;
  el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
}
