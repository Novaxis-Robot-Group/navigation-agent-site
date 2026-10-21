"""提供禁用缓存、限制下载速度和记录播放指标的真实浏览器测试页。"""

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import io
import json
from pathlib import Path
import subprocess
import sys
import threading
import time
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from preview import PreviewHandler


class PlaybackHandler(PreviewHandler):
    def send_head(self):
        path = urlsplit(self.path).path
        self.throttle = path.endswith('.mp4')
        self.remaining = None
        if path == '/__playback_results':
            return self.payload(json.dumps(self.server.results).encode(), 'application/json')
        if path == '/__playback_probe.js':
            return self.payload((ROOT / 'tests/playback_probe.js').read_bytes(), 'text/javascript')
        if path == '/__layout':
            width = int(parse_qs(urlsplit(self.path).query).get('width', ['390'])[0])
            if width not in (2560, 1440, 768, 390):
                self.send_error(400)
                return None
            html = (f'<!doctype html><html><head><title>Layout {width}px</title></head>'
                    f'<body style="margin:0"><iframe title="Website at {width}px" '
                    f'src="./#go2-bin" width="{width}" height="1100" style="border:0"></iframe></body></html>')
            return self.payload(html.encode(), 'text/html; charset=utf-8')
        if path == '/replay.js' and self.server.script_ref:
            source = subprocess.check_output(['git', '-C', str(ROOT), 'show', self.server.script_ref + ':replay.js'])
            return self.payload(source, 'text/javascript')
        if path in ('/', '/index.html'):
            html = (ROOT / 'index.html').read_text()
            html = html.replace('</head>', '<script src="./__playback_probe.js"></script></head>')
            return self.payload(html.encode(), 'text/html; charset=utf-8')
        if self.throttle:
            self.server.requests.append({'path': self.path, 'range': self.headers.get('Range'), 'at': time.time()})
            time.sleep(self.server.latency)
        return super().send_head()

    def payload(self, content, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        return io.BytesIO(content)

    def end_headers(self):
        # 清缓存发生在每轮测试开始前；播放期间仍允许缓存分段，与首次访问线上一致。
        cache = 'public, max-age=600' if self.throttle else 'no-store'
        self.send_header('Cache-Control', cache)
        self.send_header('Accept-Ranges', 'bytes')
        SimpleHTTPRequestHandler.end_headers(self)

    def do_POST(self):
        if urlsplit(self.path).path != '/__playback_results':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        self.server.results = json.loads(self.rfile.read(length))
        self.server.results['requests'] = self.server.requests
        self.server.results['mbps'] = self.server.mbps
        self.send_response(204)
        self.end_headers()

    def copyfile(self, source, outputfile):
        if not self.throttle or not self.server.mbps:
            return super().copyfile(source, outputfile)
        remaining = self.remaining
        try:
            while remaining is None or remaining > 0:
                block = source.read(min(32768, remaining) if remaining is not None else 32768)
                if not block:
                    break
                # 所有录像请求共用带宽，模拟首次访问时两路竞争下载。
                with self.server.bandwidth_lock:
                    deadline = max(time.monotonic(), self.server.next_send)
                    self.server.next_send = deadline + len(block) * 8 / (self.server.mbps * 1e6)
                time.sleep(max(0, deadline - time.monotonic()))
                outputfile.write(block)
                if remaining is not None:
                    remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4174)
    parser.add_argument('--mbps', type=float, default=8)
    parser.add_argument('--latency-ms', type=float, default=100)
    parser.add_argument('--script-ref', default='', help='用指定 Git 版本的播放逻辑作对照，素材始终读取工作区最新版')
    args = parser.parse_args()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), partial(PlaybackHandler, directory=str(ROOT)))
    server.mbps = args.mbps
    server.latency = args.latency_ms / 1000
    server.script_ref = args.script_ref
    server.bandwidth_lock = threading.Lock()
    server.next_send = time.monotonic()
    server.requests = []
    server.results = {}
    print(f'空缓存测试：http://127.0.0.1:{args.port}/#go2-bin · {args.mbps} Mbps', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
