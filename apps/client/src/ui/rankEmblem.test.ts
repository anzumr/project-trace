import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emblemSvg } from './RankEmblem';

test('every one of the 32 emblems is well-formed SVG with unique gradient ids and its division number', () => {
  const ids = new Set<string>();
  for (let tier = 0; tier < 8; tier++) for (const division of [4, 3, 2, 1]) {
    const svg = emblemSvg(tier, division);
    assert.match(svg, /^<svg [^>]*viewBox="-66 -74 132 150"/); assert.ok(svg.endsWith('</svg>'));
    assert.equal((svg.match(/<g\b/g) ?? []).length, (svg.match(/<\/g>/g) ?? []).length, 'balanced groups');
    assert.match(svg, new RegExp(`>${division}</text></svg>$`));
    for (const id of svg.matchAll(/ id="([^"]+)"/g)) { assert.ok(!ids.has(id[1]), 'gradient ids never collide between emblems'); ids.add(id[1]); }
    assert.doesNotMatch(svg, /NaN|undefined/);
  }
});
