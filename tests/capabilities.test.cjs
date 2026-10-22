const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'site.js'), 'utf8');
const motionFocusSource = source.slice(
  source.indexOf('function initializeCapabilities('),
  source.indexOf("\ndocument.querySelectorAll('[data-illustration]')"),
);

function setup(compact = false) {
  function target() {
    return {
      attributes: {}, dataset: {}, listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute(name, value) { this.attributes[name] = value; },
      dispatchEvent(event) { this.updates = (this.updates || 0) + 1; this.listeners[event.type]?.(); },
    };
  }
  const scenes = Array.from({ length: 3 }, target);
  const panels = scenes.map((scene, index) => ({
    ...target(),
    bounds: { top: 100 + index * 324, bottom: 400 + index * 324 },
    querySelector: () => scene,
    getBoundingClientRect() { return this.bounds; },
  }));
  const media = { ...target(), matches: compact };
  const window = { ...target(), innerHeight: 800, matchMedia: () => media };
  const document = { ...target(), querySelectorAll: () => panels };
  const header = { bottom: 80 };
  const frames = [];
  let frameCount = 0;
  const context = vm.createContext({
    document, window,
    siteNavigation: { getBoundingClientRect: () => header },
    requestAnimationFrame(callback) { frames.push(callback); return ++frameCount; },
    Event: class { constructor(type) { this.type = type; } },
  });
  vm.runInContext(motionFocusSource, context);
  context.initializeCapabilities();
  function flush() {
    const callbacks = frames.splice(0);
    for (const callback of callbacks) callback();
  }
  return { panels, scenes, media, window, document, header, frames, flush };
}

test('desktop exposes all scenes and permits each to animate without duplicate updates', () => {
  const { panels, scenes, window, flush } = setup();
  flush();
  assert.deepEqual(panels.map(panel => panel.dataset.motionAllowed), ['true', 'true', 'true']);
  assert.ok(panels.every(panel => !panel.hidden));
  assert.ok(scenes.every(scene => scene.attributes.viewBox === '0 0 720 420'));
  window.listeners.resize();
  flush();
  assert.ok(panels.every(panel => panel.updates === 1));
});

test('compact layout permits only the visible scene nearest the content center', () => {
  const { panels, flush } = setup(true);
  flush();
  assert.deepEqual(panels.map(panel => panel.dataset.motionAllowed), ['false', 'true', 'false']);
  assert.ok(panels.every(panel => !panel.hidden));
});

test('mobile motion ignores scenes behind the header and outside the viewport', () => {
  const { panels, window, header, flush } = setup(true);
  header.bottom = 180;
  window.innerHeight = 760;
  panels[0].bounds = { top: -100, bottom: 180 };
  panels[1].bounds = { top: 190, bottom: 490 };
  panels[2].bounds = { top: 514, bottom: 814 };
  flush();
  assert.deepEqual(panels.map(panel => panel.dataset.motionAllowed), ['false', 'true', 'false']);
  for (const panel of panels) panel.bounds = { top: 800, bottom: 1100 };
  window.listeners.scroll();
  flush();
  assert.ok(panels.every(panel => panel.dataset.motionAllowed === 'false'));
});

test('scroll focus work is frame-throttled and does not run on desktop scroll', () => {
  const { panels, window, media, frames, flush } = setup(true);
  flush();
  for (const panel of panels) {
    panel.bounds.top -= 324;
    panel.bounds.bottom -= 324;
  }
  window.listeners.scroll();
  window.listeners.scroll();
  window.listeners.resize();
  assert.equal(frames.length, 1);
  flush();
  assert.deepEqual(panels.map(panel => panel.dataset.motionAllowed), ['false', 'false', 'true']);
  media.matches = false;
  media.listeners.change();
  flush();
  window.listeners.scroll();
  assert.equal(frames.length, 0);
  assert.ok(panels.every(panel => panel.dataset.motionAllowed === 'true'));
});

test('viewport and language changes preserve expanded content and refresh motion focus', () => {
  const { scenes, panels, media, document, frames, flush } = setup();
  flush();
  media.matches = true;
  media.listeners.change();
  assert.ok(scenes.every(scene => scene.attributes.viewBox === '20 -10 680 440'));
  document.listeners['site-language-change']();
  document.listeners['replay-tasks-ready']();
  assert.equal(frames.length, 1);
  flush();
  assert.equal(panels.filter(panel => panel.dataset.motionAllowed === 'true').length, 1);
  media.matches = false;
  media.listeners.change();
  flush();
  assert.ok(scenes.every(scene => scene.attributes.viewBox === '0 0 720 420'));
  assert.ok(panels.every(panel => !panel.hidden && panel.dataset.motionAllowed === 'true'));
});

test('markup exposes three agent cards without capability tabs or hidden panels', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  const start = html.indexOf('<section class="features-section"');
  const section = html.slice(start, html.indexOf('</section>', start));
  const ids = [...section.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal((section.match(/<article class="capability-panel"/g) || []).length, 3);
  assert.equal((section.match(/role="(?:tab|tablist|tabpanel)"/g) || []).length, 0);
  assert.equal((section.match(/\shidden[\s>]/g) || []).length, 0);
  for (const name of ['memory', 'watch', 'scheduling']) {
    assert.ok(section.includes(`aria-labelledby="capability-${name}-heading"`));
    assert.ok(section.includes(`aria-labelledby="capability-${name}-title capability-${name}-description"`));
  }
  assert.ok(!section.includes('capability-integration'));
  assert.ok(!section.includes('Architecture Decoupling'));
  assert.ok(section.includes('All three animations'));
  assert.ok(section.includes('data-zh="任务内记忆"'));
  assert.ok(section.includes('data-zh="选择性调度"'));
  assert.equal((section.match(/<text[\s>]/g) || []).length, 0);
  assert.equal((section.match(/<image[\s>]/g) || []).length, 0);
  assert.equal((section.match(/<h3\b/g) || []).length, 3);
  assert.equal((section.match(/<details\b/g) || []).length, 1);
  assert.equal((section.match(/<details[^>]*\sopen[\s>]/g) || []).length, 0);
});
