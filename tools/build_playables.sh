#!/bin/sh
# Run from any directory. Python 3 is the only build-time dependency.
python3 - "$0" <<'PY'
import json
from pathlib import Path
import re
import shutil
import sys
import tempfile

root = Path(sys.argv[1]).resolve().parent.parent
dist = root / 'dist'
if dist.is_symlink():
    raise SystemExit('Refusing a symlinked dist directory')
dist.mkdir(exist_ok=True)
output = dist / 'playables'
if output.is_symlink():
    raise SystemExit('Refusing a symlinked playables directory')

with tempfile.TemporaryDirectory(prefix='.playables-', dir=dist) as temp:
    bundle = Path(temp) / 'playables'
    bundle.mkdir()
    html = (root / 'rpg.html').read_text(encoding='utf-8')
    sdk = '<script src="https://www.youtube.com/game_api/v1"></script>'
    if sdk in html or html.count('<head>') != 1:
        raise SystemExit('Expected one <head> and no SDK in the Pages source')
    (bundle / 'index.html').write_text(html.replace('<head>', '<head>\n' + sdk, 1), encoding='utf-8')

    # Include only frame files actually used by RYOSEI_ANIM / BUGKING_ANIM.
    # Filter their manifests as well so runtime never asks for an omitted frame.
    hero = {(0, c) for c in range(4)} | {(2, c) for c in range(4)} | {(3, c) for c in range(2)}
    enemy = {(r, c) for r in range(3) for c in range(3)}
    for name in ('ryosei', 'bugking', 'kateino', 'hikaku'):
        source = root / 'assets' / name
        target = bundle / 'assets' / name
        target.mkdir(parents=True)
        manifest = name + '_frames.json'
        frames = json.loads((source / manifest).read_text(encoding='utf-8'))
        needed = hero if name == 'ryosei' else enemy
        frames = [f for f in frames if (f['row'], f['col']) in needed]
        if {(f['row'], f['col']) for f in frames} != needed:
            raise SystemExit(f'Missing required animation frames: {name}')
        for frame in frames:
            if not re.fullmatch(r'[a-zA-Z0-9_-]+\.png', frame['file']):
                raise SystemExit(f'Invalid asset filename: {name}')
            shutil.copy2(source / frame['file'], target / frame['file'])
        (target / manifest).write_text(json.dumps(frames, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    shutil.copy2(root / 'assets' / 'icon-192.png', bundle / 'assets' / 'icon-192.png')

    sizes = [(p.stat().st_size, p.relative_to(bundle)) for p in bundle.rglob('*') if p.is_file()]
    total = sum(size for size, _ in sizes)
    largest, largest_path = max(sizes)
    if output.exists():
        shutil.rmtree(output)
    shutil.move(str(bundle), str(output))
    print(f'Output: {output}')
    print(f'Files: {len(sizes)}')
    print(f'Total: {total:,} bytes ({total / 1048576:.3f} MiB)')
    print(f'Largest: {largest:,} bytes ({largest / 1048576:.3f} MiB) — {largest_path}')
PY
