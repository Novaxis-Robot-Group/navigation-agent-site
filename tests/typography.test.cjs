const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const source = readFileSync(join(root, 'replay.js'), 'utf8');
const styles = readFileSync(join(root, 'replay.css'), 'utf8');

test('task names remain accessible without repeated visible headings or numbering', () => {
  assert.equal((html.match(/<h4 class="sr-only" data-task-title>/g) || []).length, 2);
  assert.doesNotMatch(source, /task-tab-number|Task \$\{index/);
  assert.doesNotMatch(html + source, /chapter-count/);
  assert.match(source, /title\.dataset\.zh = goal;/);
  assert.match(source, /title\.dataset\.en = goalEn;/);
});

test('comparison headings do not include an edited replay disclosure or tooltip', () => {
  assert.doesNotMatch(source + html + styles, /replay-edit(?:-label|-description)?/);
  assert.doesNotMatch(source, /Idle waits during agent reasoning|已缩短 Agent 停车思考/);
});

test('decision text stays readable with natural rows and scrollable desktop lists', () => {
  assert.match(styles, /\.chapter-title \{ font-size: 14px; line-height: 1\.5;/);
  assert.match(styles, /\.chapter-time \{ font-size: 12px;/);
  assert.match(styles, /\.chapter-button \{[^}]*min-height: 44px;/);
  assert.match(styles, /\[data-ref="chapter-list"\] \{[^}]*overflow-y: auto;/);
  assert.match(styles, /\[data-ref="chapter-list"\] \{ overflow-y: visible; \}/);
  assert.match(source, /list\.addEventListener\('scroll', hideNote/);
});

test('Inter and the Chinese subset are self-hosted with published font assets', () => {
  const fonts = readFileSync(join(root, 'media/fonts/fonts.css'), 'utf8');
  assert.match(fonts, /font-family: "Inter"/);
  assert.match(fonts, /font-family: "Nav Han Web"/);
  assert.doesNotMatch(fonts, /https?:|IBM Plex/);
  for (const [, name] of fonts.matchAll(/url\("\.\/([^"]+)"\)/g)) {
    assert.ok(existsSync(join(root, 'media/fonts', name)), name);
  }
  assert.ok(existsSync(join(root, 'media/fonts/inter-license.txt')));
});
