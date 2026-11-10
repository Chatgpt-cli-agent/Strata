/** The name a person reads for a loaded model: the family and the version from the catalog ("Qwen3.8-Flash-Next Q2_0"), not the file id. */
export function friendlyModelName(catalog, id) {
  for (const family of catalog?.families ?? []) {
    const size = (family.sizes ?? []).find(s => s.id === id);
    if (size?.model && family.title) return `${String(family.title).replace(/\s*\(Gyro\)\s*$/, '')} ${size.model}`.trim();
  }
  return null;
}

/** setup.py run-config tag (strata-<tag>.json): not family-model. Used after install when loadAfter is true. */
const FAMILY_TAGS = Object.freeze({
  deepseek41: 'deepseek-v4.1-flash-',
  qwen36: 'qwen36-',
  swift: 'swift-',
  coder: 'coder-',
  unsloth: 'unsloth-',
  gyro: 'gyro-',
  nvfp4: 'nvfp4-',
});

export function catalogModelId(catalog, family, model) {
  const f = String(family ?? 'qwen');
  const m = String(model ?? '');
  const q = m.toLowerCase();
  const sizes = catalog?.families?.find(x => x.family === f)?.sizes ?? [];
  const size = sizes.find(s => s.model === m) ?? sizes.find(s => String(s.model).toLowerCase() === q);
  if (size?.id) return size.id;
  if (f === 'qwen') return q;
  const prefix = FAMILY_TAGS[f];
  return prefix ? `${prefix}${q}` : `${f}-${q}`;
}
