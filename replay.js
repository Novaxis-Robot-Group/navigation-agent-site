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
let mediaFailed = false;
const baselineVideo = $("#baseline-video");
const baseline = { view: "first", time: 0, loading: false, wantPlay: false, failed: false, version: 0 };

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
    loadSource(pendingTime, true);
    return;
  }
  if (!video.paused || wantPlay) {
    wantPlay = false;
    video.pause();
  } else {
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
  document.querySelectorAll("#chapter-list .chapter-button").forEach((button, i) => {
    if (i === index) button.setAttribute("aria-current", "step");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".timeline-segments span").forEach((segment, i) => segment.classList.toggle("passed", i <= index));
  $("#previous").disabled = index === 0;
  $("#next").disabled = index === session.nodes.length - 1;
}

// 详情按需贴着节点展示，不占用列表高度；靠近窗口边缘时自动换边。
const note = $("#decision-note");
let noteAnchor = null;
let notePinned = false;
let noteCloseTimer;

function hideNote() {
  clearTimeout(noteCloseTimer);
  if (noteAnchor) {
    noteAnchor.setAttribute("aria-expanded", "false");
    noteAnchor.removeAttribute("aria-describedby");
  }
  note.hidden = true;
  noteAnchor = null;
  notePinned = false;
}

function positionNote() {
  if (!noteAnchor || note.hidden) return;
  const anchor = noteAnchor.getBoundingClientRect();
  const gap = 14;
  const edge = 16;
  const width = note.offsetWidth;
  const height = note.offsetHeight;
  let left;
  let top;
  let side;
  if (innerWidth > 600 && anchor.right + gap + width <= innerWidth - edge) {
    side = "right";
    left = anchor.right + gap;
    top = anchor.top + anchor.height / 2 - height / 2;
  } else if (innerWidth > 600 && anchor.left - gap - width >= edge) {
    side = "left";
    left = anchor.left - gap - width;
    top = anchor.top + anchor.height / 2 - height / 2;
  } else {
    side = anchor.bottom + gap + height <= innerHeight - edge ? "bottom" : "top";
    left = anchor.left + anchor.width / 2 - width / 2;
    top = side === "bottom" ? anchor.bottom + gap : anchor.top - gap - height;
  }
  left = Math.max(edge, Math.min(left, innerWidth - width - edge));
  top = Math.max(edge, Math.min(top, innerHeight - height - edge));
  note.style.left = `${left}px`;
  note.style.top = `${top}px`;
  note.dataset.side = side;
  const arrow = side === "left" || side === "right"
    ? Math.max(20, Math.min(anchor.top + anchor.height / 2 - top, height - 20))
    : Math.max(20, Math.min(anchor.left + anchor.width / 2 - left, width - 20));
  note.style.setProperty("--arrow-position", `${arrow}px`);
}

function showNote(button, node) {
  hideNote();
  noteAnchor = button;
  $("#note-kind").textContent = language === "zh" ? node.label : node.labelEn;
  $("#note-time").textContent = clock(node.time);
  $("#note-text").textContent = language === "zh" ? node.reason : node.reasonEn;
  $("#instruction").hidden = !node.instruction;
  $("#instruction").textContent = node.instruction ? `VLN → ${node.instruction}` : "";
  note.hidden = false;
  button.setAttribute("aria-expanded", "true");
  button.setAttribute("aria-describedby", "note-text");
  positionNote();
}

function scheduleNoteClose() {
  clearTimeout(noteCloseTimer);
  noteCloseTimer = setTimeout(() => {
    if (!notePinned && document.activeElement !== noteAnchor && !note.contains(document.activeElement)) hideNote();
  }, 150);
}

note.addEventListener("pointerenter", () => clearTimeout(noteCloseTimer));
note.addEventListener("pointerleave", scheduleNoteClose);
note.addEventListener("focusout", scheduleNoteClose);
$("#close-note").addEventListener("click", () => {
  const anchor = noteAnchor;
  anchor?.focus();
  hideNote();
});
document.addEventListener("pointerdown", (event) => {
  if (!note.contains(event.target) && !event.target.closest(".chapter-button")) hideNote();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !note.hidden) {
    const anchor = noteAnchor;
    if (note.contains(document.activeElement)) anchor?.focus();
    hideNote();
  }
});
window.addEventListener("resize", hideNote);
window.addEventListener("scroll", hideNote, { passive: true });

function createChapterButton(node, index, onSeek) {
  const button = element("button", "chapter-button");
  button.type = "button";
  button.append(element("span", "chapter-index", String(index + 1)), element("span", "chapter-title", language === "zh" ? node.label : node.labelEn), element("span", "chapter-time", clock(node.time)));
  button.setAttribute("aria-controls", "decision-note");
  button.setAttribute("aria-expanded", "false");
  button.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse" && !notePinned) showNote(button, node);
  });
  button.addEventListener("pointerleave", scheduleNoteClose);
  button.addEventListener("focus", () => showNote(button, node));
  button.addEventListener("blur", scheduleNoteClose);
  button.addEventListener("click", () => {
    onSeek(node.time);
    showNote(button, node);
    notePinned = true;
  });
  return button;
}

function renderNodes() {
  hideNote();
  $("#chapter-list").replaceChildren();
  $("#timeline-segments").replaceChildren();
  $("#timeline-markers").replaceChildren();
  session.nodes.forEach((node, index) => {
    const item = element("li");
    const button = createChapterButton(node, index, seek);
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
  video.setAttribute("aria-label", text("Agent 录像：", "Agent recording: ") + (language === "zh" ? session.goal : session.goalEn));
  renderBaselineText();
  $("#duration").textContent = clock(session.duration);
}

function selectSession(item, initial = false) {
  session = item;
  activeNode = -1;
  timeline.max = item.duration;
  timeline.disabled = false;
  $("#toggle-play").disabled = false;
  selectBaseline();
  renderSessionText();
  loadSource(0, false, initial);
  renderNodes();
  renderSessions();
  player.setAttribute("aria-busy", "false");
}

function renderBaselineText() {
  const run = session.baseline;
  baselineVideo.title = run ? text("原始指令：", "Recorded instruction: ") + run.instruction : "";
  $("#baseline-duration").textContent = clock(run?.duration);
  if (baseline.failed) baselineError();
  updateBaselineState();
}

function updateBaselineState() {
  const playing = !baselineVideo.paused || baseline.wantPlay;
  $("#baseline-play").textContent = playing ? "Ⅱ" : "▶";
  $("#baseline-play").setAttribute("aria-label", playing ? text("暂停 VLN", "Pause VLN") : text("播放 VLN", "Play VLN"));
  const time = baseline.loading ? baseline.time : baselineVideo.currentTime;
  $("#baseline-timeline").value = time;
  $("#baseline-elapsed").textContent = clock(time);
}

function baselineError() {
  baseline.failed = true;
  baseline.loading = baseline.wantPlay = false;
  $("#baseline-error").textContent = text("录像无法加载，点击播放重试。", "Recording unavailable. Press play to retry.");
  $("#baseline-error").hidden = false;
}

function loadBaseline(time = 0, resume = false, defer = false) {
  const version = ++baseline.version;
  baselineVideo.pause();
  baseline.loading = true;
  baseline.time = time;
  baseline.wantPlay = resume;
  baseline.failed = false;
  $("#baseline-error").hidden = true;
  baselineVideo.poster = baseline.view === "first" ? `./media/replays/${session.slug}/vln/poster.jpg` : "";
  baselineVideo.onloadedmetadata = () => {
    if (version !== baseline.version) return;
    baselineVideo.currentTime = Math.min(baseline.time, Math.max(0, baselineVideo.duration - .05));
    baseline.loading = false;
    baselineVideo.playbackRate = Number($("#baseline-speed").value);
    if (baseline.wantPlay) playBaseline();
    updateBaselineState();
  };
  baselineVideo.preload = defer ? "none" : "metadata";
  baselineVideo.src = `./media/replays/${session.slug}/vln/${baseline.view}.mp4`;
  if (!defer) baselineVideo.load();
  updateBaselineState();
}

async function playBaseline() {
  const version = baseline.version;
  baseline.wantPlay = true;
  try { await baselineVideo.play(); }
  catch (error) {
    if (version !== baseline.version || error.name === "AbortError") return;
    baseline.wantPlay = false;
    if (error.name !== "NotAllowedError") baselineError();
  }
  updateBaselineState();
}

function toggleBaseline() {
  if (!session?.baseline) return;
  if (baseline.failed) { loadBaseline(baseline.time, true); return; }
  if (!baselineVideo.paused || baseline.wantPlay) {
    baseline.wantPlay = false;
    baselineVideo.pause();
  } else {
    if (baselineVideo.ended) baselineVideo.currentTime = 0;
    playBaseline();
  }
  updateBaselineState();
}

function selectBaseline() {
  baseline.version++;
  baselineVideo.pause();
  Object.assign(baseline, { time: 0, failed: false, wantPlay: false, loading: false });
  const available = !!session.baseline;
  $("#baseline-placeholder").hidden = available;
  $("#baseline-empty-status").hidden = available;
  $("#baseline-stage").hidden = !available;
  $("#baseline-transport").hidden = !available;
  $("#baseline-timeline").max = session.baseline?.duration || 1;
  if (available) loadBaseline(0, false, true);
  else { baselineVideo.onloadedmetadata = null; baselineVideo.removeAttribute("src"); baselineVideo.load(); }
}

$("#baseline-play").addEventListener("click", toggleBaseline);
baselineVideo.addEventListener("click", toggleBaseline);
baselineVideo.addEventListener("timeupdate", () => {
  if (!baseline.loading) baseline.time = baselineVideo.currentTime;
  updateBaselineState();
});
baselineVideo.addEventListener("play", updateBaselineState);
baselineVideo.addEventListener("pause", () => { if (!baseline.loading) baseline.wantPlay = false; updateBaselineState(); });
baselineVideo.addEventListener("ended", () => { baseline.wantPlay = false; updateBaselineState(); });
baselineVideo.addEventListener("error", () => { if (session?.baseline) { baselineError(); updateBaselineState(); } });
$("#baseline-timeline").addEventListener("input", () => {
  const time = Number($("#baseline-timeline").value);
  if (baseline.loading || baseline.failed) loadBaseline(time, baseline.wantPlay);
  else baselineVideo.currentTime = time;
});
document.querySelectorAll("[data-baseline-view]").forEach(button => button.addEventListener("click", () => {
  if (!session?.baseline || baseline.view === button.dataset.baselineView) return;
  const time = baseline.loading ? baseline.time : baselineVideo.currentTime;
  const resume = baseline.wantPlay || !baselineVideo.paused;
  baseline.view = button.dataset.baselineView;
  document.querySelectorAll("[data-baseline-view]").forEach(option => option.setAttribute("aria-pressed", String(option === button)));
  renderBaselineText();
  loadBaseline(time, resume);
}));
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
video.addEventListener("click", togglePlay);
video.addEventListener("timeupdate", () => { if (!loading) updateTime(video.currentTime); });
video.addEventListener("play", updatePlayState);
video.addEventListener("pause", () => {
  if (!loading) wantPlay = false;
  updatePlayState();
});
video.addEventListener("ended", () => { wantPlay = false; updatePlayState(); });
video.addEventListener("error", showMediaError);
timeline.addEventListener("input", () => seek(Number(timeline.value)));
$("#previous").addEventListener("click", () => seek(session.nodes[Math.max(0, activeNode - 1)].time));
$("#next").addEventListener("click", () => seek(session.nodes[Math.min(session.nodes.length - 1, activeNode + 1)].time));
$("#speed").addEventListener("change", () => {
  video.playbackRate = Number($("#speed").value);
});
$("#baseline-speed").addEventListener("change", () => {
  baselineVideo.playbackRate = Number($("#baseline-speed").value);
});
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
    else if ($("#player .video-stage").requestFullscreen) await $("#player .video-stage").requestFullscreen();
    else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
  } catch { /* 浏览器拒绝全屏时保留内联播放。 */ }
});
document.addEventListener("fullscreenchange", () => {
  // 全屏只显示画面时，启用原生控制条，保留暂停和拖动入口。
  video.controls = document.fullscreenElement === $("#player .video-stage");
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
    video.defaultPlaybackRate = video.playbackRate = Number($("#speed").value);
    baselineVideo.defaultPlaybackRate = baselineVideo.playbackRate = Number($("#baseline-speed").value);
    video.controls = false;
    baselineVideo.controls = false;
    selectSession(sessions.find(item => item.baseline) || sessions[0], true);
  } catch { showDataError(); }
}
initialize();


// Go2 使用独立播放状态，共用节点气泡；任务切换不会改变 MuJoCo 回放。
async function initializeGo2Replay() {
  const camera = $("#go2-video");
  const controls = $("#go2-player");
  const progress = $("#go2-timeline");
  const chapters = $("#go2-chapters");
  const speed = $("#go2-speed");
  const tasks = [...document.querySelectorAll("[data-go2-task]")];
  let recordings = {};
  let run = null;
  let selected = "bin";
  let pending = 0;
  let loading = false;
  let wantsPlay = false;
  let failed = false;
  let version = 0;

  function update() {
    const time = loading ? pending : camera.currentTime;
    progress.value = time;
    progress.setAttribute("aria-valuetext", `${clock(time)} / ${clock(run?.duration)}`);
    $("#go2-elapsed").textContent = clock(time);
    $("#go2-duration").textContent = clock(run?.duration);
    const playing = wantsPlay || !camera.paused;
    $("#go2-play").textContent = playing ? "Ⅱ" : "▶";
    $("#go2-play").setAttribute("aria-label", playing ? text("暂停 Go2 录像", "Pause Go2 recording") : text("播放 Go2 录像", "Play Go2 recording"));
    let current = 0;
    run?.nodes.forEach((node, index) => { if (node.time <= time + .02) current = index; });
    chapters.querySelectorAll("button").forEach((button, index) => {
      if (index === current) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
  }

  function showError() {
    if (!run) return;
    failed = true;
    loading = wantsPlay = false;
    $("#go2-error").textContent = text("录像无法加载，点击播放重试。", "Recording unavailable. Press play to retry.");
    $("#go2-error").hidden = false;
    update();
  }

  async function play() {
    const requestedVersion = version;
    wantsPlay = true;
    update();
    try { await camera.play(); }
    catch (error) {
      if (requestedVersion !== version || error.name === "AbortError") return;
      wantsPlay = false;
      if (error.name !== "NotAllowedError") showError();
      update();
    }
  }

  function load(time = 0, resume = false, defer = false) {
    const requestedVersion = ++version;
    camera.pause();
    pending = time;
    loading = true;
    wantsPlay = resume;
    failed = false;
    $("#go2-error").hidden = true;
    camera.poster = run.poster;
    camera.preload = defer ? "none" : "metadata";
    camera.onloadedmetadata = () => {
      if (requestedVersion !== version) return;
      camera.currentTime = Math.min(pending, Math.max(0, camera.duration - .05));
      camera.playbackRate = Number(speed.value);
      loading = false;
      update();
      if (wantsPlay) play();
    };
    camera.src = run.video;
    if (!defer) camera.load();
    update();
  }

  function seekTo(time) {
    if (!run) return;
    pending = Math.max(0, Math.min(time, run.duration - .05));
    if (loading || failed) load(pending, wantsPlay);
    else camera.currentTime = pending;
    update();
  }

  function toggle() {
    if (!run) return;
    if (failed) { load(pending, true); return; }
    if (!camera.paused || wantsPlay) {
      wantsPlay = false;
      camera.pause();
    } else {
      if (camera.ended) camera.currentTime = 0;
      play();
    }
    update();
  }

  function renderNodes() {
    hideNote();
    chapters.replaceChildren();
    for (const [index, node] of (run?.nodes || []).entries()) {
      const item = element("li");
      item.append(createChapterButton(node, index, seekTo));
      chapters.append(item);
    }
    update();
  }

  function selectTask(key) {
    version++;
    camera.pause();
    camera.onloadedmetadata = null;
    selected = key;
    run = recordings[key] || null;
    pending = 0;
    loading = wantsPlay = failed = false;
    tasks.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.go2Task === key)));
    controls.hidden = !run;
    $("#go2-placeholder").hidden = !!run;
    chapters.hidden = !run;
    $("#go2-empty").hidden = !!run;
    progress.max = run?.duration || 1;
    if (run) load(0, false, true);
    else { camera.removeAttribute("src"); camera.removeAttribute("poster"); camera.load(); }
    renderNodes();
  }

  tasks.forEach(button => button.addEventListener("click", () => {
    if (selected !== button.dataset.go2Task) selectTask(button.dataset.go2Task);
  }));
  $("#go2-play").addEventListener("click", toggle);
  camera.addEventListener("click", toggle);
  camera.addEventListener("timeupdate", () => { if (!loading) pending = camera.currentTime; update(); });
  camera.addEventListener("play", update);
  camera.addEventListener("pause", () => { if (!loading) wantsPlay = false; update(); });
  camera.addEventListener("ended", () => { wantsPlay = false; update(); });
  camera.addEventListener("error", showError);
  progress.addEventListener("input", () => seekTo(Number(progress.value)));
  speed.addEventListener("change", () => { camera.playbackRate = Number(speed.value); });
  $("#go2-fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (camera.parentElement.requestFullscreen) await camera.parentElement.requestFullscreen();
      else if (camera.webkitEnterFullscreen) camera.webkitEnterFullscreen();
    } catch { /* 不支持全屏时继续使用内联控件。 */ }
  });
  document.addEventListener("fullscreenchange", () => { camera.controls = document.fullscreenElement === camera.parentElement; });
  controls.tabIndex = 0;
  controls.addEventListener("keydown", event => {
    if (event.target.closest("button, input, select") || !run) return;
    if (event.code === "Space" || event.key.toLowerCase() === "k") { event.preventDefault(); toggle(); }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      seekTo((loading ? pending : camera.currentTime) + (event.key === "ArrowLeft" ? -5 : 5));
    }
  });
  document.addEventListener("site-language-change", () => {
    renderNodes();
    if (failed) showError();
    if (!$("#go2-data-error").hidden) showDataError();
  });
  function showDataError() {
    $("#go2-empty").hidden = true;
    $("#go2-data-error").textContent = text("任务数据未能加载，请刷新重试。", "Task data could not be loaded. Please reload.");
    $("#go2-data-error").hidden = false;
  }
  try {
    const response = await fetch("./media/go2/sessions.json");
    if (!response.ok) throw new Error("Go2 data unavailable");
    recordings = await response.json();
    camera.defaultPlaybackRate = camera.playbackRate = Number(speed.value);
    camera.controls = false;
    selectTask(selected);
  } catch { showDataError(); }
}
initializeGo2Replay();
