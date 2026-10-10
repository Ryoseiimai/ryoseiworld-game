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
v5 = root / 'v5'
dist = root / 'dist'
if dist.is_symlink():
    raise SystemExit('Refusing a symlinked dist directory')
dist.mkdir(exist_ok=True)
output = dist / 'playables_v5'
if output.is_symlink():
    raise SystemExit('Refusing a symlinked playables_v5 directory')

with tempfile.TemporaryDirectory(prefix='.playables_v5-', dir=dist) as temp:
    bundle = Path(temp) / 'playables_v5'
    bundle.mkdir()

    html = (v5 / 'index.html').read_text(encoding='utf-8')
    sdk = '<script src="https://www.youtube.com/game_api/v1"></script>'
    if sdk in html or html.count('<head>') != 1:
        raise SystemExit('Expected one <head> and no SDK in the v5 source')
    (bundle / 'index.html').write_text(html.replace('<head>', '<head>' + sdk, 1), encoding='utf-8')

    (bundle / 'data').mkdir()
    for name in ('words.js', 'ch1.js', 'ch2.js', 'ch3.js', 'ch4.js'):
        shutil.copy2(v5 / 'data' / name, bundle / 'data' / name)

    (bundle / 'js').mkdir()
    for name in ('shooter.js', 'proto.js'):
        shutil.copy2(v5 / 'js' / name, bundle / 'js' / name)

    # Only the sprite sheets the engine actually fetches at runtime (field sprites in
    # index.html's ASSET_COUNTS plus the shooter minigame's boss/weapon/background art).
    # hero_walk is read from the hero_walk_v3 folder (see ASSET_DIRS in index.html).
    sheet_dirs = {
        'hero_walk': 'hero_walk_v3', 'hero_ride': 'hero_ride', 'npc': 'npc', 'npc2': 'npc2',
        'enemies': 'enemies', 'summons': 'summons', 'buildings': 'buildings', 'props': 'props',
        'interior': 'interior', 'ryosei': 'ryosei', 'bugking': 'bugking', 'spirits': 'spirits',
        'neon': 'neon', 'tower': 'tower', 'kateino': 'kateino', 'hikaku': 'hikaku',
        'zero': 'zero', 'tiger': 'tiger', 'items': 'items',
    }
    (bundle / 'assets').mkdir()
    for name, dirname in sheet_dirs.items():
        source = v5 / 'assets' / dirname
        target = bundle / 'assets' / dirname
        target.mkdir(parents=True)
        manifest = name + '_frames.json'
        frames = json.loads((source / manifest).read_text(encoding='utf-8'))
        shutil.copy2(source / manifest, target / manifest)
        for frame in frames:
            if not re.fullmatch(r'[a-zA-Z0-9_-]+\.png', frame['file']):
                raise SystemExit(f'Invalid asset filename: {name}')
            shutil.copy2(source / frame['file'], target / frame['file'])

    # Full-screen backgrounds fetched by file name rather than through a frames manifest.
    for bg in ('bg_town.png', 'bg_minamo.png', 'bg_neon.png', 'bg_tower.png'):
        shutil.copy2(v5 / 'assets' / bg, bundle / 'assets' / bg)

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
