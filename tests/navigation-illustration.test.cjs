const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'site.js'), 'utf8');
const motionSource = source.slice(source.indexOf('function initializeIllustrationMotion('), source.indexOf('function initializeCapabilities('));

function setup(reduce = false) {
  function target() {
    return {
      dataset: {}, attributes: {}, listeners: {},
      addEventListener(type, callback) { this.listeners[type] = callback; },
      setAttribute(name, value) { this.attributes[name] = value; },
    };
  }
  const control = target();
  const figure = target();
  const document = target();
  const media = target();
  let observe;
  figure.querySelector = () => control;
  document.querySelector = () => figure;
  document.hidden = false;
  media.matches = reduce;
  const context = vm.createContext({
    document, window: { matchMedia: () => media }, language: 'en',
    IntersectionObserver: class {
      constructor(callback) { observe = callback; }
      observe() {}
    },
  });
  vm.runInContext(motionSource, context);
  context.initializeIllustrationMotion(figure);
  return { figure, control, document, media, context, visible(value) { observe([{ isIntersecting: value }]); } };
}

test('illustration runs only while visible and the tab is active', () => {
  const motion = setup();
  assert.equal(motion.figure.dataset.motion, 'paused');
  motion.visible(true);
  assert.equal(motion.figure.dataset.motion, 'running');
  motion.document.hidden = true;
  motion.document.listeners.visibilitychange();
  assert.equal(motion.figure.dataset.motion, 'paused');
  motion.document.hidden = false;
  motion.document.listeners.visibilitychange();
  assert.equal(motion.figure.dataset.motion, 'running');
  motion.visible(false);
  assert.equal(motion.figure.dataset.motion, 'paused');
});

test('user pause survives scrolling away and back and updates bilingual labels', () => {
  const motion = setup();
  motion.visible(true);
  motion.control.listeners.click();
  assert.equal(motion.control.attributes['aria-pressed'], 'true');
  assert.equal(motion.control.attributes['aria-label'], 'Resume illustration');
  motion.visible(false);
  motion.visible(true);
  assert.equal(motion.figure.dataset.motion, 'paused');
  motion.context.language = 'zh';
  motion.control.listeners.click();
  assert.equal(motion.figure.dataset.motion, 'running');
  assert.equal(motion.control.attributes['aria-label'], '暂停示意动效');
});

test('reduced motion keeps the illustration visible and disables toggling', () => {
  const motion = setup(true);
  motion.visible(true);
  assert.equal(motion.figure.dataset.motion, 'paused');
  assert.equal(motion.control.disabled, true);
  motion.media.matches = false;
  motion.media.listeners.change();
  assert.equal(motion.figure.dataset.motion, 'running');
  assert.equal(motion.control.disabled, false);
});

test('motion focus gates animation without overriding a manual pause', () => {
  const motion = setup();
  motion.visible(true);
  assert.equal(motion.figure.dataset.motion, 'running');
  motion.figure.dataset.motionAllowed = 'false';
  motion.figure.listeners['illustration-motion-change']();
  assert.equal(motion.figure.dataset.motion, 'paused');
  motion.figure.dataset.motionAllowed = 'true';
  motion.figure.listeners['illustration-motion-change']();
  assert.equal(motion.figure.dataset.motion, 'running');
  motion.control.listeners.click();
  motion.figure.dataset.motionAllowed = 'false';
  motion.figure.listeners['illustration-motion-change']();
  motion.figure.dataset.motionAllowed = 'true';
  motion.figure.listeners['illustration-motion-change']();
  assert.equal(motion.figure.dataset.motion, 'paused');
});
