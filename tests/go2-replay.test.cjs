// 模拟媒体事件与跳转延迟，验证双视角同步不会反复打断解码。
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'replay.js'), 'utf8');
const go2 = source.slice(source.indexOf('function initializeGo2Replay('), source.indexOf('async function initializeTasks('));

class Element {
  constructor() {
    this.listeners = {};
    this.style = {};
    this.attributes = {};
    this.value = '';
  }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  emit(type) {
    this['on' + type]?.({ target: this });
    for (const callback of this.listeners[type] || []) callback({ target: this });
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  querySelectorAll() { return []; }
  replaceChildren() {}
}

class Media extends Element {
  constructor() {
    super();
    this.time = 0;
    this.duration = 150;
    this.readyState = 4;
    this.paused = true;
    this.playbackRate = 4;
    this.seeking = false;
    this.seekCount = 0;
    this.seekRemaining = 0;
  }
  get currentTime() { return this.time; }
  set currentTime(value) {
    this.time = value;
    this.seeking = true;
    this.seekRemaining = .15;
    this.seekCount++;
    this.emit('seeking');
  }
  finishSeek() {
    this.seeking = false;
    this.seekRemaining = 0;
    this.emit('seeked');
    this.emit('canplay');
  }
  load() { this.emit('loadedmetadata'); }
  play() {
    if (this.paused) {
      this.paused = false;
      this.emit('play');
      this.emit('playing');
    }
    return Promise.resolve();
  }
  pause() {
    if (!this.paused) { this.paused = true; this.emit('pause'); }
  }
  advance(dt) {
    if (this.seeking) {
      this.seekRemaining -= dt;
      if (this.seekRemaining <= 0) this.finishSeek();
    } else if (!this.paused) this.time += dt * this.playbackRate;
  }
}

function setup(rate = 4) {
  const elements = new Map();
  const camera = new Media(), external = new Media();
  elements.set('#go2-video', camera);
  elements.set('#go2-external-video', external);
  const one = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  let now = 0;
  const context = vm.createContext({
    taskQueries: () => ({ one }),
    clock: String,
    text: (zh, en) => en,
    hideNote() {},
    document: new Element(),
    performance: { now: () => now * 1000 },
  });
  vm.runInContext(go2, context);
  context.initializeGo2Replay({}, { duration: 150, video: 'robot.mp4', nodes: [], external: { start: 0, duration: 150, video: 'external.mp4' } });
  camera.emit('loadedmetadata');
  camera.finishSeek();
  external.finishSeek();
  one('#go2-speed').value = rate;
  one('#go2-speed').emit('change');
  camera.seekCount = external.seekCount = 0;
  return {
    camera, external, one,
    start() { one('#go2-play').emit('click'); },
    advance(seconds) {
      for (let step = 0; step < Math.round(seconds / .01); step++) {
        now += .01;
        camera.advance(.01);
        external.advance(.01);
        // timeupdate 的触发间隔按墙钟计，4× 时每次约跨越一秒录像。
        if (step % 25 === 0) camera.emit('timeupdate');
      }
    },
  };
}

test('4× 跳转尚未完成时，不重复重设实拍进度', () => {
  const { camera, external } = setup();
  camera.currentTime = 10;
  const seeks = external.seekCount;
  camera.time = 10.8;
  camera.emit('timeupdate');
  assert.equal(external.seekCount, seeks);
});

test('4× 解码延迟后能恢复同步，不陷入连续跳转', () => {
  const replay = setup();
  replay.start();
  replay.camera.time = 5;
  replay.external.time = 3.8;
  replay.advance(6);
  assert.ok(replay.external.seekCount <= 2, `实拍被打断 ${replay.external.seekCount} 次`);
  assert.ok(Math.abs(replay.camera.time - replay.external.time) < .35);
});

test('小幅偏差通过速度纠正，暂停和切速仍保留用户设置', () => {
  const replay = setup();
  replay.start();
  replay.camera.time = 5;
  replay.external.time = 4.6;
  replay.advance(4);
  assert.equal(replay.external.seekCount, 0);
  assert.ok(Math.abs(replay.camera.time - replay.external.time) < .25);
  replay.one('#go2-play').emit('click');
  assert.equal(replay.camera.paused, true);
  assert.equal(replay.external.paused, true);
  replay.one('#go2-speed').value = 1;
  replay.one('#go2-speed').emit('change');
  assert.equal(replay.camera.playbackRate, 1);
  assert.equal(replay.external.playbackRate, 1);
});

test('1× 正常播放不跳转，主动拖动立即对齐两路', () => {
  const replay = setup(1);
  replay.start();
  replay.advance(3);
  assert.equal(replay.external.seekCount, 0);
  replay.one('#go2-timeline').value = 25;
  replay.one('#go2-timeline').emit('input');
  assert.equal(replay.camera.time, 25);
  assert.equal(replay.external.time, 25);
});
