use crate::errors::PtyError;
use crate::pty_manager::{PtyManager, TerminalDebugInfo, TerminalOutput};
use std::fs;
#[allow(unused_imports)]
use tauri::{ipc::Channel, AppHandle, State};

fn preview_terminal_data(data: &str, limit: usize) -> String {
    let mut preview = String::new();
    let mut count = 0usize;

    for ch in data.chars() {
        if count >= limit {
            preview.push('…');
            break;
        }

        match ch {
            '\n' => preview.push_str("\\n"),
            '\r' => preview.push_str("\\r"),
            '\t' => preview.push_str("\\t"),
            '\u{1b}' => preview.push_str("\\x1b"),
            c if c.is_control() => preview.push_str(&format!("\\x{:02x}", c as u32)),
            c => preview.push(c),
        }

        count += 1;
    }

    preview
}

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
    let _ = crate::debug_log::append_debug_log(&format!(
        "[backend:create_terminal] terminal_id={} cwd={:?} cols={} rows={}",
        terminal_id, cwd, cols, rows
    ));

    let result = state.create_terminal(&app_handle, terminal_id.clone(), cwd, cols, rows, on_output);
    if let Err(err) = &result {
        let _ = crate::debug_log::append_debug_log(&format!(
            "[backend:create_terminal:error] terminal_id={} error={}",
            terminal_id, err.message
        ));
    }
    result
}

#[tauri::command]
pub fn write_terminal(
    state: State<'_, PtyManager>,
    terminal_id: String,
    data: String,
) -> Result<(), PtyError> {
    let _ = crate::debug_log::append_debug_log(&format!(
        "[backend:write_terminal] terminal_id={} bytes={} preview={}",
        terminal_id,
        data.len(),
        preview_terminal_data(&data, 120)
    ));

    let result = state.write_terminal(&terminal_id, data.as_bytes());
    if let Err(err) = &result {
        let _ = crate::debug_log::append_debug_log(&format!(
            "[backend:write_terminal:error] terminal_id={} error={}",
            terminal_id, err.message
        ));
    }
    result
}

#[tauri::command]
pub fn resize_terminal(
    state: State<'_, PtyManager>,
    terminal_id: String,
    cols: u16,
    rows: u16,
) -> Result<(), PtyError> {
    let _ = crate::debug_log::append_debug_log(&format!(
        "[backend:resize_terminal] terminal_id={} cols={} rows={}",
        terminal_id, cols, rows
    ));

    let result = state.resize_terminal(&terminal_id, cols, rows);
    if let Err(err) = &result {
        let _ = crate::debug_log::append_debug_log(&format!(
            "[backend:resize_terminal:error] terminal_id={} error={}",
            terminal_id, err.message
        ));
    }
    result
}

#[tauri::command]
pub fn close_terminal(
    state: State<'_, PtyManager>,
    terminal_id: String,
) -> Result<(), PtyError> {
    let _ = crate::debug_log::append_debug_log(&format!(
        "[backend:close_terminal] terminal_id={}",
        terminal_id
    ));

    let result = state.close_terminal(&terminal_id);
    if let Err(err) = &result {
        let _ = crate::debug_log::append_debug_log(&format!(
            "[backend:close_terminal:error] terminal_id={} error={}",
            terminal_id, err.message
        ));
    }
    result
}

#[tauri::command]
pub fn get_terminal_cwd(
    state: State<'_, PtyManager>,
    terminal_id: String,
) -> Result<Option<String>, PtyError> {
    let result = state.get_terminal_cwd(&terminal_id);
    match &result {
        Ok(cwd) => {
            let _ = crate::debug_log::append_debug_log(&format!(
                "[backend:get_terminal_cwd] terminal_id={} cwd={:?}",
                terminal_id, cwd
            ));
        }
        Err(err) => {
            let _ = crate::debug_log::append_debug_log(&format!(
                "[backend:get_terminal_cwd:error] terminal_id={} error={}",
                terminal_id, err.message
            ));
        }
    }
    result
}

#[tauri::command]
pub fn get_terminal_debug_info(
    state: State<'_, PtyManager>,
    terminal_id: String,
) -> Result<TerminalDebugInfo, PtyError> {
    state.get_terminal_debug_info(&terminal_id)
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

#[tauri::command]
pub fn append_debug_log(message: String) -> Result<(), PtyError> {
    crate::debug_log::append_debug_log(&message)
}

#[tauri::command]
pub fn get_debug_log_path() -> Result<String, PtyError> {
    Ok(crate::debug_log::debug_log_path().display().to_string())
}

fn sanitize_debug_artifact_name(file_name: &str) -> String {
    let sanitized: String = file_name
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '-' | '_' => ch,
            _ => '_',
        })
        .collect();

    if sanitized.is_empty() || sanitized == "." || sanitized == ".." {
        "artifact.txt".to_string()
    } else {
        sanitized
    }
}

#[tauri::command]
pub fn write_debug_artifact(file_name: String, content: String) -> Result<String, PtyError> {
    let debug_log_path = crate::debug_log::debug_log_path();
    let dir = debug_log_path
        .parent()
        .map(|parent| parent.join("dispatcher-debug-artifacts"))
        .unwrap_or_else(|| std::env::temp_dir().join("dispatcher-debug-artifacts"));
    fs::create_dir_all(&dir)?;

    let path = dir.join(sanitize_debug_artifact_name(&file_name));
    fs::write(&path, content)?;

    Ok(path.display().to_string())
}

#[tauri::command]
pub fn show_font_panel(
    app_handle: AppHandle,
    family: String,
    size: f64,
    weight: String,
) -> Result<(), PtyError> {
    #[cfg(target_os = "macos")]
    {
        crate::font_panel::show(app_handle, &family, size, &weight)?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app_handle, family, size, weight);
    }
    Ok(())
}

#[tauri::command]
pub fn hide_font_panel() -> Result<(), PtyError> {
    #[cfg(target_os = "macos")]
    {
        crate::font_panel::hide()?;
    }
    Ok(())
}
