"""汇总测试预览中真实浏览器的首播指标。"""

import argparse
from collections import Counter
import json
from pathlib import Path
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('url', help='测试预览地址，例如 http://127.0.0.1:4176')
parser.add_argument('--save', type=Path, help='可选：保存本轮原始指标')
args = parser.parse_args()
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
with opener.open(args.url.rstrip('/') + '/__playback_results', timeout=5) as response:
    data = json.load(response)
if args.save:
    args.save.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
print(data.get('agent', '尚未开始播放'))
for name, record in data.get('records', {}).items():
    first_play = {}
    counts = Counter()
    for event in record['events']:
        counts[event['view'], event['type']] += 1
        if event['type'] == 'playing':
            first_play.setdefault(event['view'], event['at'])
    drift = []
    for sample in record['samples']:
        media = sample['media']
        if len(media) == 2 and all(not item['paused'] and not item['seeking'] for item in media):
            drift.append(abs(media[0]['time'] * media[0].get('scale', 1) - media[1]['time'] * media[1].get('scale', 1)))
    print(name, json.dumps({
        'startup_s': round(max(first_play.values()) - record['clicked'], 2) if len(first_play) == 2 else None,
        'max_drift_s': round(max(drift), 3) if drift else None,
        'external_seeks': counts['go2-external-video', 'seeking'],
        'waiting_after_start': sum(event['type'] == 'waiting' and event['at'] > max(first_play.values())
                                   for event in record['events']) if len(first_play) == 2 else None,
        'pauses_before_end': sum(event['view'] == 'go2-video' and event['type'] == 'pause'
                                and event['time'] < record['samples'][-1]['media'][-1].get('duration', float('inf')) - .2
                                for event in record['events']),
        'camera_ended': bool(counts['go2-video', 'ended']),
    }, ensure_ascii=False))
print('媒体请求数：', len(data.get('requests', [])))
