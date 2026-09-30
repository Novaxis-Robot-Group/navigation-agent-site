"use strict";

// 配置真实素材后才显示播放器；未配置时只保留文字说明。
const videos = {
  main: null,
  simulation: null,
  robot: null,
  // 格式：{ src: "./media/demo.mp4", poster: "./media/demo.jpg" }
};

const translatedElements = [...document.querySelectorAll("[data-en]")];
const languageButton = document.querySelector(".language");
let language = "zh";

// HTML 保留中文正文，关闭脚本也能阅读和访问链接。
for (const element of translatedElements) {
  element.dataset.zh = element.textContent;
}

function videoErrorText() {
  return language === "zh"
    ? "视频暂时无法加载，请稍后重试。"
    : "The video could not be loaded. Please try again later.";
}

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
    ? "Navigation Agent · 告诉机器人，你想找什么"
    : "Navigation Agent · Tell your robot what you want to find";
  document.querySelector('meta[name="description"]').content = language === "zh"
    ? "Navigation Agent 是一个面向机器人的自主导航 Agent。说出你想找的东西，让机器人观察周围、探索空间，寻找目标。"
    : "Tell your robot what to find. Navigation Agent guides it to observe, explore, and search for your target.";
  for (const error of document.querySelectorAll(".video-error")) {
    error.textContent = videoErrorText();
  }
  try {
    localStorage.setItem("navigation-agent-language", language);
  } catch {
    // 无法保存偏好时，仍允许本次切换。
  }
}

languageButton.addEventListener("click", () => setLanguage(language === "zh" ? "en" : "zh"));

for (const [slot, source] of Object.entries(videos)) {
  if (!source) continue;
  const container = document.querySelector(`[data-video-slot="${slot}"]`);
  const video = document.createElement("video");
  video.controls = true;
  video.playsInline = true;
  video.preload = "none";
  video.src = source.src;
  if (source.poster) video.poster = source.poster;
  const heading = container.querySelector("h3");
  heading.id = `video-title-${slot}`;
  video.setAttribute("aria-labelledby", heading.id);
  video.addEventListener("error", () => {
    if (container.querySelector(".video-error")) return;
    const error = document.createElement("p");
    error.className = "video-error";
    error.setAttribute("role", "status");
    error.textContent = videoErrorText();
    container.append(error);
  });
  container.append(video);
}

try {
  if (localStorage.getItem("navigation-agent-language") === "en") language = "en";
} catch {
  // 默认使用中文。
}
setLanguage(language);
