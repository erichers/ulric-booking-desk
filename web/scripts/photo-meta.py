#!/usr/bin/env python3
"""Builds public/photos/meta.json (size + 16px WebP blur-up placeholder, <=600 bytes) and 800w variants. Strips EXIF/metadata."""
import base64, glob, io, json, os
from PIL import Image
root = os.path.join(os.path.dirname(__file__), '..', 'public')
meta = {}
for f in sorted(glob.glob(os.path.join(root, 'photos', '*', '*.jpg'))):
    rel = os.path.relpath(f, root).replace(os.sep, '/')
    im = Image.open(f); im.load()
    if im.info.get('exif') or im.getexif():
        im.convert('RGB').save(f, 'JPEG', quality=86, optimize=True, progressive=True)
    w, h = im.size
    d = os.path.join(os.path.dirname(f), 'w800'); os.makedirs(d, exist_ok=True)
    small = os.path.join(d, os.path.basename(f))
    if not os.path.exists(small):
        im.convert('RGB').resize((800, round(h * 800 / w)), Image.LANCZOS).save(small, 'JPEG', quality=80, optimize=True, progressive=True)
    t = im.convert('RGB').resize((16, max(1, round(h * 16 / w))), Image.BILINEAR)
    b = io.BytesIO(); t.save(b, 'WEBP', quality=40)
    meta[rel] = {'w': w, 'h': h, 'q': 'data:image/webp;base64,' + base64.b64encode(b.getvalue()).decode()}
json.dump(meta, open(os.path.join(root, 'photos', 'meta.json'), 'w'), separators=(',', ':'))
print(len(meta), 'photos')
