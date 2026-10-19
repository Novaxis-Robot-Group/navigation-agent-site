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
});
navigationResizeObserver.observe(siteNavigation);

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
    if (target?.hasAttribute('data-task')) target.scrollIntoView({ behavior: 'instant' });
  }));
}

document.addEventListener('replay-tasks-ready', () => {
  tasksReady = true;
  restoreTaskAnchor();
});
window.addEventListener('load', restoreTaskAnchor);
