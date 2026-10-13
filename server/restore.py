"""Create a NEW restored DB and rotate its identity. Stop the sync service first."""
import argparse, sqlite3, uuid
from pathlib import Path
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('backup');p.add_argument('new_destination');p.add_argument('--service-stopped',action='store_true')
a=p.parse_args()
if not a.service_stopped:p.error('Stop the service and pass --service-stopped; never restore over a live DB')
src=Path(a.backup).resolve();dest=Path(a.new_destination).resolve()
if not src.is_file():p.error('Backup does not exist')
if dest.exists():p.error('Destination must be new; original files are never overwritten')
dest.parent.mkdir(parents=True,exist_ok=True)
with sqlite3.connect(src.as_uri()+'?mode=ro',uri=True) as backup,sqlite3.connect(dest) as restored:
    if backup.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Invalid backup')
    backup.backup(restored)
    sid=str(uuid.uuid4())
    changed=restored.execute("UPDATE meta SET value=? WHERE key='server_id'",(sid,)).rowcount
    if changed!=1:raise RuntimeError('Not a SciMemo sync database')
    restored.commit()
    if restored.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('Restore integrity check failed')
print(f'Restored NEW database: {dest}\nNew server ID: {sid}\nPoint SCIMEMO_DB_PATH at this file before restarting. Clients must explicitly reconcile the changed workspace.')
