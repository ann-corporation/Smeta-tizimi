pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Windows ilovasini ishga tushirib bo‘lmadi");
}
