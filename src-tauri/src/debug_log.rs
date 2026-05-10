use crate::errors::PtyError;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static DEBUG_LOG_LOCK: Mutex<()> = Mutex::new(());

#[cfg(unix)]
const DEBUG_LOG_PATH: &str = "/tmp/dispatcher-debug.log";
const DEBUG_LOG_MAX_BYTES: u64 = 20 * 1024 * 1024;

pub fn debug_log_path() -> PathBuf {
    #[cfg(unix)]
    {
        PathBuf::from(DEBUG_LOG_PATH)
    }

    #[cfg(not(unix))]
    {
        std::env::temp_dir().join("dispatcher-debug.log")
    }
}

fn timestamp_prefix() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    format!("[{}.{:03}]", now.as_secs(), now.subsec_millis())
}

fn rotated_debug_log_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("dispatcher-debug.log");
    path.with_file_name(format!("{}.1", file_name))
}

fn rotate_debug_log_if_needed(path: &Path) -> Result<(), PtyError> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(PtyError::from(err)),
    };
    if metadata.len() <= DEBUG_LOG_MAX_BYTES {
        return Ok(());
    }

    let rotated = rotated_debug_log_path(path);
    match fs::remove_file(&rotated) {
        Ok(()) => {}
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
        Err(err) => return Err(PtyError::from(err)),
    }
    match fs::rename(path, rotated) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(PtyError::from(err)),
    }
}

pub fn init_debug_log() -> Result<(), PtyError> {
    let _guard = DEBUG_LOG_LOCK
        .lock()
        .map_err(|_| PtyError::from(String::from("debug log lock poisoned")))?;
    let path = debug_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(PtyError::from)?;
    }
    rotate_debug_log_if_needed(&path)?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(PtyError::from)?;

    writeln!(
        file,
        "{} [backend] dispatcher debug log initialized at {}",
        timestamp_prefix(),
        path.display()
    )
    .map_err(PtyError::from)?;

    Ok(())
}

pub fn append_debug_log(message: &str) -> Result<(), PtyError> {
    let _guard = DEBUG_LOG_LOCK
        .lock()
        .map_err(|_| PtyError::from(String::from("debug log lock poisoned")))?;
    let path = debug_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(PtyError::from)?;
    }
    rotate_debug_log_if_needed(&path)?;

    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(PtyError::from)?;

    if message.ends_with('\n') {
        write!(file, "{} {}", timestamp_prefix(), message).map_err(PtyError::from)?;
    } else {
        writeln!(file, "{} {}", timestamp_prefix(), message).map_err(PtyError::from)?;
    }

    Ok(())
}
