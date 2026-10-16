"""生成官网自托管字体；新增文案后重新运行以更新中文字形。"""

from hashlib import sha256
from io import BytesIO
from pathlib import Path
from urllib.request import urlopen

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / '.runtime' / 'fonts'
OUTPUT = ROOT / 'media' / 'fonts'
HAN_REVISION = 'a4f7cf94edfb9d7ffbdfc4841de276358bd7e0f2'
HAN_BASE = f'https://raw.githubusercontent.com/adobe-fonts/source-han-sans/{HAN_REVISION}'
PLEX_URL = 'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXzKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1syxeKYbSB4Zh.woff2'


def cached_file(name, url):
    path = CACHE / name
    if not path.exists():
        with urlopen(url, timeout=60) as response:
            path.write_bytes(response.read())
    return path


def publish_font(prefix, content):
    name = f'{prefix}-{sha256(content).hexdigest()[:12]}.woff2'
    (OUTPUT / name).write_bytes(content)
    # 只清理本脚本生成且已被替代的字体。
    for previous in OUTPUT.glob(f'{prefix}-*.woff2'):
        if previous.name != name:
            previous.unlink()
    return name


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    source = cached_file('source-han-sans-sc.woff2', f'{HAN_BASE}/Variable/WOFF2/TTF/SourceHanSansSC-VF.ttf.woff2')
    plex = cached_file('ibm-plex-sans-latin.woff2', PLEX_URL)
    licenses = {
        'source-han-license.txt': f'{HAN_BASE}/LICENSE.txt',
        'ibm-plex-license.txt': 'https://raw.githubusercontent.com/IBM/plex/master/LICENSE.txt',
    }
    for name, url in licenses.items():
        license_text = cached_file(name, url).read_text(encoding='utf-8')
        (OUTPUT / name).write_text('\n'.join(line.rstrip() for line in license_text.splitlines()) + '\n', encoding='utf-8')

    # 静态页面与动态任务文案共用同一份字形集合。
    texts = ['index.html', 'site.js', 'replay.js', 'media/replays/sessions.json']
    characters = set(''.join((ROOT / name).read_text() for name in texts))
    font = TTFont(source, recalcTimestamp=False)
    options = subset.Options()
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.name_languages = ['*']
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=''.join(sorted(characters)))
    subsetter.subset(font)

    # 子集属于修改版，使用独立内部名称，保留原作者和许可信息。
    names = {1: 'Nav Han Web', 3: 'NavHanWeb-Subset', 4: 'Nav Han Web', 6: 'NavHanWeb', 16: 'Nav Han Web', 21: 'Nav Han Web', 25: 'NavHanWeb'}
    for record in font['name'].names:
        if record.nameID in names:
            record.string = names[record.nameID].encode(record.getEncoding())
    font.flavor = 'woff2'
    buffer = BytesIO()
    font.save(buffer)
    han_name = publish_font('nav-han-web', buffer.getvalue())
    plex_name = publish_font('ibm-plex-sans-latin', plex.read_bytes())
    (OUTPUT / 'fonts.css').write_text(f'''/* 由 prepare_fonts.py 生成；字形来自 IBM Plex Sans 与思源黑体。 */
@font-face {{
  font-family: "IBM Plex Sans";
  font-style: normal;
  font-weight: 100 700;
  font-display: swap;
  src: url("./{plex_name}") format("woff2");
}}
@font-face {{
  font-family: "Nav Han Web";
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url("./{han_name}") format("woff2");
}}
''')
    for name in (plex_name, han_name):
        print(f'{name}: {(OUTPUT / name).stat().st_size / 1024:.1f} KiB')


if __name__ == '__main__':
    main()
