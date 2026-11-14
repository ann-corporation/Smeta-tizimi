// No commands are exposed to the WebView: the Kotlin side is reachable from native Rust only.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
