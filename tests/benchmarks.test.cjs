const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const panels = [...html.matchAll(/<section class="benchmark-panel"[^>]*>([\s\S]*?)<\/section>/g)];
const expected = [
  [['39.785%', '0.376', '5.095 m', '0.550', '0.53'], ['6.810%', '0.060', '9.380 m', '0.387', '—'], ['53.047%', '0.423', '5.577 m', '0.716', '0.410']],
  [['77.10%', '0.413', '1.789 m', '83.0%'], ['17.99%', '0.170', '3.02 m', '72.3%'], ['77.50%', '0.409', '1.629 m', '85.4%']],
  [['46.667%', '0.216', '3.685 m', '65.833%'], ['—', '—', '—', '—'], ['45.833%', '0.204', '3.622 m', '66.667%']],
];
const cells = panels.map(([, panel]) => [...panel.matchAll(/<tr data-method="\d">([\s\S]*?)<\/tr>/g)]
  .map(([, row]) => [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell)));
const plain = value => value.replace(/<[^>]+>/g, '').trim();

test('all supplied benchmark scores retain their precision, units and missing entries', () => {
  assert.equal(panels.length, 3);
  assert.deepEqual(cells.map(rows => rows.map(row => row.map(plain))), expected);
  for (const [, panel] of panels) {
    const methods = [...panel.matchAll(/<th scope="row">([\s\S]*?)<\/th>/g)].map(([, method]) => plain(method));
    assert.deepEqual(methods, ['LightNav-0 baseline', 'InternVLA-N1', 'Scheduling Harness (LightNav-based)']);
  }
});

test('best scores use lower NE and higher values for other metrics', () => {
  for (const rows of cells) {
    for (let column = 0; column < rows[0].length; column++) {
      const values = rows.map(row => Number.parseFloat(plain(row[column]))).filter(Number.isFinite);
      const best = column === 2 ? Math.min(...values) : Math.max(...values);
      for (const row of rows) {
        assert.equal(row[column].includes('<strong>'), Number.parseFloat(plain(row[column])) === best);
      }
    }
  }
});

test('complete tables are available before JavaScript while obsolete mock results are removed', () => {
  for (const [markup] of panels) {
    assert.doesNotMatch(markup.split('>')[0], /\bhidden\b/);
    assert.match(markup, /<caption class="sr-only">/);
  }
  const section = html.slice(html.indexOf('id="benchmarks"'));
  assert.doesNotMatch(section, /Mock data|LLM-judged SR|planned experiments, not measured scores/);
});
