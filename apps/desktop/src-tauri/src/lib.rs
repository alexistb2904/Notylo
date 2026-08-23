#[cfg(target_os = "windows")]
fn clear_legacy_service_worker_cache() {
    use std::path::PathBuf;

    let Ok(local_app_data) = std::env::var("LOCALAPPDATA") else {
        return;
    };

    let profile = PathBuf::from(local_app_data).join("com.alexistb.notylo");
    let migration_marker = profile.join(".desktop-shell-cache-v2");
    if migration_marker.exists() {
        return;
    }

    // Old web builds registered a PWA service worker in WebView2. Its cached
    // shell can point to an asset that no longer ships with the desktop app,
    // leaving a blank window. Only that replaceable shell cache is removed;
    // IndexedDB notebooks and account storage stay untouched.
    let legacy_worker = profile.join("EBWebView").join("Default").join("Service Worker");
    let _ = std::fs::remove_dir_all(legacy_worker);
    let _ = std::fs::create_dir_all(&profile);
    let _ = std::fs::write(migration_marker, b"2");
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "windows")]
    clear_legacy_service_worker_cache();

    #[cfg(debug_assertions)]
    use tauri::Manager;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                app.get_webview_window("main")
                    .expect("main webview must exist")
                    .open_devtools();
            }
            #[cfg(not(debug_assertions))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Notylo");
}
