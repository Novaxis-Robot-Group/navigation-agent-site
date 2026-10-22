"use strict";

const languageButton = document.querySelector(".language");
let language = "en";

// HTML 默认显示英文，中文保存在 data-zh 中。
function setLanguage(nextLanguage) {
  language = nextLanguage;
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  for (const element of document.querySelectorAll("[data-en]")) {
    element.textContent = element.dataset[language];
  }
  for (const element of document.querySelectorAll("[data-label-en]")) {
    element.setAttribute("aria-label", language === "en" ? element.dataset.labelEn : element.dataset.labelZh);
  }
  for (const element of document.querySelectorAll("[data-alt-en]")) {
    element.alt = language === "en" ? element.dataset.altEn : element.dataset.altZh;
  }
  languageButton.textContent = language === "zh" ? "EN" : "中文";
  languageButton.setAttribute("aria-label", language === "zh" ? "Switch to English" : "切换为中文");
  document.title = language === "zh"
    ? "Navigation Agent · 说出目标，让机器人自主寻找"
    : "Navigation Agent · Set the goal. Let your robot search.";
  document.querySelector('meta[name="description"]').content = language === "zh"
    ? "Navigation Agent 将自主探索与视觉语言导航（VLN）结合起来。描述你想找的东西，Agent 根据环境线索决定去哪里探索，再由 VLN 引导机器人前往。"
    : "Navigation Agent decides where to explore from visual clues and past observations, then uses vision-language navigation (VLN) to guide the robot there.";
  document.dispatchEvent(new CustomEvent("site-language-change", { detail: language }));
}

// 每次打开首页默认英文；切换按钮只改变本次页面语言。
languageButton.addEventListener("click", () => setLanguage(language === "zh" ? "en" : "zh"));

setLanguage(language);

// 导航换行或切换语言后，用实际高度为章节跳转留出空间。
const siteNavigation = document.querySelector('.site-navigation');
const navigationResizeObserver = new ResizeObserver(() => {
  document.documentElement.style.setProperty('--header-height', `${siteNavigation.offsetHeight}px`);
  scheduleNavigationUpdate();
});
navigationResizeObserver.observe(siteNavigation);

const sectionLinks = [...siteNavigation.querySelectorAll('a[href^="#"]')]
  .filter(link => link.hash.length > 1)
  .map(link => ({ link, section: document.querySelector(link.hash) }));
let navigationFrame = null;

function updateNavigation() {
  navigationFrame = null;
  siteNavigation.dataset.scrolled = String(window.scrollY > 8);
  const threshold = siteNavigation.offsetHeight + Math.min(160, window.innerHeight * .2);
  let currentLink = null;
  for (const { link, section } of sectionLinks) {
    if (section.getBoundingClientRect().top <= threshold) currentLink = link;
  }
  if (window.scrollY > 0 && window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2) {
    currentLink = sectionLinks.at(-1).link;
  }
  for (const { link } of sectionLinks) {
    if (link === currentLink) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

function scheduleNavigationUpdate() {
  if (navigationFrame === null) navigationFrame = requestAnimationFrame(updateNavigation);
}

window.addEventListener('scroll', scheduleNavigationUpdate, { passive: true });
window.addEventListener('resize', scheduleNavigationUpdate);
document.addEventListener('replay-tasks-ready', scheduleNavigationUpdate);
document.addEventListener('site-language-change', scheduleNavigationUpdate);
window.addEventListener('load', scheduleNavigationUpdate);
scheduleNavigationUpdate();

const initialTaskHash = location.hash;
let tasksReady = false;
let initialAnchorRestored = false;

function restoreTaskAnchor() {
  if (initialAnchorRestored || !tasksReady || document.readyState !== 'complete') return;
  initialAnchorRestored = true;
  // 等待页面恢复滚动位置后，再定位异步创建的任务。
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (location.hash !== initialTaskHash) return;
    const target = document.getElementById(initialTaskHash.slice(1));
    if (target?.hasAttribute('data-task')) {
      const selector = target.classList.contains('simulation-task') ? 'simulation-tabs' : 'go2-tabs';
      const anchor = document.getElementById(selector);
      anchor.scrollIntoView({ behavior: 'instant' });
    }
  }));
}

document.addEventListener('replay-tasks-ready', () => {
  tasksReady = true;
  restoreTaskAnchor();
});
window.addEventListener('load', restoreTaskAnchor);

function initializeIllustrationMotion(illustration) {
  const control = illustration.querySelector('.nav-motion-control');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let paused = false;
  let visible = false;

  function update() {
    const playing = !paused && visible && illustration.dataset.motionAllowed !== 'false' && !document.hidden && !reducedMotion.matches;
    illustration.dataset.motion = playing ? 'running' : 'paused';
    control.disabled = reducedMotion.matches;
    control.setAttribute('aria-pressed', String(paused));
    control.dataset.labelEn = paused ? 'Resume illustration' : 'Pause illustration';
    control.dataset.labelZh = paused ? '继续示意动效' : '暂停示意动效';
    control.setAttribute('aria-label', language === 'en' ? control.dataset.labelEn : control.dataset.labelZh);
  }

  control.addEventListener('click', () => {
    paused = !paused;
    update();
  });
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    update();
  });
  observer.observe(illustration);
  illustration.addEventListener('illustration-motion-change', update);
  reducedMotion.addEventListener('change', update);
  document.addEventListener('visibilitychange', update);
  update();
}

function initializeCapabilities() {
  const panels = [...document.querySelectorAll('.capability-panel')];
  const scenes = panels.map(panel => panel.querySelector('.capability-scene'));
  const compact = window.matchMedia('(max-width: 800px)');
  let motionFrame = null;

  function updateMotionFocus() {
    motionFrame = null;
    let nearest = null;
    let nearestDistance = Infinity;
    if (compact.matches) {
      const headerBottom = siteNavigation.getBoundingClientRect().bottom;
      const contentCenter = (headerBottom + window.innerHeight) / 2;
      for (const panel of panels) {
        const bounds = panel.getBoundingClientRect();
        if (bounds.bottom <= headerBottom || bounds.top >= window.innerHeight) continue;
        const distance = Math.abs((bounds.top + bounds.bottom) / 2 - contentCenter);
        if (distance < nearestDistance) {
          nearest = panel;
          nearestDistance = distance;
        }
      }
    }
    for (const panel of panels) {
      const allowed = String(!compact.matches || panel === nearest);
      if (panel.dataset.motionAllowed === allowed) continue;
      panel.dataset.motionAllowed = allowed;
      panel.dispatchEvent(new Event('illustration-motion-change'));
    }
  }

  function scheduleMotionFocus() {
    if (motionFrame === null) motionFrame = requestAnimationFrame(updateMotionFocus);
  }

  function updateSceneViewport() {
    for (const scene of scenes) {
      scene.setAttribute('viewBox', compact.matches ? '20 -10 680 440' : '0 0 720 420');
    }
    scheduleMotionFocus();
  }

  compact.addEventListener('change', updateSceneViewport);
  window.addEventListener('scroll', () => {
    if (compact.matches) scheduleMotionFocus();
  }, { passive: true });
  window.addEventListener('resize', scheduleMotionFocus);
  document.addEventListener('site-language-change', scheduleMotionFocus);
  document.addEventListener('replay-tasks-ready', scheduleMotionFocus);
  updateSceneViewport();
}

document.querySelectorAll('[data-illustration]').forEach(initializeIllustrationMotion);
initializeCapabilities();
