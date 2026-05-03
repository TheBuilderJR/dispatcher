use crate::errors::PtyError;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static DEBUG_LOG_LOCK: Mutex<()> = Mutex::new(());

#[cfg(unix)]
const DEBUG_LOG_PATH: &str = "/tmp/dispatcher-debug.log";

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

pub fn init_debug_log() -> Result<(), PtyError> {
    let _guard = DEBUG_LOG_LOCK
        .lock()
        .map_err(|_| PtyError::from(String::from("debug log lock poisoned")))?;
    let path = debug_log_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(PtyError::from)?;
    }

    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
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
