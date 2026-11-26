// Glasklang · Metronom
// Genaues Timing über Web Audio (Vorausplanung) + Worker-Takt, damit es auch im Hintergrund-Tab weiterläuft.

export const METERS = {
  2: { label: '2/4', accents: [2, 0] },
  3: { label: '3/4', accents: [2, 0, 0] },
  4: { label: '4/4', accents: [2, 0, 0, 0] },
  5: { label: '5/4', accents: [2, 0, 0, 1, 0] },
  6: { label: '6/8', accents: [2, 0, 0, 1, 0, 0] },
  12: { label: '12/8', accents: [2, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0] }
};

export function tempoName(bpm) {
  if (bpm < 60) return 'Largo';
  if (bpm < 66) return 'Larghetto';
  if (bpm < 76) return 'Adagio';
  if (bpm < 108) return 'Andante';
  if (bpm < 120) return 'Moderato';
  if (bpm < 168) return 'Allegro';
  if (bpm < 200) return 'Presto';
  return 'Prestissimo';
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.12;

export function createMetronome({ onBeat, onState } = {}) {
  const cfg = { bpm: 96, meter: 4, sound: 'glas', volume: 0.7, accent: true };
  let ctx = null, master = null, worker = null;
  let running = false, nextTime = 0, beat = 0, raf = 0;
  const queue = [];

  const clampBpm = v => Math.min(260, Math.max(30, Math.round(+v || 96)));
  const levels = () => {
    const a = (METERS[cfg.meter] || METERS[4]).accents;
    return cfg.accent ? a : a.map(() => 0);
  };

  function ensureAudio() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = cfg.volume;
    master.connect(ctx.destination);
  }

  function voice(time, level) {
    if (!ctx || cfg.sound === 'stumm' || cfg.volume <= 0) return;
    const env = ctx.createGain();
    env.connect(master);
    const peak = level === 2 ? 1 : level === 1 ? 0.75 : 0.55;
    const tones = [];

    if (cfg.sound === 'glas') {
      const f = level === 2 ? 1568 : level === 1 ? 1319 : 1047;
      tones.push(['sine', f, 1], ['sine', f * 2.76, 0.25], ['sine', f * 5.4, 0.08]);
      env.gain.setValueAtTime(0.0001, time);
      env.gain.exponentialRampToValueAtTime(peak * 0.5, time + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.32);
    } else if (cfg.sound === 'holz') {
      const f = level === 2 ? 1180 : level === 1 ? 980 : 820;
      tones.push(['triangle', f, 1], ['sine', f * 1.5, 0.3]);
      env.gain.setValueAtTime(0.0001, time);
      env.gain.exponentialRampToValueAtTime(peak * 0.7, time + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.08);
    } else { // klick
      const f = level === 2 ? 2400 : level === 1 ? 1900 : 1600;
      tones.push(['square', f, 0.35]);
      env.gain.setValueAtTime(0.0001, time);
      env.gain.exponentialRampToValueAtTime(peak * 0.45, time + 0.001);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.03);
    }
    for (const [type, freq, amp] of tones) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = amp;
      o.connect(g).connect(env);
      o.start(time); o.stop(time + 0.4);
    }
  }

  function schedule() {
    if (!running || !ctx) return;
    while (nextTime < ctx.currentTime + SCHEDULE_AHEAD) {
      const lv = levels();
      const idx = beat % lv.length;
      voice(nextTime, lv[idx]);
      queue.push({ time: nextTime, idx, level: lv[idx] });
      nextTime += 60 / cfg.bpm;
      beat = idx + 1;
    }
  }

  function draw() {
    if (!running) return;
    const now = ctx ? ctx.currentTime : 0;
    while (queue.length && queue[0].time <= now) {
      const b = queue.shift();
      onBeat?.(b.idx, b.level, levels().length);
    }
    raf = requestAnimationFrame(draw);
  }

  function makeWorker() {
    if (worker) return;
    try {
      const src = `let t=null;onmessage=e=>{if(e.data==='start'){clearInterval(t);t=setInterval(()=>postMessage('tick'),${LOOKAHEAD_MS});}else{clearInterval(t);t=null;}}`;
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = schedule;
    } catch { worker = null; }
  }
  let fallback = 0;

  async function start() {
    if (running) return;
    ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') await ctx.resume();
    running = true; beat = 0; queue.length = 0;
    nextTime = ctx.currentTime + 0.06;
    makeWorker();
    if (worker) worker.postMessage('start'); else fallback = setInterval(schedule, LOOKAHEAD_MS);
    schedule();
    raf = requestAnimationFrame(draw);
    onState?.(true);
  }

  function stop() {
    if (!running) return;
    running = false;
    worker?.postMessage('stop');
    clearInterval(fallback);
    cancelAnimationFrame(raf);
    queue.length = 0;
    onState?.(false);
  }

  return {
    start, stop,
    toggle() { return running ? stop() : start(); },
    get running() { return running; },
    get config() { return { ...cfg }; },
    set(patch = {}) {
      if ('bpm' in patch) cfg.bpm = clampBpm(patch.bpm);
      if ('meter' in patch && METERS[patch.meter]) { cfg.meter = +patch.meter; beat = 0; }
      if ('sound' in patch) cfg.sound = patch.sound;
      if ('accent' in patch) cfg.accent = !!patch.accent;
      if ('volume' in patch) {
        cfg.volume = Math.min(1, Math.max(0, +patch.volume));
        if (master && ctx) master.gain.setTargetAtTime(cfg.volume, ctx.currentTime, 0.02);
      }
      return { ...cfg };
    }
  };
}
