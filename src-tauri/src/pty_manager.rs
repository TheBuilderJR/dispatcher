use crate::errors::PtyError;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{ipc::Channel, AppHandle, Emitter};

const MAX_POOL_SIZE: usize = 3;

// ---------------------------------------------------------------------------
// UTF-8 streaming helper
// ---------------------------------------------------------------------------

/// Find the byte index at which to split a buffer so that everything before the
/// index is complete UTF-8.  Any trailing bytes that form an incomplete
/// multi-byte sequence are left for the caller to carry over to the next read.
///
/// This prevents `from_utf8_lossy` from destroying characters that straddle
/// a 4096-byte read boundary.
fn utf8_split_point(bytes: &[u8]) -> usize {
    let len = bytes.len();
    if len == 0 {
        return 0;
    }

    // UTF-8 multi-byte sequences are at most 4 bytes.  We only need to
    // inspect the last 1–3 bytes to decide whether the buffer ends with
    // an incomplete character.
    //
    //   0xxxxxxx  →  1-byte (ASCII), always complete
    //   110xxxxx  →  2-byte lead
    //   1110xxxx  →  3-byte lead
    //   11110xxx  →  4-byte lead
    //   10xxxxxx  →  continuation byte

    let check = std::cmp::min(3, len);
    for back in 1..=check {
        let i = len - back;
        let b = bytes[i];

        if b & 0x80 == 0 {
            // ASCII — everything up to and including this byte is complete.
            return len;
        }

        if b & 0xC0 != 0x80 {
            // Leading byte found.
            let expected = if b & 0xF8 == 0xF0 {
                4
            } else if b & 0xF0 == 0xE0 {
                3
            } else {
                2
            };
            let actual = len - i;
            if actual >= expected {
                // Character is complete.
                return len;
            }
            // Incomplete — split before this lead byte.
            return i;
        }
        // Continuation byte — keep scanning backwards.
    }

    // All inspected bytes are continuation bytes (shouldn't happen in valid
    // UTF-8).  Pass everything through and let lossy conversion handle it.
    len
}

// -- Output routing for reader threads --

enum OutputMode {
    /// PTY is pooled; buffer all output until assigned.
    Buffering(Vec<u8>),
    /// PTY is assigned to a real terminal; stream to frontend.
    Streaming {
        channel: Channel<TerminalOutput>,
        terminal_id: String,
    },
}

struct OutputRouter {
    mode: OutputMode,
    assigned_id: Option<String>,
}

// -- Session types --

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>>,
}

struct PoolEntry {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>>,
    router: Arc<Mutex<OutputRouter>>,
}

pub struct PtyManager {
    sessions: Mutex<HashMap<String, PtySession>>,
    pool: Mutex<Vec<PoolEntry>>,
}

impl PtyManager {
    pub fn new() -> Self {
        PtyManager {
            sessions: Mutex::new(HashMap::new()),
            pool: Mutex::new(Vec::new()),
        }
    }

    /// Pre-spawn PTYs into the pool, up to MAX_POOL_SIZE total.
    pub fn warm_pool(&self, app_handle: &AppHandle, count: usize) -> Result<(), PtyError> {
        let current = self.pool.lock().unwrap().len();
        let to_spawn = count.min(MAX_POOL_SIZE.saturating_sub(current));
        for _ in 0..to_spawn {
            self.spawn_to_pool(app_handle)?;
        }
        Ok(())
    }

    /// Drain all pooled PTYs and spawn fresh replacements so that shell
    /// history, environment variables, etc. are up-to-date.
    pub fn refresh_pool(&self, app_handle: &AppHandle) -> Result<(), PtyError> {
        let old: Vec<PoolEntry> = {
            let mut pool = self.pool.lock().unwrap();
            pool.drain(..).collect()
        };
        // Kill old shell processes.
        for entry in old {
            if let Some(mut child) = entry.child.lock().unwrap().take() {
                let _ = child.kill();
            }
            // Dropping master/writer closes the PTY fds; the reader thread
            // will see EOF and exit on its own.
        }
        self.warm_pool(app_handle, MAX_POOL_SIZE)
    }

    fn spawn_to_pool(&self, app_handle: &AppHandle) -> Result<(), PtyError> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(PtyError::from)?;

        let mut cmd = CommandBuilder::new_default_prog();
        cmd.env("TERM", "xterm-256color");

        let child = pair.slave.spawn_command(cmd).map_err(PtyError::from)?;
        drop(pair.slave);

        let writer = pair.master.take_writer().map_err(PtyError::from)?;
        let mut reader = pair.master.try_clone_reader().map_err(PtyError::from)?;

        let child_arc: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>> =
            Arc::new(Mutex::new(Some(child)));

        let router = Arc::new(Mutex::new(OutputRouter {
            mode: OutputMode::Buffering(Vec::with_capacity(4096)),
            assigned_id: None,
        }));

        let entry = PoolEntry {
            master: pair.master,
            writer,
            child: Arc::clone(&child_arc),
            router: Arc::clone(&router),
        };

        self.pool.lock().unwrap().push(entry);

        // Reader thread: buffers output while pooled, streams when assigned.
        // Uses a carry buffer to avoid corrupting multi-byte UTF-8 characters
        // that straddle 4096-byte read boundaries.
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut carry: Vec<u8> = Vec::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        carry.extend_from_slice(&buf[..n]);

                        let split = utf8_split_point(&carry);

                        if split > 0 {
                            let mut r = router.lock().unwrap();
                            match &mut r.mode {
                                OutputMode::Buffering(buffer) => {
                                    buffer.extend_from_slice(&carry[..split]);
                                }
                                OutputMode::Streaming {
                                    channel,
                                    terminal_id,
                                } => {
                                    let data =
                                        String::from_utf8_lossy(&carry[..split]).to_string();
                                    let _ = channel.send(TerminalOutput {
                                        terminal_id: terminal_id.clone(),
                                        data,
                                    });
                                }
                            }
                        }

                        // Keep only incomplete trailing bytes.
                        carry.drain(..split);
                    }
                    Err(_) => break,
                }
            }

            // Flush any remaining carry bytes at EOF.
            if !carry.is_empty() {
                let mut r = router.lock().unwrap();
                match &mut r.mode {
                    OutputMode::Buffering(buffer) => {
                        buffer.extend_from_slice(&carry);
                    }
                    OutputMode::Streaming {
                        channel,
                        terminal_id,
                    } => {
                        let data = String::from_utf8_lossy(&carry).to_string();
                        let _ = channel.send(TerminalOutput {
                            terminal_id: terminal_id.clone(),
                            data,
                        });
                    }
                }
                drop(r);
            }

            // EOF — get exit code
            let exit_code = {
                let mut guard = child_arc.lock().unwrap();
                if let Some(ref mut child) = *guard {
                    child.wait().ok().map(|status| status.exit_code() as i32)
                } else {
                    None
                }
            };

            // Only emit exit event if this PTY was assigned to a terminal
            let r = router.lock().unwrap();
            if let Some(ref tid) = r.assigned_id {
                let _ = handle.emit(
                    "terminal-exit",
                    TerminalExitPayload {
                        terminal_id: tid.clone(),
                        exit_code,
                    },
                );
            }
        });

        Ok(())
    }

    pub fn create_terminal(
        &self,
        app_handle: &AppHandle,
        terminal_id: String,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
        channel: Channel<TerminalOutput>,
    ) -> Result<(), PtyError> {
        let has_cwd = cwd.as_ref().map_or(false, |d| !d.is_empty());

        // Try pool first — even when cwd is specified we can cd into it
        let entry = self.pool.lock().unwrap().pop();
        if let Some(entry) = entry {
            // Resize to actual dimensions FIRST, before replaying buffered
            // output.  The pool PTY starts at 80×24; if the frontend is a
            // different size the replayed content would use wrong line wrapping.
            let _ = entry.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });

            // Switch router from buffering to streaming
            {
                let mut r = entry.router.lock().unwrap();
                if !has_cwd {
                    // No custom cwd — replay buffered output (initial prompt etc.)
                    if let OutputMode::Buffering(ref buffer) = r.mode {
                        if !buffer.is_empty() {
                            let data = String::from_utf8_lossy(buffer).to_string();
                            let _ = channel.send(TerminalOutput {
                                terminal_id: terminal_id.clone(),
                                data,
                            });
                        }
                    }
                }
                // When has_cwd is true we discard the buffer — the cd+clear
                // below will produce a fresh prompt in the right directory.
                r.mode = OutputMode::Streaming {
                    channel,
                    terminal_id: terminal_id.clone(),
                };
                r.assigned_id = Some(terminal_id.clone());
            }

            let mut session = PtySession {
                master: entry.master,
                writer: entry.writer,
                child: entry.child,
            };

            // cd into the requested directory and clear the screen so the
            // user sees a clean prompt.  Leading space keeps this out of
            // shell history (HISTCONTROL=ignorespace / HIST_IGNORE_SPACE).
            if let Some(ref dir) = cwd {
                if !dir.is_empty() {
                    let escaped = dir.replace('\'', "'\\''");
                    let cmd = format!(" cd '{}' && clear\n", escaped);
                    let _ = session.writer.write_all(cmd.as_bytes());
                    let _ = session.writer.flush();
                }
            }

            self.sessions.lock().unwrap().insert(terminal_id, session);
            return Ok(());
        }

        // Pool empty — spawn fresh
        self.spawn_fresh(app_handle, terminal_id, cwd, cols, rows, channel)
    }

    fn spawn_fresh(
        &self,
        app_handle: &AppHandle,
        terminal_id: String,
        cwd: Option<String>,
        cols: u16,
        rows: u16,
        channel: Channel<TerminalOutput>,
    ) -> Result<(), PtyError> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::from(e))?;

        let mut cmd = CommandBuilder::new_default_prog();
        cmd.env("TERM", "xterm-256color");
        if let Some(ref dir) = cwd {
            cmd.cwd(dir);
        }

        let child = pair.slave.spawn_command(cmd).map_err(|e| PtyError::from(e))?;
        drop(pair.slave);

        let writer = pair.master.take_writer().map_err(|e| PtyError::from(e))?;
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| PtyError::from(e))?;

        let child_arc: Arc<Mutex<Option<Box<dyn Child + Send + Sync>>>> =
            Arc::new(Mutex::new(Some(child)));

        let session = PtySession {
            master: pair.master,
            writer,
            child: Arc::clone(&child_arc),
        };

        {
            let mut sessions = self.sessions.lock().unwrap();
            sessions.insert(terminal_id.clone(), session);
        }

        let tid = terminal_id.clone();
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            let mut carry: Vec<u8> = Vec::new();

            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        carry.extend_from_slice(&buf[..n]);

                        let split = utf8_split_point(&carry);

                        if split > 0 {
                            let data = String::from_utf8_lossy(&carry[..split]).to_string();
                            let _ = channel.send(TerminalOutput {
                                terminal_id: tid.clone(),
                                data,
                            });
                        }

                        // Keep only incomplete trailing bytes.
                        carry.drain(..split);
                    }
                    Err(_) => break,
                }
            }

            // Flush any remaining carry bytes at EOF.
            if !carry.is_empty() {
                let data = String::from_utf8_lossy(&carry).to_string();
                let _ = channel.send(TerminalOutput {
                    terminal_id: tid.clone(),
                    data,
                });
            }

            let exit_code = {
                let mut guard = child_arc.lock().unwrap();
                if let Some(ref mut child) = *guard {
                    child
                        .wait()
                        .ok()
                        .map(|status| status.exit_code() as i32)
                } else {
                    None
                }
            };

            let _ = handle.emit(
                "terminal-exit",
                TerminalExitPayload {
                    terminal_id: tid,
                    exit_code,
                },
            );
        });

        Ok(())
    }

    pub fn write_terminal(&self, terminal_id: &str, data: &[u8]) -> Result<(), PtyError> {
        let mut sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get_mut(terminal_id)
            .ok_or_else(|| PtyError::from(format!("Terminal {} not found", terminal_id)))?;
        session
            .writer
            .write_all(data)
            .map_err(|e| PtyError::from(e))?;
        session.writer.flush().map_err(|e| PtyError::from(e))?;
        Ok(())
    }

    pub fn resize_terminal(
        &self,
        terminal_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), PtyError> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(terminal_id)
            .ok_or_else(|| PtyError::from(format!("Terminal {} not found", terminal_id)))?;
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| PtyError::from(e))?;
        Ok(())
    }

    pub fn get_terminal_cwd(&self, terminal_id: &str) -> Result<Option<String>, PtyError> {
        // Extract the PID while holding the lock, then drop it before running
        // lsof.  Previously the sessions lock was held across the lsof call,
        // blocking all other PTY operations (create, write, resize, close).
        let pid = {
            let sessions = self.sessions.lock().unwrap();
            let session = sessions
                .get(terminal_id)
                .ok_or_else(|| PtyError::from(format!("Terminal {} not found", terminal_id)))?;
            let child_guard = session.child.lock().unwrap();
            child_guard.as_ref().and_then(|c| c.process_id())
        };

        match pid {
            Some(pid) => {
                let output = std::process::Command::new("lsof")
                    .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
                    .output();

                match output {
                    Ok(output) => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        for line in stdout.lines() {
                            if let Some(path) = line.strip_prefix('n') {
                                return Ok(Some(path.to_string()));
                            }
                        }
                        Ok(None)
                    }
                    Err(_) => Ok(None),
                }
            }
            None => Ok(None),
        }
    }

    pub fn close_terminal(&self, terminal_id: &str) -> Result<(), PtyError> {
        let mut sessions = self.sessions.lock().unwrap();
        if let Some(session) = sessions.remove(terminal_id) {
            let mut guard = session.child.lock().unwrap();
            if let Some(ref mut child) = *guard {
                let _ = child.kill();
            }
        }
        Ok(())
    }
}

#[derive(Clone, serde::Serialize)]
pub struct TerminalOutput {
    pub terminal_id: String,
    pub data: String,
}

#[derive(Clone, serde::Serialize)]
pub struct TerminalExitPayload {
    pub terminal_id: String,
    pub exit_code: Option<i32>,
}
