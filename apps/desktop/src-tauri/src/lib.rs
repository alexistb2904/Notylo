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
    use tauri::Manager;

    #[cfg(target_os = "windows")]
    clear_legacy_service_worker_cache();

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(any(target_os = "linux", all(debug_assertions, target_os = "windows")))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                app.deep_link().register_all()?;
            }
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
