// Glasklang · Profilbilder für Künstler:innen, Bands und Musicals
// Standard: erzeugter Glas-Avatar (Farbe + Initialen). Optional: eigenes Bild, privat in Firestore.

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Stabiler Schlüssel je Künstler:in/Werk – unabhängig von der Oberflächensprache. */
export function artistKey(artist) {
  const base = typeof artist === 'object' && artist ? (artist.en || artist.de || Object.values(artist)[0]) : artist;
  return String(base || 'unknown').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'unknown';
}

function hash(str) { let h = 2166136261; for (const c of str) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function initialsOf(name) {
  const words = String(name || '').replace(/[^\p{L}\p{N}&\s'-]/gu, ' ').split(/[\s-]+/)
    .filter(w => w && !/^(&|and|und|the|die|der|das|feat\.?|le|la)$/i.test(w));
  if (!words.length) return '♪';
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Avatar-HTML. size in px; image = dataURL oder null. */
export function avatarHTML({ name, key, image, size = 42, cls = '' }) {
  const h = hash(key || name);
  const hue = h % 360, hue2 = (hue + 40 + (h >> 9) % 80) % 360;
  const style = `--av-size:${size}px;--h1:${hue};--h2:${hue2}`;
  if (image) return `<span class="avatar-glass has-img ${cls}" style="${style}"><img src="${esc(image)}" alt="" loading="lazy" decoding="async"></span>`;
  return `<span class="avatar-glass ${cls}" style="${style}" aria-hidden="true"><span class="av-txt">${esc(initialsOf(name))}</span></span>`;
}

/** Bild-Datei → quadratisch zugeschnitten, 256 px, WebP (Rückfall JPEG) als dataURL (~15–40 KB). */
export async function processImage(file, px = 256) {
  if (!file || !file.type.startsWith('image/')) throw new Error('not-image');
  let src;
  try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch {
    src = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  }
  const w = src.width, h = src.height, side = Math.min(w, h);
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, px, px);
  let url = c.toDataURL('image/webp', 0.85);
  if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.85);
  if (url.length > 300000) throw new Error('too-large');
  return url;
}
