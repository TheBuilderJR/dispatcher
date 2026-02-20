use crate::errors::PtyError;
use crate::pty_manager::{PtyManager, TerminalOutput};
use tauri::{ipc::Channel, AppHandle, State};

#[tauri::command]
pub fn create_terminal(
    app_handle: AppHandle,
    state: State<'_, PtyManager>,
    terminal_id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_output: Channel<TerminalOutput>,
) -> Result<(), PtyError> {
    state.create_terminal(&app_handle, terminal_id, cwd, cols, rows, on_output)
}

#[tauri::command]
pub fn write_terminal(
    state: State<'_, PtyManager>,
    terminal_id: String,
    data: String,
) -> Result<(), PtyError> {
    state.write_terminal(&terminal_id, data.as_bytes())
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, PtyManager>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), PtyError> {
    state.resize_terminal(&terminal_id, cols, rows)
}

#[tauri::command]
pub fn close_terminal(
    state: State<'_, PtyManager>,
    terminal_id: String,
) -> Result<(), PtyError> {
    state.close_terminal(&terminal_id)
}

#[tauri::command]
pub fn get_terminal_cwd(
    state: State<'_, PtyManager>,
    terminal_id: String,
) -> Result<Option<String>, PtyError> {
    state.get_terminal_cwd(&terminal_id)
}

#[tauri::command]
pub fn warm_pool(
    app_handle: AppHandle,
    state: State<'_, PtyManager>,
    count: usize,
) -> Result<(), PtyError> {
    state.warm_pool(&app_handle, count)
}

#[tauri::command]
pub fn refresh_pool(
    app_handle: AppHandle,
    state: State<'_, PtyManager>,
) -> Result<(), PtyError> {
    state.refresh_pool(&app_handle)
}
