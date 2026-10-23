const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const styles = readFileSync(join(__dirname, '..', 'styles.css'), 'utf8');
const start = html.indexOf('<section class="text-section" id="architecture"');
const section = html.slice(start, html.indexOf('</section>', start));

test('engineering architecture precedes the three separate agent capabilities', () => {
  assert.ok(start > html.indexOf('class="intro"'));
  assert.ok(start < html.indexOf('id="capabilities"'));
  assert.ok(html.indexOf('id="capabilities"') < html.indexOf('id="about"'));
  assert.equal((section.match(/class="capability-panel"/g) || []).length, 0);
  assert.equal((section.match(/class="architecture-core"/g) || []).length, 1);
  assert.equal((section.match(/class="architecture-module(?: architecture-custom)?"/g) || []).length, 5);
  assert.equal((section.match(/class="architecture-module architecture-custom"/g) || []).length, 2);
  for (const name of ['LightNav', 'Go2', 'MuJoCo', 'Agent', 'VLN', 'Embodiment']) {
    assert.ok(section.includes(`>${name}<`));
  }
});

test('complete diagram remains accessible and visible without JavaScript', () => {
  assert.ok(section.includes('role="img" aria-labelledby="architecture-title" aria-describedby="architecture-description"'));
  assert.ok(section.includes('id="architecture-description"'));
  assert.ok(section.includes('data-illustration data-motion="paused"'));
  assert.ok(section.includes('type="button" disabled aria-pressed="false"'));
  assert.equal((section.match(/\shidden[\s>]/g) || []).length, 0);
  assert.equal((section.match(/aria-hidden="true"/g) || []).length, 8);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('custom slots describe extension rather than verified universal compatibility', () => {
  assert.equal((section.match(/data-en="Custom \+" data-zh="自定义 \+"/g) || []).length, 2);
  assert.ok(section.includes('Lines are structural relationships, not execution order'));
  assert.equal((section.match(/<details[^>]*\sopen[\s>]/g) || []).length, 0);
  assert.equal((section.match(/marker-(?:start|end)=/g) || []).length, 0);
});

test('only extension-slot artwork moves, while labels and the Agent stay fixed', () => {
  const animationRules = [...styles.matchAll(/([^{}]+)\{[^{}]*\banimation:\s*architecture-adapter[^{}]*\}/g)];
  assert.equal(animationRules.length, 1);
  assert.equal(animationRules[0][1].trim(), '.architecture-custom .architecture-module-art');
  assert.match(styles, /architecture-adapter 6s ease-in-out infinite/);
  assert.match(styles, /\.architecture-figure\[data-motion="paused"\] \.architecture-module-art \{ animation-play-state: paused; \}/);
  assert.match(styles, /\.architecture-figure \{[^}]*height: 340px/);
  assert.match(styles, /\.architecture-figure \{ height: 420px/);
  assert.match(styles, /\.architecture-map \{ grid-template-columns: minmax\(0, 1fr\);/);
});
