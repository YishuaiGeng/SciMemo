use tauri::Manager;
mod storage;
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let root = app.path().app_data_dir()?;
            std::fs::create_dir_all(&root)?;
            app.manage(storage::Storage::new(root)?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![storage::read_workspace, storage::save_workspace, storage::export_with_dialog])
        .run(tauri::generate_context!())
        .expect("SciMemo failed to start");
}
