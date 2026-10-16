"use strict";

const translatedElements = [...document.querySelectorAll("[data-en]")];
const languageButton = document.querySelector(".language");
let language = "en";

// HTML 默认显示英文，中文保存在 data-zh 中。
function setLanguage(nextLanguage) {
  language = nextLanguage;
  document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  for (const element of translatedElements) {
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
  updateGo2Goal();
  document.dispatchEvent(new CustomEvent("site-language-change", { detail: language }));
}

// 待录制任务只切换展示目标，不连接机器人或生成回放数据。
const go2Tasks = [...document.querySelectorAll("[data-go2-task]")];
function updateGo2Goal() {
  const selected = go2Tasks.find(button => button.getAttribute("aria-pressed") === "true");
  for (const heading of document.querySelectorAll(".go2-goal")) {
    heading.textContent = language === "zh" ? selected.dataset.goalZh : selected.dataset.goalEn;
  }
}
for (const button of go2Tasks) {
  button.addEventListener("click", () => {
    for (const task of go2Tasks) task.setAttribute("aria-pressed", String(task === button));
    updateGo2Goal();
  });
}

// 每次打开首页默认英文；切换按钮只改变本次页面语言。
languageButton.addEventListener("click", () => setLanguage(language === "zh" ? "en" : "zh"));

setLanguage(language);
