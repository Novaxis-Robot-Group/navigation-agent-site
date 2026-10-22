const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');

const source = readFileSync(join(__dirname, '..', 'replay.js'), 'utf8');
const selector = source.slice(source.indexOf('function initializeTaskSelector('), source.indexOf('function initializeGo2Replay('));

class Element {
  constructor(tag = 'div', className = '', content = '') {
    this.tag = tag;
    this.className = className;
    this.textContent = content;
    this.dataset = {};
    this.attributes = {};
    this.children = [];
    this.listeners = {};
    this.hidden = true;
  }
  append(...children) { this.children.push(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(type, callback) { this.listeners[type] = callback; }
  contains(target) { return this === target || this.children.some(child => child.contains(target)); }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
  click() { this.listeners.click(); }
  key(key) {
    const event = { key, prevented: false, preventDefault() { this.prevented = true; } };
    this.listeners.keydown(event);
    return event;
  }
}

function setup(hash = '#videos', group = 'simulation') {
  const tabs = new Element();
  const elements = new Map();
  const events = new Map();
  const location = { hash };
  const slugs = group === 'simulation' ? ['basketball', 'bed', 'fridge'] : ['bin', 'pantry'];
  const tasks = slugs.map(slug => {
    const card = new Element();
    card.id = `${group}-${slug}`;
    const child = new Element();
    child.id = `${card.id}-video`;
    card.append(child);
    elements.set(card.id, card);
    elements.set(child.id, child);
    return {
      item: { slug, goal: `中文 ${slug}`, goalEn: `English ${slug}` },
      poster: `./media/${group === 'simulation' ? 'replays' : 'go2'}/${slug}/cover.jpg`,
      card,
      playback: { pauses: 0, pause() { this.pauses++; } },
    };
  });
  const context = vm.createContext({
    $: () => tabs,
    element: (tag, className, content) => new Element(tag, className, content),
    text: (chinese, english) => english,
    hideNote() {},
    document: { getElementById: id => elements.get(id) },
    window: { addEventListener: (type, callback) => events.set(type, callback) },
    location,
  });
  vm.runInContext(selector, context);
  context.initializeTaskSelector(`#${group}-tabs`, tasks);
  return { tabs, tasks, location, events, buttons: tabs.children };
}

test('default selection exposes one accessible panel and real target thumbnails', () => {
  const { tabs, tasks, buttons } = setup();
  assert.equal(tabs.hidden, false);
  assert.deepEqual(tasks.map(task => task.card.hidden), [false, true, true]);
  assert.deepEqual(buttons.map(button => button.tabIndex), [0, -1, -1]);
  for (const [index, button] of buttons.entries()) {
    assert.equal(button.attributes.role, 'tab');
    assert.equal(button.attributes['aria-controls'], tasks[index].card.id);
    assert.equal(tasks[index].card.attributes['aria-labelledby'], button.id);
    assert.equal(button.children[0].children[0].src, `./media/replays/${tasks[index].item.slug}/cover.jpg`);
    assert.equal(button.children[1].children[1].dataset.zh, tasks[index].item.goal);
  }
});

test('switching pauses only the previous task without changing the URL', () => {
  const { tasks, buttons, location } = setup();
  buttons[1].click();
  assert.deepEqual(tasks.map(task => task.card.hidden), [true, false, true]);
  assert.deepEqual(tasks.map(task => task.playback.pauses), [1, 0, 0]);
  buttons[1].click();
  assert.equal(tasks[1].playback.pauses, 0);
  buttons[0].click();
  assert.equal(tasks[1].playback.pauses, 1);
  assert.equal(location.hash, '#videos');
});

test('Go2 uses a single final robot-camera frame and a separate two-task selection', () => {
  const { tasks, buttons, location } = setup('#go2-pantry', 'go2');
  assert.deepEqual(tasks.map(task => task.card.hidden), [true, false]);
  assert.equal(buttons[1].attributes['aria-selected'], 'true');
  assert.equal(buttons[0].children[0].children.length, 1);
  assert.equal(buttons[0].children[0].children[0].src, tasks[0].poster);
  buttons[1].key('ArrowRight');
  assert.deepEqual(tasks.map(task => task.card.hidden), [false, true]);
  assert.equal(tasks[1].playback.pauses, 1);
  assert.equal(location.hash, '#go2-pantry');
});

test('Go2 covers exist and use frames after the recorded completion check', () => {
  const sessions = JSON.parse(readFileSync(join(__dirname, '..', 'media/go2/sessions.json'), 'utf8'));
  for (const run of Object.values(sessions)) {
    const finish = run.nodes.findLast(node => node.action === 'finish');
    assert.ok(run.coverTime >= finish.time && run.coverTime < run.duration);
    const cover = readFileSync(join(__dirname, '..', run.cover));
    assert.equal(cover.subarray(0, 3).toString('hex'), 'ffd8ff');
  }
});

test('keyboard arrows wrap, Home and End select, unrelated keys stay native', () => {
  const { buttons } = setup();
  assert.equal(buttons[0].key('ArrowLeft').prevented, true);
  assert.equal(buttons[2].attributes['aria-selected'], 'true');
  assert.equal(buttons[2].focused, true);
  buttons[2].key('ArrowRight');
  assert.equal(buttons[0].attributes['aria-selected'], 'true');
  buttons[0].key('End');
  assert.equal(buttons[2].attributes['aria-selected'], 'true');
  buttons[2].key('Home');
  assert.equal(buttons[0].attributes['aria-selected'], 'true');
  assert.equal(buttons[0].key('Tab').prevented, false);
});

test('initial task and descendant anchors reveal the matching panel', () => {
  for (const hash of ['#simulation-bed', '#simulation-bed-video']) {
    const { tasks, buttons } = setup(hash);
    assert.deepEqual(tasks.map(task => task.card.hidden), [true, false, true]);
    assert.equal(buttons[1].attributes['aria-selected'], 'true');
  }
});

test('selected cards remain visible inside the mobile scroll strip', () => {
  const { tabs, buttons } = setup();
  tabs.scrollWidth = 752;
  tabs.clientWidth = 343;
  tabs.getBoundingClientRect = () => ({ left: 0, right: 343 });
  buttons[2].getBoundingClientRect = () => ({ left: 508, right: 748 });
  tabs.scrollBy = options => { tabs.scrolledBy = options.left; };
  buttons[2].click();
  assert.equal(tabs.scrolledBy, 409);
});

test('hash changes reveal a task and scroll to its selector, other sections do not switch', () => {
  const { tasks, tabs, events, location } = setup();
  location.hash = '#simulation-fridge';
  events.get('hashchange')();
  assert.deepEqual(tasks.map(task => task.card.hidden), [true, true, false]);
  assert.equal(tabs.scrolled, true);
  location.hash = '#go2-bin';
  events.get('hashchange')();
  assert.equal(tasks[2].card.hidden, false);
});
