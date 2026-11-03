mod maxfiy;

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            maxfiy::sessiya_token_saqla,
            maxfiy::sessiya_token_ol,
            maxfiy::sessiya_token_ochir
        ])
        .run(tauri::generate_context!())
        .expect("Windows ilovasini ishga tushirib bo‘lmadi");
}
