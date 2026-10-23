const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const reportLinks = [...html.matchAll(/<a\b[^>]*href="(\.\/media\/reports\/[^"#]+)(#[^"]*)?"[^>]*>/g)];

test('report links open a versioned local PDF in a separate browser tab', () => {
  assert.equal(reportLinks.length, 2);
  assert.ok(reportLinks.some(([, , fragment]) => fragment === '#page=9'));
  for (const [anchor, relativePath] of reportLinks) {
    assert.match(anchor, /type="application\/pdf"/);
    assert.match(anchor, /target="_blank"/);
    assert.match(anchor, /rel="noopener noreferrer"/);
    assert.match(anchor, /data-en="[^"]+"/);
    assert.match(anchor, /data-zh="[^"]+"/);
    assert.doesNotMatch(anchor, /\bdownload(?:\s|=|>)/);
    const pdf = readFileSync(resolve(root, relativePath));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.equal(createHash('sha256').update(pdf).digest('hex'), '8effa057781349085c20f06ce8a1913529bbc7a76062b1905acaf0c1626efb65');
  }
});

test('report entry retains the five-link navigation and separate implementation documentation', () => {
  const navigation = html.match(/<nav\b[^>]*>([\s\S]*?)<\/nav>/)[1];
  assert.equal((navigation.match(/<a\b/g) || []).length, 5);
  assert.match(navigation, /media\/reports\/nova-hei-2026-10-22\.pdf/);
  const footer = html.slice(html.indexOf('<footer'));
  assert.match(footer, /href="https:\/\/github\.com\/Novaxis-Robot-Group\/navigation-agent\/blob\/main\/README\.md"/);
  assert.match(footer, /data-en="Documentation ↗" data-zh="技术文档 ↗"/);
});

test('report integration preserves capability boundaries and does not promote the experiment plan to results', () => {
  assert.match(html, /YOLO-World is enabled in the supplied backend configurations/);
  assert.match(html, /same VLM client/);
  assert.match(html, /distinct from independent experimental scoring/);
  assert.match(html, /Mock data · Not measured results/);
  assert.match(html, /planned experiments, not measured scores/);
  const workflow = readFileSync(join(root, '.github/workflows/pages.yml'), 'utf8');
  assert.match(workflow, /- media\/\*\*/);
  assert.match(workflow, /cp -R media _site\/media/);
});
