const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const styles = readFileSync(join(__dirname, '..', 'replay.css'), 'utf8');
const source = readFileSync(join(__dirname, '..', 'replay.js'), 'utf8');

test('all replay controls use the same native SVG play and pause button', () => {
  const buttons = [...html.matchAll(/<button\b[^>]*class="play-button"[^>]*>[\s\S]*?<\/button>/g)];
  assert.equal(buttons.length, 3);
  for (const [button] of buttons) {
    assert.match(button, /type="button"/);
    assert.match(button, /aria-label="[^"]+"/);
    assert.match(button, /<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">/);
    assert.match(button, /class="play-icon"/);
    assert.match(button, /class="pause-icon"/);
    assert.doesNotMatch(button, /[▶Ⅱ]/);
  }
  assert.doesNotMatch(source, /\$\("#(?:toggle-play|baseline-play|go2-play)"\)\.textContent\s*=/);
});

test('icons are centered as a single flex child and loading hides that child', () => {
  assert.match(styles, /\.play-button \{[^}]*display: inline-flex;[^}]*align-items: center;[^}]*justify-content: center;[^}]*padding: 0;/);
  assert.doesNotMatch(styles, /\.play-button(?:::\s*before|\[data-playing="true"\]::before)/);
  assert.match(styles, /\.play-button\[data-playing="true"\] \.pause-icon \{ display: block; \}/);
  assert.match(styles, /\.play-button\.is-loading > svg \{ opacity: 0; \}/);
});

function setup(updateName, nextName, selector) {
  const nodes = new Map();
  const getNode = name => {
    if (!nodes.has(name)) nodes.set(name, {
      attributes: {}, style: {},
      setAttribute(attribute, value) { this.attributes[attribute] = value; },
    });
    return nodes.get(name);
  };
  const button = getNode(selector);
  Object.defineProperty(button, 'textContent', {
    set() { throw new Error('Playback updates must preserve SVG children'); },
  });
  const video = { paused: true, currentTime: 0 };
  const context = vm.createContext({
    $: getNode, video, baselineVideo: video,
    player: getNode('#player'),
    loading: false, wantPlay: false,
    baseline: { wantPlay: false, loading: false },
    session: { baseline: { duration: 50 } },
    text: (chinese, english) => english,
    clock: () => '00:00',
  });
  const start = source.indexOf(`  function ${updateName}(`);
  const end = source.indexOf(`  function ${nextName}(`, start);
  vm.runInContext(source.slice(start, end), context);
  return { button, video, update: () => context[updateName]() };
}

for (const [name, next, selector, playLabel, pauseLabel] of [
  ['updatePlayState', 'loadSource', '#toggle-play', 'Play', 'Pause'],
  ['updateBaselineState', 'baselineError', '#baseline-play', 'Play VLN', 'Pause VLN'],
]) {
  test(`${name} preserves SVG children while updating state and accessible labels`, () => {
    const { button, video, update } = setup(name, next, selector);
    update();
    assert.equal(button.attributes['data-playing'], 'false');
    assert.equal(button.attributes['aria-label'], playLabel);
    video.paused = false;
    update();
    assert.equal(button.attributes['data-playing'], 'true');
    assert.equal(button.attributes['aria-label'], pauseLabel);
  });
}
