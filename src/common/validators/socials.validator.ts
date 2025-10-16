export function validateSocials(socials: Record<string, string>) {
  const allow = new Set(['behance', 'dribbble', 'instagram', 'linkedin', 'x', 'website']);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(socials || {})) {
    if (!allow.has(k) || !v) continue;
    const url = normalizeUrl(v);
    if (!isValidUrl(url)) continue;
    out[k] = url;
  }
  return out;
}

export function whitelistIndustry(value: string) {
  const list = (process.env.INDUSTRIES || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length && !list.includes(value)) throw new Error('Invalid industry');
}

export function whitelistWhatWeDid(values: string[]) {
  const list = (process.env.WHAT_WE_DID || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!list.length) return;
  for (const v of values) if (!list.includes(v)) throw new Error('Invalid whatWeDid value');
}

function normalizeUrl(v: string) {
  return /^https?:\/\//i.test(v) ? v : 'https://' + v;
}
function isValidUrl(v: string) {
  try { new URL(v); return true; } catch { return false; }
}
