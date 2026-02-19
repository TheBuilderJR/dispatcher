mod commands;
mod errors;
mod pty_manager;

use pty_manager::PtyManager;

pub fn run() {
    tauri::Builder::default()
        .manage(PtyManager::new())
        .invoke_handler(tauri::generate_handler![
            commands::create_terminal,
            commands::write_terminal,
            commands::resize_terminal,
            commands::close_terminal,
            commands::warm_pool,
            commands::get_terminal_cwd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
