"""Consistent live SQLite backup. Example: python server/backup.py SOURCE DESTINATION"""
import argparse, sqlite3
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('destination');args=p.parse_args()
source=Path(args.source).resolve();target=Path(args.destination).resolve()
if not source.is_file():p.error('Source database not found')
if target.exists():p.error('Destination already exists; choose a new name')
target.parent.mkdir(parents=True,exist_ok=True)
with sqlite3.connect(source.as_uri()+'?mode=ro',uri=True) as src, sqlite3.connect(target) as dst:
    src.backup(dst)
    if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Backup integrity check failed')
print(target)
