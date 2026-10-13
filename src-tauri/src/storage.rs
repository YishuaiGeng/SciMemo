use std::{path::PathBuf, sync::Mutex};
use rusqlite::{Connection, params, OptionalExtension};
use serde_json::{Value, json};
use tauri::State;

pub struct Storage { db: Mutex<Connection> }
impl Storage {
    pub fn new(root: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        let db = Connection::open(root.join("scimemo.sqlite3"))?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;")?;
        let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 1 { return Err("Unsupported database version; do not downgrade SciMemo".into()); }
        if version == 0 {
            db.execute_batch("BEGIN IMMEDIATE;")?;
            db.execute_batch(include_str!("../migrations/001_workspace.sql"))?;
            db.execute_batch("COMMIT;")?;
        }
        Ok(Self { db: Mutex::new(db) })
    }
}
fn err(e: impl std::fmt::Display) -> String { e.to_string() }
fn parse(s: String) -> Result<Value, String> { serde_json::from_str(&s).map_err(err) }
impl Storage {
    /// Read the whole workspace as one consistent snapshot.
    ///
    /// The five SELECTs run inside a single read transaction. Without it, another
    /// process (a second app instance) committing between them could yield a revision
    /// from one state and an outbox from another.
    pub fn read(&self) -> Result<Value, String> {
        let db = self.db.lock().map_err(err)?;
        let tx = db.unchecked_transaction().map_err(err)?;
        let revision: String = tx.query_row("SELECT value FROM local_meta WHERE key='revision'", [], |r| r.get(0)).map_err(err)?;
        let mut docs = serde_json::Map::new();
        {
            let mut stmt = tx.prepare("SELECT id,body FROM documents").map_err(err)?;
            let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))).map_err(err)?;
            for row in rows { let (id, body) = row.map_err(err)?; docs.insert(id, parse(body)?); }
        }
        let mut value = json!({"schemaVersion":1,"localRevision":revision.parse::<u64>().map_err(err)?,"docs":docs,"outbox":[],"conflicts":[],"cursor":0,"serverId":null});
        for key in ["outbox", "conflicts", "cursor", "serverId"] {
            let raw: Option<String> = tx.query_row("SELECT body FROM operational_state WHERE key=?1", [key], |r| r.get(0)).optional().map_err(err)?;
            if let Some(raw) = raw { value[key] = parse(raw)?; }
        }
        tx.finish().map_err(err)?;
        Ok(value)
    }

    /// Compare-and-swap commit of the entire workspace in one immediate transaction.
    pub fn save(&self, expected_revision: u64, next: &Value) -> Result<(), String> {
        if next["schemaVersion"] != 1 || next["localRevision"].as_u64() != Some(expected_revision + 1) { return Err("Invalid workspace revision".into()); }
        let docs = next["docs"].as_object().ok_or("Missing documents")?;
        if serde_json::to_vec(next).map_err(err)?.len() > 30_000_000 { return Err("Workspace exceeds starter size limit".into()); }
        let mut db = self.db.lock().map_err(err)?;
        let tx = db.transaction_with_behavior(rusqlite::TransactionBehavior::Immediate).map_err(err)?;
        let current: String = tx.query_row("SELECT value FROM local_meta WHERE key='revision'", [], |r| r.get(0)).map_err(err)?;
        // The "LOCAL_CONFLICT:" prefix is matched by the TypeScript driver (NATIVE_LOCAL_CONFLICT)
        // so a revision race is not reported to the user as a storage failure.
        if current.parse::<u64>().map_err(err)? != expected_revision { return Err("LOCAL_CONFLICT: local revision changed in another window; reload before editing".into()); }
        // A single transaction keeps document edits and their outbox durable together.
        // Starter is deliberately simple: full local snapshot rewrite, not a scalability claim.
        tx.execute("DELETE FROM documents", []).map_err(err)?;
        for (id, doc) in docs {
            if doc["id"].as_str() != Some(id.as_str()) { return Err("Document ID mismatch".into()); }
            let kind = doc["kind"].as_str().ok_or("Missing document kind")?;
            tx.execute("INSERT INTO documents(id,kind,body) VALUES (?1,?2,?3)", params![id, kind, doc.to_string()]).map_err(err)?;
        }
        for key in ["outbox", "conflicts", "cursor", "serverId"] {
            tx.execute("INSERT INTO operational_state(key,body) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET body=excluded.body", params![key, next[key].to_string()]).map_err(err)?;
        }
        tx.execute("UPDATE local_meta SET value=?1 WHERE key='revision'", [(expected_revision + 1).to_string()]).map_err(err)?;
        tx.commit().map_err(err)
    }
}

#[tauri::command]
pub fn read_workspace(storage: State<'_, Storage>) -> Result<Value, String> { storage.read() }

#[tauri::command]
pub fn save_workspace(storage: State<'_, Storage>, expected_revision: u64, next: Value) -> Result<(), String> {
    storage.save(expected_revision, &next)
}
const EXPORT_EXTENSIONS: [&str; 4] = [".json", ".md", ".csv", ".ics"];
const EXPORT_LIMIT: usize = 30_000_000;

/// Export through the native save dialog.
///
/// The destination path is chosen inside this command and never accepted from the UI,
/// so a compromised frontend cannot write to arbitrary locations. The file is written
/// to a temporary sibling, flushed, then renamed over the destination, so an
/// interrupted export never leaves a truncated file that looks complete.
/// Returns None when the user cancels.
#[tauri::command]
pub async fn export_with_dialog(app: tauri::AppHandle, filename: String, content: String) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    use std::io::Write;
    if filename.is_empty() || filename.len() > 120 || filename.starts_with('.') || !filename.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c)) {
        return Err("Unsafe export filename".into());
    }
    if !EXPORT_EXTENSIONS.iter().any(|ext| filename.ends_with(ext)) { return Err("Unsupported export extension".into()); }
    if content.len() > EXPORT_LIMIT { return Err("Export too large".into()); }
    // Async command: the blocking dialog runs off the main thread, which it requires.
    let Some(chosen) = app.dialog().file().set_file_name(&filename).blocking_save_file() else { return Ok(None) };
    let path = chosen.into_path().map_err(err)?;
    let name = path.file_name().and_then(|n| n.to_str()).ok_or("Invalid destination name")?;
    if !EXPORT_EXTENSIONS.iter().any(|ext| name.to_ascii_lowercase().ends_with(ext)) {
        return Err("Destination must keep a .json, .md, .csv or .ics extension".into());
    }
    let tmp = path.with_file_name(format!(".{name}.scimemo-partial"));
    let written = (|| -> std::io::Result<()> {
        let mut f = std::fs::OpenOptions::new().write(true).create(true).truncate(true).open(&tmp)?;
        f.write_all(content.as_bytes())?;
        f.sync_all()
    })();
    if let Err(e) = written { let _ = std::fs::remove_file(&tmp); return Err(err(e)); }
    if let Err(e) = std::fs::rename(&tmp, &path) { let _ = std::fs::remove_file(&tmp); return Err(err(e)); }
    Ok(Some(path.to_string_lossy().into_owned()))
}

#[cfg(test)]
mod tests {
    //! Persistence against a real SQLite file on disk. "Restart" means dropping the
    //! Storage (closing the connection) and opening the same directory again.
    use super::*;

    struct TempDir(PathBuf);
    impl TempDir {
        fn new(tag: &str) -> Self {
            let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
            let dir = std::env::temp_dir().join(format!("scimemo-test-{tag}-{}-{nanos}", std::process::id()));
            std::fs::create_dir_all(&dir).unwrap();
            TempDir(dir)
        }
    }
    impl Drop for TempDir { fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); } }

    const NOTE_ID: &str = "00000000-0000-4000-8000-000000000001";

    /// Fictional workspace with one note and one pending outbox operation.
    fn workspace(revision: u64, body: &str) -> Value {
        let doc = json!({"id":NOTE_ID,"kind":"note","data":{"title":"","body":body,"noteType":"idea","paperIds":[],"tags":["研究"],"pinned":false},
            "createdAt":"2026-01-01T00:00:00.000Z","updatedAt":"2026-01-01T00:00:00.000Z","version":0,"deleted":false});
        json!({"schemaVersion":1,"localRevision":revision,"docs":{NOTE_ID:doc.clone()},
            "outbox":[{"opId":"00000000-0000-4000-8000-0000000000aa","baseVersion":0,"doc":doc}],
            "conflicts":[],"cursor":7,"serverId":"11111111-1111-4111-8111-111111111111"})
    }

    #[test]
    fn fresh_database_reads_as_an_empty_workspace() {
        let dir = TempDir::new("fresh");
        let ws = Storage::new(dir.0.clone()).unwrap().read().unwrap();
        assert_eq!(ws["localRevision"], 0);
        assert_eq!(ws["docs"].as_object().unwrap().len(), 0);
        assert_eq!(ws["serverId"], Value::Null);
    }

    #[test]
    fn saved_workspace_survives_a_restart() {
        let dir = TempDir::new("restart");
        {
            let storage = Storage::new(dir.0.clone()).unwrap();
            storage.save(0, &workspace(1, "失败经验也值得记录 ✧")).unwrap();
        } // connection closed here: the equivalent of quitting the app
        let reopened = Storage::new(dir.0.clone()).unwrap().read().unwrap();
        assert_eq!(reopened["localRevision"], 1);
        assert_eq!(reopened["docs"][NOTE_ID]["data"]["body"], "失败经验也值得记录 ✧");
        // Operational state is durable alongside the documents, in the same transaction.
        assert_eq!(reopened["outbox"].as_array().unwrap().len(), 1);
        assert_eq!(reopened["cursor"], 7);
        assert_eq!(reopened["serverId"], "11111111-1111-4111-8111-111111111111");
        assert_eq!(reopened, workspace(1, "失败经验也值得记录 ✧"));
    }

    #[test]
    fn stale_revision_is_rejected_with_the_conflict_prefix_and_writes_nothing() {
        let dir = TempDir::new("cas");
        let storage = Storage::new(dir.0.clone()).unwrap();
        storage.save(0, &workspace(1, "first")).unwrap();
        // A second window still holding revision 0.
        let error = storage.save(0, &workspace(1, "stale")).unwrap_err();
        assert!(error.starts_with("LOCAL_CONFLICT:"), "TypeScript matches this prefix; got {error}");
        assert_eq!(storage.read().unwrap()["docs"][NOTE_ID]["data"]["body"], "first");
    }

    #[test]
    fn a_rejected_save_rolls_back_completely() {
        let dir = TempDir::new("rollback");
        let storage = Storage::new(dir.0.clone()).unwrap();
        storage.save(0, &workspace(1, "kept")).unwrap();
        // The second document's id does not match its key, which fails mid-transaction,
        // after the DELETE and the first INSERT have already run.
        let mut bad = workspace(2, "kept");
        bad["docs"]["00000000-0000-4000-8000-000000000002"] = json!({"id":"mismatch","kind":"note"});
        assert!(storage.save(1, &bad).is_err());
        drop(storage);
        let after = Storage::new(dir.0.clone()).unwrap().read().unwrap();
        assert_eq!(after, workspace(1, "kept"), "partial writes must not survive");
    }

    #[test]
    fn two_connections_see_each_others_commits_and_detect_races() {
        // Two app instances on one data directory.
        let dir = TempDir::new("two");
        let a = Storage::new(dir.0.clone()).unwrap();
        let b = Storage::new(dir.0.clone()).unwrap();
        a.save(0, &workspace(1, "from a")).unwrap();
        assert_eq!(b.read().unwrap()["docs"][NOTE_ID]["data"]["body"], "from a");
        assert!(b.save(0, &workspace(1, "from b")).unwrap_err().starts_with("LOCAL_CONFLICT:"));
        b.save(1, &workspace(2, "from b")).unwrap();
        assert_eq!(a.read().unwrap()["localRevision"], 2);
    }

    #[test]
    fn a_newer_database_version_is_refused_rather_than_downgraded() {
        let dir = TempDir::new("downgrade");
        drop(Storage::new(dir.0.clone()).unwrap());
        Connection::open(dir.0.join("scimemo.sqlite3")).unwrap().execute_batch("PRAGMA user_version=2;").unwrap();
        assert!(Storage::new(dir.0.clone()).is_err());
    }
}
