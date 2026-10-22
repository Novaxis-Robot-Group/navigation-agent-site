const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'replay.js'), 'utf8');
const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const styles = readFileSync(join(__dirname, '..', 'replay.css'), 'utf8');
const settingsSource = source.slice(source.indexOf('let activeReplaySettings'), source.indexOf('function createTask('));

function setup(nativePopover = true) {
  const events = new Map();
  const player = { closest: () => null };
  const firstOption = { focus() { this.focused = true; } };
  const panel = {
    hidden: true, style: {}, attributes: {}, scrollHeight: 220,
    contains: target => target === firstOption,
    matches() { return this.open; },
    setAttribute(name, value) { this.attributes[name] = value; },
    hasAttribute(name) { return name in this.attributes; },
    querySelector: () => firstOption,
  };
  if (nativePopover) {
    panel.showPopover = function () { this.open = true; };
    panel.hidePopover = function () { this.open = false; };
  }
  const button = {
    attributes: {}, listeners: {},
    getAttribute: () => 'settings',
    closest: () => player,
    contains(target) { return target === this; },
    setAttribute(name, value) { this.attributes[name] = value; },
    getBoundingClientRect: () => ({ top: 360, bottom: 400, right: 500 }),
    addEventListener(type, callback) { this.listeners[type] = callback; },
    focus() { this.focused = true; },
  };
  const document = {
    fullscreenElement: null,
    getElementById: () => panel,
    addEventListener(type, callback) { events.set(type, callback); },
  };
  const window = { innerWidth: 1440, innerHeight: 900, addEventListener() {}, scrollBy() {} };
  const context = vm.createContext({ document, window, hideNote() {} });
  vm.runInContext(settingsSource, context);
  context.initializeReplaySettings({ querySelectorAll: () => [button] });
  return { context, button, panel, player, firstOption, events, window, document, open: () => button.listeners.click() };
}

test('main controls remain outside the video in a fixed compact rail', () => {
  assert.match(styles, /--transport-height: 40px/);
  assert.match(styles, /--transport-height: 44px/);
  assert.match(styles, /\.transport \{ display: flex;[^}]*height: var\(--transport-height\)/);
  assert.doesNotMatch(styles, /84px|112px|data-controls="overlay"/);
  assert.doesNotMatch(html, /replay-play-cue|view-compact|transport-options/);
  assert.equal((html.match(/data-settings-panel role="dialog"/g) || []).length, 3);
  assert.equal((html.match(/aria-haspopup="dialog"/g) || []).length, 3);
  assert.match(styles, /:focus-within > \.transport > :not\(\.replay-settings\) \{ transition: none;/);
  assert.match(source, /else if \(player.requestFullscreen\) await player.requestFullscreen/);
});

test('settings omit redundant node controls while retaining progress and the decision list', () => {
  assert.doesNotMatch(html + styles, /settings-nodes|settings-node-actions|data-ref="(?:previous|next)"/);
  assert.doesNotMatch(source, /\$\("#(?:previous|next)"\)/);
  assert.match(html, /data-ref="timeline" type="range"/);
  assert.match(html, /data-ref="chapter-list"/);
});

test('settings open on click, focus the first option, and toggle closed', () => {
  const state = setup();
  state.open();
  assert.equal(state.panel.hidden, false);
  assert.equal(state.panel.open, true);
  assert.equal(state.button.attributes['aria-expanded'], 'true');
  assert.equal(state.firstOption.focused, true);
  assert.equal(state.panel.style.top, '408px');
  state.open();
  assert.equal(state.panel.hidden, true);
  assert.equal(state.panel.open, false);
  assert.equal(state.button.attributes['aria-expanded'], 'false');
});

test('Escape restores focus; external click and focus leave close without stealing focus', () => {
  const state = setup();
  state.open();
  state.events.get('pointerdown')({ target: state.firstOption });
  assert.equal(state.panel.hidden, false);
  let prevented = false;
  state.events.get('keydown')({ key: 'Escape', preventDefault() { prevented = true; } });
  assert.equal(state.panel.hidden, true);
  assert.equal(state.button.focused, true);
  assert.equal(prevented, true);
  state.open();
  state.events.get('pointerdown')({ target: {} });
  assert.equal(state.panel.hidden, true);
  state.open();
  state.events.get('focusin')({ target: state.firstOption });
  assert.equal(state.panel.hidden, false);
  state.events.get('focusin')({ target: {} });
  assert.equal(state.panel.hidden, true);
});

test('only one settings panel opens and fullscreen transitions close it', () => {
  const state = setup();
  state.open();
  const secondPanel = { ...state.panel, hidden: true, open: false, style: {} };
  const secondButton = { ...state.button, listeners: {}, attributes: {} };
  state.document.getElementById = () => secondPanel;
  state.context.initializeReplaySettings({ querySelectorAll: () => [secondButton] });
  secondButton.listeners.click();
  assert.equal(state.panel.hidden, true);
  assert.equal(secondPanel.hidden, false);
  state.events.get('fullscreenchange')();
  assert.equal(secondPanel.hidden, true);
});

test('mobile positioning clamps horizontally and fullscreen is the only upward placement', () => {
  const { context } = setup();
  const bounds = { top: 550, bottom: 594, right: 385 };
  const viewport = { width: 390, height: 844 };
  const normal = context.replaySettingsLayout(bounds, { height: 220 }, viewport, false);
  assert.equal(normal.top, 602);
  assert.ok(normal.left >= 12);
  assert.ok(normal.left + normal.width <= 378);
  assert.equal(normal.maxHeight, 230);
  const fullscreen = context.replaySettingsLayout(bounds, { height: 220 }, viewport, true);
  assert.equal(fullscreen.top, 322);
});

test('insufficient space scrolls the page rather than flipping into the recording', () => {
  const state = setup();
  state.window.innerHeight = 500;
  let scroll;
  state.window.scrollBy = options => { scroll = options; };
  state.open();
  assert.equal(scroll.top, 140);
  assert.equal(scroll.behavior, 'instant');
  assert.equal(state.panel.style.top, '408px');
});

test('task hiding and older browsers keep settings dismissible', () => {
  const state = setup();
  state.open();
  state.player.closest = () => ({});
  state.context.positionReplaySettings();
  assert.equal(state.panel.hidden, true);
  const fallback = setup(false);
  fallback.open();
  assert.equal(fallback.panel.attributes['data-fallback'], '');
  fallback.context.closeReplaySettings(true);
  assert.equal(fallback.panel.hidden, true);
  assert.equal(fallback.button.focused, true);
});
