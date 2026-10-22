const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

const root = join(__dirname, '..');
const fonts = readFileSync(join(root, 'media/fonts/fonts.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');

test('published fonts are content-addressed original assets and the MiSans pipeline never edits glyphs', () => {
  for (const [, filename] of fonts.matchAll(/url\("\.\/([^"]+)"\)/g)) {
    const hash = createHash('sha256').update(readFileSync(join(root, 'media/fonts', filename))).digest('hex').slice(0, 12);
    assert.ok(filename.includes(hash), filename);
  }
  const script = readFileSync(join(root, 'prepare_fonts.py'), 'utf8');
  assert.doesNotMatch(script, /fontTools|TTFont|subsetter|record\.string/);
  assert.match(script, /cdn-file\.hyperos\.mi\.com\/mi-font-service/);
  assert.match(html, /href="\.\/media\/fonts\/NOTICE\.txt"/);
});

test('official font slices cover all Chinese characters used by static and dynamic content', () => {
  const ranges = [...fonts.matchAll(/unicode-range:\s*([^;]+);/g)].flatMap(match => match[1].split(',').map(token => {
    const bounds = token.trim().replace('U+', '').split('-');
    return [parseInt(bounds[0], 16), parseInt(bounds.at(-1), 16)];
  }));
  for (const filename of ['index.html', 'site.js', 'replay.js', 'media/replays/sessions.json', 'media/go2/sessions.json']) {
    for (const character of new Set(readFileSync(join(root, filename), 'utf8'))) {
      const codepoint = character.codePointAt(0);
      if (codepoint < 0x4e00 || codepoint > 0x9fff) continue;
      assert.ok(ranges.some(([start, end]) => start <= codepoint && codepoint <= end), `${filename}: ${character}`);
    }
  }
});
