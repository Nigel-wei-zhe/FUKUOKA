#!/usr/bin/env python3
"""重新產生 fonts/huninn-subset.woff2，只收錄 index.html 和 data/*.json 用到的字。

用法（在專案根目錄執行）：
    pip install fonttools brotli
    python3 tools/subset-font.py

會同時更新 fonts/huninn-subset.chars.txt（字型實際收錄的字），
tools/check-trip.mjs 用它找出 trip.json 裡沒收錄的字。

跑完後把 sw.js 的 VERSION 加 1，已安裝的手機才會換新字型。
"""
import pathlib
import urllib.request

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/huninn/Huninn-Regular.ttf'
CACHE = ROOT / 'tools' / '.Huninn-Regular.ttf'
OUTPUT = ROOT / 'fonts' / 'huninn-subset.woff2'
CHARS_OUTPUT = ROOT / 'fonts' / 'huninn-subset.chars.txt'

EXTRA = '福岡散步繪本，。、「」『』（）！？：；～…—–·・／＆％＋＝＃＠¥￥〜→←↑↓'


def main():
    if not CACHE.exists():
        print('下載 Huninn 字型…')
        urllib.request.urlretrieve(SOURCE_URL, CACHE)

    text = ''
    for name in ('index.html', 'data/trip.json', 'data/info.json', 'data/checklist.json', 'data/ui.json', 'manifest.webmanifest'):
        text += (ROOT / name).read_text(encoding='utf-8')
    chars = set(text) | set(EXTRA) | {chr(c) for c in range(0x20, 0x7F)}
    chars = ''.join(sorted(c for c in chars if ord(c) >= 0x20))

    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    font = subset.load_font(str(CACHE), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    subset.save_font(font, str(OUTPUT), options)

    # 記下字型實際收錄的字（原字型沒有的字不算）
    covered = set(chr(c) for c in font.getBestCmap())
    CHARS_OUTPUT.write_text(''.join(sorted(c for c in chars if c in covered)) + '\n', encoding='utf-8')

    missing = sorted(c for c in chars if c not in covered and not c.isspace())
    print(f'完成：{len(covered)} 個字元，{OUTPUT.stat().st_size // 1024} KB')
    if missing:
        print(f'粉圓體本身沒有這些字，會用系統字型顯示：{"".join(missing)}')


if __name__ == '__main__':
    main()
