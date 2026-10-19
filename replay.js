"use strict";

const $ = selector => document.querySelector(selector);
let language = document.documentElement.lang === 'en' ? 'en' : 'zh';
document.addEventListener('site-language-change', event => { language = event.detail; });

const text = (zh, en) => language === "zh" ? zh : en;
const clock = (seconds) => {
  const total = Math.floor(Math.max(0, seconds || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
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
  const editedInstruction = node.sourceInstruction && node.sourceInstruction !== node.instruction;
  $("#instruction").hidden = !node.instruction;
  $("#instruction").textContent = node.instruction ? `VLN → ${node.instruction}` : "";
  $("#instruction").title = editedInstruction ? text("原始发送指令：", "Recorded instruction: ") + node.sourceInstruction : "";
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

// 控件查询限定在当前任务内；实际 ID 保持全页唯一，供无障碍标题引用。
function taskQueries(root) {
  const selector = value => value.replace(/#([\w-]+)/g, '[data-ref="$1"]');
  return {
    one: value => root.querySelector(selector(value)),
    all: value => root.querySelectorAll(selector(value)),
  };
}

function createTask(templateId, containerId, key, index, goal, goalEn) {
  const card = $(templateId).content.firstElementChild.cloneNode(true);
  card.id = key;
  const title = card.querySelector('[data-task-title]');
  title.id = `${key}-title`;
  card.setAttribute('aria-labelledby', title.id);
  title.dataset.zh = `Task ${index + 1} · ${goal}`;
  title.dataset.en = `Task ${index + 1} · ${goalEn}`;
  title.textContent = text(title.dataset.zh, title.dataset.en);
  for (const node of card.querySelectorAll('[data-ref]')) node.id = `${key}-${node.dataset.ref}`;
  for (const node of card.querySelectorAll('[aria-labelledby]')) {
    node.setAttribute('aria-labelledby', node.getAttribute('aria-labelledby').split(' ').map(id => `${key}-${id}`).join(' '));
  }
  $(containerId).append(card);
  // 数据可能在用户切换语言之后返回，插入时立即使用当前语言。
  for (const node of card.querySelectorAll('[data-en]')) node.textContent = text(node.dataset.zh, node.dataset.en);
  for (const node of card.querySelectorAll('[data-label-en]')) node.setAttribute('aria-label', text(node.dataset.labelZh, node.dataset.labelEn));
  return card;
}

// 每个 MuJoCo 任务独立维护视角、进度和倍速。
function initializeReplay(root, item) {
  const { one: $, all } = taskQueries(root);
  const video = $("#video");
  const timeline = $("#timeline");
  const player = $("#player");
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

  const currentTime = () => loading ? pendingTime : video.currentTime;
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
      // 快速切换视角或暂停会取消尚未完成的播放，不将取消显示为素材故障。
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
    all("#chapter-list .chapter-button").forEach((button, i) => {
      if (i === index) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    all(".timeline-segments span").forEach((segment, i) => segment.classList.toggle("passed", i <= index));
    $("#previous").disabled = index === 0;
    $("#next").disabled = index === session.nodes.length - 1;
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
  all("[data-baseline-view]").forEach(button => button.addEventListener("click", () => {
    if (!session?.baseline || baseline.view === button.dataset.baselineView) return;
    const time = baseline.loading ? baseline.time : baselineVideo.currentTime;
    const resume = baseline.wantPlay || !baselineVideo.paused;
    baseline.view = button.dataset.baselineView;
    all("[data-baseline-view]").forEach(option => option.setAttribute("aria-pressed", String(option === button)));
    renderBaselineText();
    loadBaseline(time, resume);
  }));
  function setLanguage(next) {
    language = next;
    if (session) { renderSessionText(); renderNodes(); }
    if (mediaFailed) showMediaError();
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
  all("[data-view]").forEach((button) => button.addEventListener("click", () => {
    if (!session || button.dataset.view === view) return;
    const time = currentTime();
    const playing = wantPlay || !video.paused;
    view = button.dataset.view;
    all("[data-view]").forEach((option) => option.setAttribute("aria-pressed", String(option === button)));
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

  if (item.edit?.kind === 'thinking_trim') {
    const label = element('span', 'replay-edit-label');
    label.dataset.zh = '精简回放';
    label.dataset.en = 'Edited replay';
    label.textContent = text(label.dataset.zh, label.dataset.en);
    $("#agent-title").append(label);
  }
  video.defaultPlaybackRate = video.playbackRate = Number($("#speed").value);
  baselineVideo.defaultPlaybackRate = baselineVideo.playbackRate = Number($("#baseline-speed").value);
  video.controls = baselineVideo.controls = false;
  selectSession(item, true);
}

// Go2 双视角共用展示时间轴；素材按采图时间恢复，再统一裁剪对齐。
function initializeGo2Replay(root, run) {
  const { one: $ } = taskQueries(root);
  const camera = $("#go2-video"), external = $("#go2-external-video");
  const controls = $("#go2-player");
  const chapters = $("#go2-chapters");
  let pending = 0, loading = false, wantsPlay = false, failed = false, externalFailed = false;
  let version = 0, rate = 4, externalTarget = 0;

  function currentTime() { return loading ? pending : camera.currentTime; }

  function syncExternal(force = false) {
    if (!run?.external) return;
    const time = currentTime(), start = run.external.start;
    const covered = time >= start && time <= start + run.external.duration + .02;
    const coverage = $("#go2-external-coverage");
    coverage.hidden = covered || externalFailed;
    coverage.textContent = time < start
      ? text(`实拍从 ${clock(start)} 开始`, `External recording starts at ${clock(start)}`)
      : text("实拍录像已结束", "External recording has ended");
    external.style.visibility = covered ? "visible" : "hidden";
    if (!external.readyState || externalFailed) return;
    externalTarget = Math.max(0, Math.min(time - start, external.duration - .05));
    if (force || Math.abs(external.currentTime - externalTarget) > .3) external.currentTime = externalTarget;
    external.playbackRate = rate;
    if (covered && !camera.paused && !camera.seeking && camera.readyState >= 3) {
      if (external.paused) external.play().catch(error => {
        if (error.name !== "AbortError" && error.name !== "NotAllowedError") showExternalError();
      });
    } else external.pause();
  }

  function update() {
    const time = currentTime(), playing = wantsPlay || !camera.paused;
    $("#go2-timeline").value = time;
    $("#go2-timeline").setAttribute("aria-valuetext", `${clock(time)} / ${clock(run?.duration)}`);
    $("#go2-elapsed").textContent = clock(time);
    $("#go2-duration").textContent = clock(run?.duration);
    $("#go2-play").textContent = playing ? "Ⅱ" : "▶";
    $("#go2-play").setAttribute("aria-label", playing ? text("暂停 Go2 双视角", "Pause Go2 views") : text("播放 Go2 双视角", "Play Go2 views"));
    let current = 0;
    run?.nodes.forEach((node, index) => { if (node.time <= time + .02) current = index; });
    chapters.querySelectorAll("button").forEach((button, index) => {
      if (index === current) {
        const changed = button.getAttribute("aria-current") !== "step";
        button.setAttribute("aria-current", "step");
        // 只滚动桌面节点栏，不带动整页；播放进入新节点时保持其可见。
        if (changed && chapters.scrollHeight > chapters.clientHeight) {
          const item = button.getBoundingClientRect();
          const list = chapters.getBoundingClientRect();
          if (item.top < list.top) chapters.scrollTop += item.top - list.top;
          else if (item.bottom > list.bottom) chapters.scrollTop += item.bottom - list.bottom;
        }
      } else button.removeAttribute("aria-current");
    });
    syncExternal();
  }

  function showExternalError() {
    if (!run?.external) return;
    externalFailed = true;
    external.pause();
    $("#go2-external-coverage").hidden = true;
    $("#go2-external-error").textContent = text("实拍录像无法加载，点击播放重试。", "External recording unavailable. Press play to retry.");
    $("#go2-external-error").hidden = false;
  }

  function showError() {
    if (!run) return;
    failed = true;
    loading = wantsPlay = false;
    camera.pause(); external.pause();
    $("#go2-error").textContent = text("录像无法加载，点击播放重试。", "Recording unavailable. Press play to retry.");
    $("#go2-error").hidden = false;
    update();
  }

  function loadExternal() {
    if (!run?.external) return;
    externalFailed = false;
    $("#go2-external-error").hidden = true;
    external.preload = "auto";
    external.load();
  }

  async function play() {
    const requestedVersion = version;
    wantsPlay = true;
    if (run?.external && (!external.readyState || externalFailed)) loadExternal();
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
    camera.pause(); external.pause();
    pending = time; loading = true; wantsPlay = resume; failed = false;
    $("#go2-error").hidden = true;
    camera.poster = run.poster;
    camera.preload = defer ? "none" : "metadata";
    camera.onloadedmetadata = () => {
      if (requestedVersion !== version) return;
      camera.currentTime = Math.min(pending, Math.max(0, camera.duration - .05));
      camera.playbackRate = rate;
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
    if (run.external && !external.readyState) loadExternal();
    if (loading || failed) load(pending, wantsPlay);
    else camera.currentTime = pending;
    syncExternal(true);
    update();
  }

  function toggle() {
    if (!run) return;
    if (failed) { load(pending, true); return; }
    if (!camera.paused || wantsPlay) {
      wantsPlay = false; camera.pause(); external.pause();
    } else {
      if (camera.ended) camera.currentTime = 0;
      play();
    }
    update();
  }

  function renderNodes() {
    hideNote(); chapters.replaceChildren();
    for (const [index, node] of (run?.nodes || []).entries()) {
      const item = element("li");
      item.append(createChapterButton(node, index, seekTo));
      chapters.append(item);
    }
    $("#go2-provenance").hidden = !run?.provenance;
    $("#go2-provenance").textContent = run ? text(run.provenanceZh || "", run.provenanceEn || "") : "";
    if (run?.edit?.kind === "thinking_trim") {
      $("#go2-provenance").textContent = text("精简回放 · ", "Edited replay · ") + $("#go2-provenance").textContent;
    }
    update();
  }

  function setupTask() {
    version++; camera.pause(); external.pause();
    camera.onloadedmetadata = null;
    pending = 0; loading = wantsPlay = failed = externalFailed = false;
    controls.hidden = !run;
    $("#go2-external-error").hidden = true;
    chapters.hidden = !run; $("#go2-empty").hidden = !!run;
    $("#go2-timeline").max = run?.duration || 1;
    $("#go2-speed").value = String(rate);
    external.preload = "none";
    if (run?.external) { external.src = run.external.video; external.poster = run.external.poster; }
    else { external.removeAttribute("src"); external.removeAttribute("poster"); external.load(); }
    if (run) load(0, false, true);
    else { camera.removeAttribute("src"); camera.removeAttribute("poster"); camera.load(); }
    renderNodes();
  }

  // 两个画面与键盘操作都使用同一套播放控件。
  $("#go2-play").addEventListener("click", toggle);
  for (const media of [camera, external]) media.addEventListener("click", toggle);
  $("#go2-timeline").addEventListener("input", event => seekTo(Number(event.target.value)));
  $("#go2-speed").addEventListener("change", event => {
    rate = Number(event.target.value);
    camera.playbackRate = external.playbackRate = rate;
  });
  $("#go2-fullscreen").addEventListener("click", async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (controls.requestFullscreen) await controls.requestFullscreen();
      else if (camera.webkitEnterFullscreen) camera.webkitEnterFullscreen();
    } catch { /* 不支持全屏时继续使用内联控件。 */ }
  });
  controls.tabIndex = 0;
  controls.addEventListener("keydown", event => {
    if (event.target.closest("button, input, select") || !run) return;
    if (event.code === "Space" || event.key.toLowerCase() === "k") { event.preventDefault(); toggle(); }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); seekTo(currentTime() + (event.key === "ArrowLeft" ? -5 : 5));
    }
  });
  camera.addEventListener("timeupdate", () => { if (!loading) pending = camera.currentTime; update(); });
  camera.addEventListener("play", update);
  camera.addEventListener("playing", update);
  camera.addEventListener("waiting", () => external.pause());
  camera.addEventListener("seeking", () => { external.pause(); syncExternal(true); });
  camera.addEventListener("seeked", update);
  camera.addEventListener("pause", () => { if (!loading) wantsPlay = false; update(); });
  camera.addEventListener("ended", () => { wantsPlay = false; update(); });
  camera.addEventListener("error", showError);
  external.addEventListener("loadedmetadata", () => syncExternal(true));
  external.addEventListener("canplay", () => syncExternal());
  external.addEventListener("error", showExternalError);
  document.addEventListener("site-language-change", () => {
    renderNodes();
    if (failed) showError();
    if (externalFailed) showExternalError();
  });
  for (const media of [camera, external]) {
    media.defaultPlaybackRate = media.playbackRate = rate;
    media.controls = false;
    media.muted = true;
  }
  setupTask();
}
async function initializeTasks() {
  await Promise.all([
    (async () => {
      try {
        const response = await fetch('./media/replays/sessions.json');
        if (!response.ok) throw new Error('Task data unavailable');
        const sessions = await response.json();
        if (!sessions.length) throw new Error('No recordings');
        sessions.forEach((item, index) => {
          const card = createTask('#simulation-template', '#simulation', `simulation-${item.slug}`, index, item.goal, item.goalEn);
          initializeReplay(card, item);
        });
      } catch {
        const error = $('#simulation-load-error');
        error.textContent = text(error.dataset.zh, error.dataset.en);
        error.hidden = false;
      }
    })(),
    (async () => {
      try {
        const response = await fetch('./media/go2/sessions.json', { cache: 'no-cache' });
        if (!response.ok) throw new Error('Go2 data unavailable');
        const recordings = await response.json();
        const tasks = [
          { key: 'bin', goal: '走到银色垃圾桶旁', goalEn: 'Walk to the silver trash bin' },
          { key: 'pantry', goal: '走到茶水间吧台', goalEn: 'Walk to the pantry counter' },
        ];
        tasks.forEach((task, index) => {
          const run = recordings[task.key] || null;
          const card = createTask('#go2-template', '#go2-tasks', `go2-${task.key}`, index, run?.goal || task.goal, run?.goalEn || task.goalEn);
          initializeGo2Replay(card, run);
        });
      } catch {
        const error = $('#go2-load-error');
        error.textContent = text(error.dataset.zh, error.dataset.en);
        error.hidden = false;
      }
    })(),
  ]);
  document.dispatchEvent(new CustomEvent('replay-tasks-ready'));
}
initializeTasks();
