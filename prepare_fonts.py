"""准备官网自托管字体，使用 MiSans 官方原版网页切片。"""

import re
from hashlib import sha256
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / '.runtime' / 'fonts'
OUTPUT = ROOT / 'media' / 'fonts'
INTER_BASE = 'https://raw.githubusercontent.com/rsms/inter/v4.1'
MISANS_CSS_URL = 'https://cdn-font.hyperos.mi.com/font/css?family=MiSans_VF:VF:Chinese_Simplify,Latin&display=swap'
MISANS_LICENSE_URL = 'https://hyperos.mi.com/font-download/MiSans字体知识产权许可协议.pdf'


def cached_file(name, url):
    path = CACHE / name
    if not path.exists():
        with urlopen(url, timeout=60) as response:
            path.write_bytes(response.read())
    return path


def publish_font(prefix, content):
    name = f'{prefix}-{sha256(content).hexdigest()[:12]}.woff2'
    (OUTPUT / name).write_bytes(content)
    return name


def unicode_ranges(value):
    ranges = []
    for token in value.split(','):
        bounds = token.strip().removeprefix('U+').split('-')
        start = int(bounds[0], 16)
        end = int(bounds[-1], 16)
        ranges.append((start, end))
    return ranges


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    inter = cached_file('inter-variable-4.1.woff2', f'{INTER_BASE}/docs/font-files/InterVariable.woff2')
    inter_name = publish_font('inter-variable', inter.read_bytes())
    license_text = cached_file('inter-license.txt', f'{INTER_BASE}/LICENSE.txt').read_text(encoding='utf-8')
    (OUTPUT / 'inter-license.txt').write_text(license_text, encoding='utf-8')
    license_url = quote(MISANS_LICENSE_URL, safe=':/')
    license_file = cached_file('misans-license.pdf', license_url)
    (OUTPUT / 'misans-license.pdf').write_bytes(license_file.read_bytes())

    texts = ['index.html', 'site.js', 'replay.js', 'media/replays/sessions.json', 'media/go2/sessions.json']
    characters = {ord(character) for name in texts for character in (ROOT / name).read_text(encoding='utf-8')}
    official_css = cached_file('misans-official-vf.css', MISANS_CSS_URL).read_text(encoding='utf-8')
    faces = [f'''@font-face {{
  font-family: "Inter";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("./{inter_name}") format("woff2");
}}''']
    published = {inter_name}
    covered = set()
    for face in re.findall(r'@font-face\s*\{([^}]+)\}', official_css):
        ranges = re.search(r'unicode-range:\s*([^;]+)', face).group(1)
        relevant = {codepoint for codepoint in characters if any(start <= codepoint <= end for start, end in unicode_ranges(ranges))}
        if not relevant:
            continue
        url = re.search(r'url\("([^"]+\.woff2)"\)', face).group(1)
        if not url.startswith('https://cdn-file.hyperos.mi.com/mi-font-service/'):
            raise ValueError('MiSans 字体来源不是官方服务')
        font_file = cached_file(f'misans-{url.rsplit("/", 1)[-1]}', url)
        name = publish_font('misans-vf', font_file.read_bytes())
        published.add(name)
        covered.update(relevant)
        faces.append(f'''@font-face {{
  font-family: "MiSans VF";
  font-style: normal;
  font-weight: 1 999;
  font-display: swap;
  src: url("./{name}") format("woff2");
  unicode-range: {ranges};
}}''')
    missing = {codepoint for codepoint in characters if 0x4e00 <= codepoint <= 0x9fff and codepoint not in covered}
    if missing:
        raise ValueError('MiSans 缺少网页汉字：' + ''.join(chr(codepoint) for codepoint in sorted(missing)))
    (OUTPUT / 'fonts.css').write_text('/* 由 prepare_fonts.py 生成；MiSans 使用官方未修改的网页切片。 */\n' + '\n'.join(faces) + '\n', encoding='utf-8')
    for pattern in ('inter-variable-*.woff2', 'misans-vf-*.woff2', 'nav-han-web-*.woff2'):
        for previous in OUTPUT.glob(pattern):
            if previous.name not in published:
                previous.unlink()
    total = sum((OUTPUT / name).stat().st_size for name in published)
    print(f'{len(published)} 个原版字体文件，共 {total / 1024:.1f} KiB')


if __name__ == '__main__':
    main()
