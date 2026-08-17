export type DedupeItem = {
  id: string;
  mpn: string;
  partDesc: string;
};

export type DedupeResult = {
  groups: Array<{ survivorId: string; duplicateIds: string[]; reason: string }>;
  needsReviewIds: string[];
};

function norm(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.toLowerCase().split(/[\s\/\-]+/).filter((t) => t.length > 2));
  const tb = new Set(b.toLowerCase().split(/[\s\/\-]+/).filter((t) => t.length > 2));
  if (!ta.size || !tb.size) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit += 1;
  return hit / Math.max(ta.size, tb.size);
}

/** Exact MPN match + soft Part_Desc similarity for near-dupes. */
export function dedupeItems(items: DedupeItem[]): DedupeResult {
  const groups: DedupeResult['groups'] = [];
  const needsReviewIds: string[] = [];
  const byMpn = new Map<string, DedupeItem[]>();

  for (const item of items) {
    const key = norm(item.mpn) || `DESC:${norm(item.partDesc).slice(0, 24)}`;
    const list = byMpn.get(key) || [];
    list.push(item);
    byMpn.set(key, list);
  }

  for (const [, list] of byMpn) {
    if (list.length < 2) continue;
    const survivor = list[0];
    const dups = list.slice(1).map((x) => x.id);
    groups.push({
      survivorId: survivor.id,
      duplicateIds: dups,
      reason: 'Exact manufacturer part number match',
    });
    needsReviewIds.push(...dups);
  }

  // Soft desc similarity across different MPNs
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (norm(items[i].mpn) && norm(items[i].mpn) === norm(items[j].mpn)) continue;
      const overlap = tokenOverlap(items[i].partDesc, items[j].partDesc);
      if (overlap >= 0.85) {
        groups.push({
          survivorId: items[i].id,
          duplicateIds: [items[j].id],
          reason: `High Part_Desc token overlap (${overlap.toFixed(2)})`,
        });
        needsReviewIds.push(items[j].id);
      }
    }
  }

  return { groups, needsReviewIds: [...new Set(needsReviewIds)] };
}
