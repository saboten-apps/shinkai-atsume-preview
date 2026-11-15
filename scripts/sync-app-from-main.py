#!/usr/bin/env python3
"""Snapshot committed canonical app source; never hand-edit the preview mirror."""
import hashlib, io, json, pathlib, shutil, subprocess, sys, tarfile
source = pathlib.Path(sys.argv[1]).resolve()
root = pathlib.Path(__file__).resolve().parents[1]
dest = root / 'app'
if subprocess.check_output(['git','status','--porcelain'],cwd=source).strip():
    raise SystemExit('Commit canonical app changes before syncing preview.')
revision = subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
paths = ['.gitignore','package.json','package-lock.json','index.html','lod-comparison.html','tsconfig.json','tsconfig.node.json','vite.config.ts','vitest.config.ts','src','data','public','scripts','docs']
tracked=set(subprocess.check_output(['git','ls-files'],cwd=source,text=True).splitlines())
paths=[p for p in paths if p in tracked or any(f.startswith(p+'/') for f in tracked)]
archive=subprocess.check_output(['git','archive','HEAD','--',*paths],cwd=source)
# Discard generated map data in the mirror: build from the existing preview assets.
with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
    members=[m for m in tar.getmembers() if not m.name.startswith('public/map/data')]
    # Preserve only installed dependencies when refreshing an existing mirror.
    if dest.exists():
        for p in dest.iterdir():
            if p.name == 'node_modules': continue
            if p.is_dir(): shutil.rmtree(p)
            else: p.unlink()
    dest.mkdir(exist_ok=True)
    tar.extractall(dest,members=members,filter='data')
fishhash=hashlib.sha256((dest/'data/fish.json').read_bytes()).hexdigest()
(dest/'UPSTREAM.json').write_text(json.dumps({'repository':'saboten-apps/shinkai-atsume','commit':revision,'fishSha256':fishhash},indent=2)+'\n')
print(f'Synced {revision}; fish SHA-256 {fishhash}')
