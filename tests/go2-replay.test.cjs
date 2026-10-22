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
    this.classList = { toggle() {} };
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
    this.bufferEnd = 150;
    this.buffered = {length: 1, start: () => 0, end: () => this.bufferEnd};
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
  load() { this.loadCount = (this.loadCount || 0) + 1; this.emit('loadedmetadata'); }
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

function setup(rate = 4, fast = false) {
  const elements = new Map();
  const camera = new Media(), external = new Media();
  elements.set('#go2-video', camera);
  elements.set('#go2-external-video', external);
  const one = selector => {
    if (!elements.has(selector)) elements.set(selector, new Element());
    return elements.get(selector);
  };
  let now = 0;
  const timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    taskQueries: () => ({ one }),
    clock: String,
    text: (zh, en) => en,
    hideNote() {},
    document: new Element(),
    performance: { now: () => now * 1000 },
    setInterval(callback) { const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval(id) { timers.delete(id); },
  });
  vm.runInContext(go2, context);
  const playback = context.initializeGo2Replay({}, { duration: 150, video: 'robot.mp4', playback4x: fast ? {video: 'robot-4x.mp4', externalVideo: 'external-4x.mp4'} : null, nodes: [], external: { start: 0, duration: 150, video: 'external.mp4' } });
  camera.emit('loadedmetadata');
  camera.finishSeek();
  external.finishSeek();
  one('#go2-speed').value = rate;
  one('#go2-speed').emit('change');
  camera.seekCount = external.seekCount = 0;
  return {
    camera, external, one, playback,
    start() { one('#go2-play').emit('click'); },
    async advance(seconds) {
      for (let step = 0; step < Math.round(seconds / .01); step++) {
        now += .01;
        camera.advance(.01);
        external.advance(.01);
        // timeupdate 的触发间隔按墙钟计，4× 时每次约跨越一秒录像。
        if (step % 25 === 0) camera.emit('timeupdate');
        if (step % 20 === 0) for (const callback of timers.values()) callback();
        await Promise.resolve();
        await Promise.resolve();
      }
    },
  };
}

test('Go2 中央分隔处可播放，媒体冒泡不会重复切换', () => {
  const { camera, external, one } = setup();
  const views = one('.go2-views');
  const click = views.listeners.click[0];
  click({ target: views, currentTarget: views });
  assert.equal(camera.paused, false);
  assert.equal(external.paused, false);
  click({ target: camera, currentTarget: views });
  assert.equal(camera.paused, false);
  click({ target: views, currentTarget: views });
  assert.equal(camera.paused, true);
  assert.equal(external.paused, true);
});

test('切换任务暂停双视角，保留进度和倍速，迟到事件不重新播放', async () => {
  const replay = setup(2);
  replay.start();
  await replay.advance(1);
  replay.playback.pause();
  const cameraTime = replay.camera.currentTime;
  const externalTime = replay.external.currentTime;
  replay.camera.emit('play');
  replay.camera.emit('canplay');
  replay.external.emit('progress');
  await replay.advance(2);
  assert.equal(replay.camera.paused, true);
  assert.equal(replay.external.paused, true);
  assert.equal(replay.camera.currentTime, cameraTime);
  assert.equal(replay.external.currentTime, externalTime);
  assert.equal(replay.camera.playbackRate, 2);
  assert.equal(replay.one('#go2-play').attributes['data-playing'], 'false');
});

test('切换任务取消缓冲意图，缓冲补足后仍保持暂停', async () => {
  const replay = setup();
  replay.camera.bufferEnd = replay.external.bufferEnd = 0;
  replay.start();
  await replay.advance(1);
  replay.playback.pause();
  replay.camera.bufferEnd = replay.external.bufferEnd = 150;
  replay.camera.emit('canplay');
  replay.external.emit('canplay');
  await replay.advance(2);
  assert.equal(replay.camera.paused, true);
  assert.equal(replay.external.paused, true);
  assert.equal(replay.one('#go2-player').attributes['aria-busy'], 'false');
});

test('4× 跳转尚未完成时，不重复重设实拍进度', () => {
  const { camera, external } = setup();
  camera.currentTime = 10;
  const seeks = external.seekCount;
  camera.time = 10.8;
  camera.emit('timeupdate');
  assert.equal(external.seekCount, seeks);
});

test('4× 解码延迟后能恢复同步，不陷入连续跳转', async () => {
  const replay = setup();
  replay.start();
  replay.camera.time = 5;
  replay.external.time = 3.8;
  await replay.advance(6);
  assert.ok(replay.external.seekCount <= 2, `实拍被打断 ${replay.external.seekCount} 次`);
  assert.ok(Math.abs(replay.camera.time - replay.external.time) < .35);
});

test('小幅偏差通过速度纠正，暂停和切速仍保留用户设置', async () => {
  const replay = setup();
  replay.start();
  replay.camera.time = 5;
  replay.external.time = 4.6;
  await replay.advance(4);
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

test('1× 正常播放不跳转，主动拖动立即对齐两路', async () => {
  const replay = setup(1);
  replay.start();
  await replay.advance(3);
  assert.equal(replay.external.seekCount, 0);
  replay.one('#go2-timeline').value = 25;
  replay.one('#go2-timeline').emit('input');
  assert.equal(replay.camera.time, 25);
  assert.equal(replay.external.time, 25);
});


test('首播等待两路实际播放余量，进度不足时不提前启动相机', async () => {
  const replay = setup();
  replay.external.bufferEnd = 1;
  replay.external.readyState = 3;
  replay.start();
  await replay.advance(1);
  assert.equal(replay.camera.paused, true);
  assert.equal(replay.external.paused, true);
  assert.equal(replay.one('#go2-player').attributes['aria-busy'], 'true');
  replay.external.bufferEnd = 20;
  replay.external.emit('progress');
  await replay.advance(5);
  assert.equal(replay.camera.paused, false);
  assert.equal(replay.external.paused, false);
});

test('实拍断流时两路一起等待，补足缓存后自动恢复', async () => {
  const replay = setup();
  replay.start();
  await replay.advance(.5);
  replay.external.bufferEnd = replay.external.time;
  replay.external.readyState = 2;
  replay.external.emit('waiting');
  assert.equal(replay.camera.paused, true);
  assert.equal(replay.external.paused, true);
  const time = replay.camera.time;
  await replay.advance(1);
  assert.equal(replay.camera.time, time);
  assert.equal(replay.external.seekCount, 0);
  replay.external.readyState = 4;
  replay.external.bufferEnd = 150;
  replay.external.emit('canplay');
  await replay.advance(.5);
  assert.equal(replay.camera.paused, false);
  assert.equal(replay.external.paused, false);
});

test('用户取消缓冲后，迟到的加载事件不会自动开播', async () => {
  const replay = setup();
  replay.external.bufferEnd = 0;
  replay.external.readyState = 2;
  replay.start();
  replay.one('#go2-play').emit('click');
  replay.external.bufferEnd = 150;
  replay.external.readyState = 4;
  replay.external.emit('canplay');
  await replay.advance(.5);
  assert.equal(replay.camera.paused, true);
  assert.equal(replay.external.paused, true);
  assert.equal(replay.one('#go2-player').attributes['aria-busy'], 'false');
});

test('临近片尾仅等待剩余录像，不要求固定缓存长度', async () => {
  const replay = setup();
  replay.camera.time = replay.external.time = 147;
  replay.start();
  await replay.advance(.2);
  assert.equal(replay.camera.paused, false);
  assert.equal(replay.external.paused, false);
});

test('Safari 确认能连续播放时，不因短缓存范围主动打断播放', async () => {
  const replay = setup();
  replay.external.bufferEnd = 2.4;
  replay.start();
  await replay.advance(6);
  assert.equal(replay.camera.paused, false);
  assert.equal(replay.external.paused, false);
  assert.equal(replay.one('#go2-player').attributes['aria-busy'], 'false');
});

test('原生全屏控件暂停相机后，实拍也停止并保持暂停', async () => {
  const replay = setup();
  replay.start();
  await replay.advance(.5);
  replay.camera.pause();
  await replay.advance(.5);
  assert.equal(replay.camera.paused, true);
  assert.equal(replay.external.paused, true);
});

test('缓冲已足够即开始播放，不再固定等待五秒', async () => {
  const cold = setup();
  cold.external.bufferEnd = 20;
  cold.start();
  await cold.advance(.2);
  assert.equal(cold.camera.paused, false);

  const cached = setup();
  cached.start();
  await cached.advance(.2);
  assert.equal(cached.camera.paused, false);
});


test('4× 轻量素材按正常速度解码，进度与节点仍为原速秒数', async () => {
  const replay = setup(4, true);
  assert.equal(replay.camera.src, 'robot-4x.mp4');
  assert.equal(replay.camera.playbackRate, 1);
  replay.start();
  await replay.advance(2);
  assert.ok(Number(replay.one('#go2-timeline').value) >= 6);
  replay.one('#go2-timeline').value = 80;
  replay.one('#go2-timeline').emit('input');
  assert.equal(replay.camera.currentTime, 20);
  assert.equal(replay.external.currentTime, 20);
});

test('4× 与 1× 来回切换保留时间、播放意图，暂停时不自动开播', async () => {
  const replay = setup(4, true);
  replay.start();
  await replay.advance(2);
  const time = replay.camera.currentTime * 4;
  replay.one('#go2-speed').value = 1;
  replay.one('#go2-speed').emit('change');
  assert.equal(replay.camera.src, 'robot.mp4');
  assert.equal(replay.camera.currentTime, time);
  await replay.advance(.5);
  assert.equal(replay.camera.paused, false);
  replay.one('#go2-play').emit('click');
  const pausedTime = replay.camera.currentTime;
  replay.one('#go2-speed').value = 4;
  replay.one('#go2-speed').emit('change');
  await replay.advance(.5);
  assert.equal(replay.camera.currentTime * 4, pausedTime);
  assert.equal(replay.camera.paused, true);
  assert.equal(replay.external.paused, true);
});


test('发布的 4× 素材必须来自当前原速文件，更新打码后不可继续使用旧衍生文件', () => {
  const { createHash } = require('node:crypto');
  const root = join(__dirname, '..');
  const runs = JSON.parse(readFileSync(join(root, 'media/go2/sessions.json'), 'utf8'));
  for (const run of Object.values(runs)) {
    for (const [view, sourceUrl, fastUrl] of [
      ['robot', run.video, run.playback4x.video],
      ['external', run.external.video, run.playback4x.externalVideo],
    ]) {
      const source = readFileSync(join(root, sourceUrl.split('?')[0]));
      assert.equal(createHash('sha256').update(source).digest('hex'), run.playback4x.sourceSha256[view]);
      const fast = readFileSync(join(root, fastUrl.split('?')[0]));
      assert.ok(fastUrl.endsWith(createHash('sha256').update(fast).digest('hex').slice(0, 12)));
    }
  }
});

test('加载失败显示重试提示，重试与取消不会丢失播放控制', async () => {
  const replay = setup(4, true);
  replay.start();
  await replay.advance(.2);
  replay.camera.emit('error');
  assert.equal(replay.one('#go2-error').hidden, false);
  assert.equal(replay.camera.paused, true);
  replay.start();
  await replay.advance(.2);
  assert.equal(replay.one('#go2-error').hidden, true);
  assert.equal(replay.camera.paused, false);
});


test('打开页面即预加载 Go2 4× 两路，保持暂停，点击不会重新下载', async () => {
  const replay = setup(4, true);
  assert.equal(replay.camera.preload, 'auto');
  assert.equal(replay.external.preload, 'auto');
  assert.equal(replay.camera.loadCount, 1);
  assert.equal(replay.external.loadCount, 1);
  await replay.advance(5);
  assert.equal(replay.camera.currentTime, 0);
  assert.equal(replay.camera.paused, true);
  assert.equal(replay.external.paused, true);
  replay.start();
  await replay.advance(.2);
  assert.equal(replay.camera.paused, false);
  assert.equal(replay.camera.loadCount, 1);
  assert.equal(replay.external.loadCount, 1);
});

test('预加载后起播的短暂解码差异，不触发跳转或暂停', async () => {
  const replay = setup(4, true);
  replay.start();
  await replay.advance(.1);
  replay.camera.time = .4;
  replay.external.time = 0;
  replay.camera.emit('timeupdate');
  assert.equal(replay.external.seekCount, 0);
  assert.equal(replay.camera.paused, false);
  replay.external.time = replay.camera.time;
  await replay.advance(.5);
  assert.equal(replay.external.seekCount, 0);
});
