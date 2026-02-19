use crate::errors::PtyError;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{ipc::Channel, AppHandle, Emitter};

const MAX_POOL_SIZE: usize = 3;

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

        // Reader thread: buffers output while pooled, streams when assigned
        let handle = app_handle.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let mut r = router.lock().unwrap();
                        match &mut r.mode {
                            OutputMode::Buffering(buffer) => {
                                buffer.extend_from_slice(&buf[..n]);
                            }
                            OutputMode::Streaming {
                                channel,
                                terminal_id,
                            } => {
                                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                                let _ = channel.send(TerminalOutput {
                                    terminal_id: terminal_id.clone(),
                                    data,
                                });
                            }
                        }
                    }
                    Err(_) => break,
                }
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

            // Resize to actual dimensions
            let _ = entry.master.resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            });

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
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).to_string();
                        let _ = channel.send(TerminalOutput {
                            terminal_id: tid.clone(),
                            data,
                        });
                    }
                    Err(_) => break,
                }
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
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(terminal_id)
            .ok_or_else(|| PtyError::from(format!("Terminal {} not found", terminal_id)))?;

        let child_guard = session.child.lock().unwrap();
        let pid = child_guard.as_ref().and_then(|c| c.process_id());

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
