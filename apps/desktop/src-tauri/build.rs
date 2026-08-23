fn main() {
    // The frontend is built outside this Cargo crate. Track it explicitly so
    // every Tauri package embeds the current Vite assets rather than a stale
    // cached copy (which WebView2 then reports as an HTML module response).
    println!("cargo:rerun-if-changed=../../web/dist");
    tauri_build::build()
}
