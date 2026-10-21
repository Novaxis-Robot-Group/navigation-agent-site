// 仅由测试预览注入，记录真实浏览器的首播与缓冲情况。
(() => {
  const records = {};
  const started = performance.now();
  let lastSample = 0;
  const now = () => (performance.now() - started) / 1000;
  function videos(task) {
    return Array.from(task.querySelectorAll('video')).map(video => {
      let ahead = 0;
      for (let i = 0; i < video.buffered.length; i++) {
        if (video.buffered.start(i) <= video.currentTime + .1 && video.buffered.end(i) >= video.currentTime) {
          ahead = video.buffered.end(i) - video.currentTime;
        }
      }
      const quality = video.getVideoPlaybackQuality?.();
      return {
        view: video.dataset.ref, time: video.currentTime, duration: video.duration, paused: video.paused,
        scale: video.currentSrc.includes('-4x.mp4') ? 4 : 1, source: video.currentSrc,
        seeking: video.seeking, ready: video.readyState, ahead,
        rate: video.playbackRate, frames: quality?.totalVideoFrames,
        dropped: quality?.droppedVideoFrames,
      };
    });
  }
  function publish() {
    fetch('/__playback_results', {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ agent: navigator.userAgent, records }),
    }).catch(() => {});
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-ref="go2-play"]');
    if (!button) return;
    const task = button.closest('.go2-task');
    records[task.id] ||= { clicked: now(), events: [], samples: [] };
    publish();
  }, true);
  for (const type of ['playing', 'waiting', 'seeking', 'seeked', 'pause', 'ended', 'error']) {
    document.addEventListener(type, event => {
      const video = event.target;
      if (!video.matches?.('.go2-task video')) return;
      const task = video.closest('.go2-task');
      if (!records[task.id]) return;
      records[task.id].events.push({type, at: now(), view: video.dataset.ref, time: video.currentTime});
      publish();
    }, true);
  }
  setInterval(() => {
    for (const [id, record] of Object.entries(records)) {
      const task = document.getElementById(id);
      const media = videos(task);
      record.samples.push({ at: now(), media });
      if (record.samples.length > 1200) record.samples.shift();
    }
    if (now() - lastSample >= 1) { lastSample = now(); publish(); }
  }, 200);
})();
