"""启动支持视频 Range 请求的本地官网预览。"""

import argparse
import hashlib
import io
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re


class PreviewHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self.remaining = None
        path = Path(self.translate_path(self.path))
        page = path / "index.html" if path.is_dir() else path
        if page.name == "index.html" and page.is_file():
            # 本地预览也按内容更新资源地址，避免浏览器混用新页面和旧样式。
            html = page.read_text()
            for name in ("styles.css", "site.js", "replay.css", "replay.js"):
                version = hashlib.sha256((page.parent / name).read_bytes()).hexdigest()[:12]
                html = html.replace(f'./{name}"', f'./{name}?v={version}"')
            content = html.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            return io.BytesIO(content)
        requested = self.headers.get("Range")
        if not requested or not path.is_file():
            return super().send_head()
        size = path.stat().st_size
        match = re.fullmatch(r"bytes=(\d*)-(\d*)", requested.strip())
        if not match or not any(match.groups()) or size == 0:
            return self.invalid_range(size)
        first, last = match.groups()
        if first:
            start = int(first)
            end = min(int(last), size - 1) if last else size - 1
        else:
            start = max(0, size - int(last))
            end = size - 1
        if start > end or start >= size:
            return self.invalid_range(size)
        stream = path.open("rb")
        stream.seek(start)
        self.remaining = end - start + 1
        self.send_response(206)
        self.send_header("Content-Type", self.guess_type(str(path)))
        self.send_header("Content-Length", str(self.remaining))
        self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Last-Modified", self.date_time_string(path.stat().st_mtime))
        self.end_headers()
        return stream

    def invalid_range(self, size):
        self.send_response(416)
        self.send_header("Content-Range", f"bytes */{size}")
        self.send_header("Content-Length", "0")
        self.end_headers()
        return None

    def end_headers(self):
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def copyfile(self, source, outputfile):
        # 浏览器换任务会断开旧请求，不把主动取消打印成服务异常。
        try:
            if self.remaining is None:
                return super().copyfile(source, outputfile)
            while self.remaining > 0:
                block = source.read(min(64 * 1024, self.remaining))
                if not block:
                    break
                outputfile.write(block)
                self.remaining -= len(block)
        except (BrokenPipeError, ConnectionResetError):
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=4173)
    args = parser.parse_args()
    handler = partial(PreviewHandler, directory=str(Path(__file__).resolve().parent))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Local: http://127.0.0.1:{args.port}/#videos", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
