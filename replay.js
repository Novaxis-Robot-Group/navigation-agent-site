"use strict";

const $ = (selector) => document.querySelector(selector);
const video = $("#video");
const timeline = $("#timeline");
const player = $("#player");
let language = document.documentElement.lang === "en" ? "en" : "zh";
let sessions = [];
let session = null;
let view = "first";
let activeNode = -1;
let sourceVersion = 0;
let pendingTime = 0;
let loading = false;
let wantPlay = false;
let hasStarted = false;
let mediaFailed = false;

const text = (zh, en) => language === "zh" ? zh : en;
const clock = (seconds) => {
  const total = Math.floor(Math.max(0, seconds || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const currentTime = () => loading ? pendingTime : video.currentTime;

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function showMediaError() {
  mediaFailed = true;
  wantPlay = false;
  loading = false;
  $("#media-error").textContent = text("录像无法加载。请检查素材文件，再点击播放重试。", "Recording unavailable. Check the media files, then press play to retry.");
  $("#media-error").hidden = false;
  updatePlayState();
}

async function playMedia() {
  const version = sourceVersion;
  try {
    await video.play();
  } catch (error) {
    // 快速换任务或暂停会取消尚未完成的播放，不将取消显示为素材故障。
    if (version !== sourceVersion || error.name === "AbortError") return;
    wantPlay = false;
    if (error.name !== "NotAllowedError") showMediaError();
    updatePlayState();
  }
}

function updatePlayState() {
  const playing = !video.paused || (loading && wantPlay);
  $("#toggle-play").textContent = playing ? "Ⅱ" : "▶";
  $("#toggle-play").setAttribute("aria-label", playing ? text("暂停", "Pause") : text("播放", "Play"));
  $("#stage-play").hidden = hasStarted || playing || mediaFailed;
}

function loadSource(time = 0, resume = false, defer = false) {
  sourceVersion += 1;
  const version = sourceVersion;
  video.pause();
  loading = true;
  pendingTime = time;
  wantPlay = resume;
  mediaFailed = false;
  $("#media-error").hidden = true;
  video.poster = view === "first" ? `./media/replays/${session.slug}/poster.jpg` : "";
  video.onloadedmetadata = () => {
    if (version !== sourceVersion) return;
    video.currentTime = Math.min(pendingTime, Math.max(0, video.duration - .05));
    loading = false;
    video.playbackRate = Number($("#speed").value);
    updateTime(video.currentTime);
    if (wantPlay) playMedia();
  };
  video.src = `./media/replays/${session.slug}/${view}.mp4`;
  video.preload = defer ? "none" : "metadata";
  if (!defer) video.load();
  updateTime(time);
  updatePlayState();
}

function togglePlay() {
  if (!session) return;
  if (mediaFailed) {
    hasStarted = true;
    loadSource(pendingTime, true);
    return;
  }
  if (!video.paused || wantPlay) {
    wantPlay = false;
    video.pause();
  } else {
    hasStarted = true;
    wantPlay = true;
    if (loading) {
      video.preload = "auto";
      // play() 保留当前用户手势，移动浏览器也可启动首次播放。
      playMedia();
    } else {
      if (video.ended) video.currentTime = 0;
      playMedia();
    }
  }
  updatePlayState();
}

function seek(time) {
  if (!session) return;
  hasStarted = true;
  const destination = Math.max(0, Math.min(time, session.duration - .05));
  if (loading || mediaFailed) loadSource(destination, wantPlay);
  else video.currentTime = Math.min(destination, video.duration - .05);
  updateTime(destination);
  updatePlayState();
}

function updateTime(time) {
  if (!session) return;
  timeline.value = time;
  timeline.setAttribute("aria-valuetext", `${clock(time)} / ${clock(session.duration)}`);
  $("#elapsed").textContent = clock(time);
  let index = 0;
  session.nodes.forEach((node, i) => { if (node.time <= time + .02) index = i; });
  if (index === activeNode) return;
  activeNode = index;
  const node = session.nodes[index];
  document.querySelectorAll(".chapter-button").forEach((button, i) => {
    if (i === index) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".timeline-segments span").forEach((segment, i) => segment.classList.toggle("passed", i <= index));
  $("#note-kind").textContent = language === "zh" ? node.label : node.labelEn;
  $("#note-time").textContent = clock(node.time);
  $("#note-text").textContent = language === "zh" ? node.reason : node.reasonEn;
  $("#instruction").hidden = !node.instruction;
  $("#instruction").textContent = node.instruction ? `VLN → ${node.instruction}` : "";
  $("#previous").disabled = index === 0;
  $("#next").disabled = index === session.nodes.length - 1;
}

function renderNodes() {
  $("#chapter-list").replaceChildren();
  $("#timeline-segments").replaceChildren();
  $("#timeline-markers").replaceChildren();
  session.nodes.forEach((node, index) => {
    const item = element("li");
    const button = element("button", "chapter-button");
    button.type = "button";
    button.append(element("span", "chapter-index", String(index + 1)), element("span", "chapter-title", language === "zh" ? node.label : node.labelEn), element("span", "chapter-time", clock(node.time)));
    button.addEventListener("click", () => seek(node.time));
    item.append(button);
    $("#chapter-list").append(item);
    const segment = element("span");
    segment.style.flex = String((session.nodes[index + 1]?.time ?? session.duration) - node.time);
    $("#timeline-segments").append(segment);
    const marker = element("span");
    marker.style.left = `${node.time / session.duration * 100}%`;
    $("#timeline-markers").append(marker);
  });
  $("#chapter-count").textContent = String(session.nodes.length);
  activeNode = -1;
  updateTime(currentTime());
}

function renderSessions() {
  $("#session-list").replaceChildren();
  sessions.forEach((item) => {
    const button = element("button", "session-button", language === "zh" ? item.goal : item.goalEn);
    button.type = "button";
    button.setAttribute("aria-pressed", String(item === session));
    button.addEventListener("click", () => { if (session !== item) selectSession(item); });
    $("#session-list").append(button);
  });
}

function renderSessionText() {
  $("#task-title").textContent = language === "zh" ? session.goal : session.goalEn;
  $("#baseline-task").textContent = language === "zh" ? session.goal : session.goalEn;
  $("#duration").textContent = clock(session.duration);
  $("#view-label").textContent = view === "first" ? text("第一视角", "FIRST PERSON") : text("第三视角", "THIRD PERSON");
}

function selectSession(item, initial = false) {
  session = item;
  hasStarted = false;
  activeNode = -1;
  timeline.max = item.duration;
  timeline.disabled = false;
  $("#toggle-play").disabled = false;
  renderSessionText();
  loadSource(0, false, initial);
  renderNodes();
  renderSessions();
  player.setAttribute("aria-busy", "false");
}

function setLanguage(next) {
  language = next;
  if (session) { renderSessionText(); renderNodes(); renderSessions(); }
  if (mediaFailed) showMediaError();
  if (!$("#data-error").hidden) showDataError();
  updatePlayState();
}

// 首页统一管理静态文案和语言偏好，回放只同步动态内容。
document.addEventListener("site-language-change", (event) => setLanguage(event.detail));
$("#toggle-play").addEventListener("click", togglePlay);
$("#stage-play").addEventListener("click", togglePlay);
video.addEventListener("click", togglePlay);
video.addEventListener("timeupdate", () => { if (!loading) updateTime(video.currentTime); });
video.addEventListener("play", () => { hasStarted = true; updatePlayState(); });
video.addEventListener("pause", () => {
  if (!loading) wantPlay = false;
  updatePlayState();
});
video.addEventListener("ended", () => { wantPlay = false; updatePlayState(); });
video.addEventListener("error", showMediaError);
timeline.addEventListener("input", () => seek(Number(timeline.value)));
$("#previous").addEventListener("click", () => seek(session.nodes[Math.max(0, activeNode - 1)].time));
$("#next").addEventListener("click", () => seek(session.nodes[Math.min(session.nodes.length - 1, activeNode + 1)].time));
$("#speed").addEventListener("change", () => { video.playbackRate = Number($("#speed").value); });
document.querySelectorAll("[data-view]").forEach((button) => button.addEventListener("click", () => {
  if (!session || button.dataset.view === view) return;
  const time = currentTime();
  const playing = wantPlay || !video.paused;
  view = button.dataset.view;
  document.querySelectorAll("[data-view]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
  renderSessionText();
  loadSource(time, playing);
}));
$("#fullscreen").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else if ($(".video-stage").requestFullscreen) await $(".video-stage").requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  } catch { /* 浏览器拒绝全屏时保留内联播放。 */ }
});
document.addEventListener("fullscreenchange", () => {
  // 全屏只显示画面时，启用原生控制条，保留暂停和拖动入口。
  video.controls = document.fullscreenElement === $(".video-stage");
});
player.addEventListener("keydown", (event) => {
  if (event.target.closest("button, input, select") || !session) return;
  if (event.code === "Space" || event.key.toLowerCase() === "k") { event.preventDefault(); togglePlay(); }
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); seek(currentTime() + (event.key === "ArrowLeft" ? -5 : 5)); }
});
player.tabIndex = 0;

function showDataError() {
  $("#data-error").textContent = text("任务数据未能加载，请刷新页面重试。", "Task data could not be loaded. Please reload the page.");
  $("#data-error").hidden = false;
  $("#task-title").textContent = text("任务数据暂不可用", "Task data unavailable");
  $("#stage-play").hidden = true;
  $("#result-label").hidden = true;
  player.setAttribute("aria-busy", "false");
}

async function initialize() {
  setLanguage(language);
  try {
    const response = await fetch("./media/replays/sessions.json");
    if (!response.ok) throw new Error("Task data unavailable");
    sessions = await response.json();
    if (!sessions.length) throw new Error("No recordings");
    // 原生控制条作为未增强时的后备；增强后统一使用带节点的时间轴。
    video.controls = false;
    selectSession(sessions[0], true);
  } catch { showDataError(); }
}
initialize();
