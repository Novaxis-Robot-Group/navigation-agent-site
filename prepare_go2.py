"""从当前已审核的 Go2 素材生成轻量 4× 版本，不改动原速素材和节点时间。"""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ffmpeg', default='ffmpeg', help='FFmpeg 可执行文件路径')
    args = parser.parse_args()
    manifest = ROOT / 'media/go2/sessions.json'
    sessions = json.loads(manifest.read_text())
    for name, run in sessions.items():
        fast = {'sourceSha256': {}}
        for view, source_url in [('robot', run['video']), ('external', run['external']['video'])]:
            source = ROOT / source_url.split('?')[0]
            output = source.with_name(f'{view}-4x.mp4')
            subprocess.run([
                args.ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(source),
                '-vf', 'setpts=(PTS-STARTPTS)/4,fps=30',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '27',
                '-maxrate', '650k', '-bufsize', '650k', '-g', '30',
                '-pix_fmt', 'yuv420p', '-profile:v', 'main',
                '-an', '-map_metadata', '-1', '-movflags', '+faststart', str(output),
            ], check=True)
            fast['video' if view == 'robot' else 'externalVideo'] = (
                f'./{output.relative_to(ROOT)}?v={digest(output)[:12]}'
            )
            fast['sourceSha256'][view] = digest(source)
            print(f'{name}/{view}: {output.stat().st_size / 1e6:.2f} MB', flush=True)
        run['playback4x'] = fast
    manifest.write_text(json.dumps(sessions, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
