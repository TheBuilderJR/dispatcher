# Tmux Control-Mode Support Plan

## Goal

Support explicit `tmux -CC` and `tmux -CC a` handoff inside an existing Dispatcher terminal so that:

- the original PTY becomes a hidden control transport;
- tmux windows appear as Dispatcher tabs;
- tmux panes appear as Dispatcher split panes;
- Dispatcher shortcuts such as `Cmd+T`, `Cmd+D`, and `Cmd+W` operate on tmux when focus is inside a tmux-backed tab;
- when control mode exits, Dispatcher removes the virtual tmux tabs and restores the original transport terminal.

## Scope

This rollout targets explicit control mode only. The user still starts tmux manually by running `tmux -CC` inside a Dispatcher terminal, including over `ssh`.

Out of scope for the first pass:

- auto-promoting ordinary non-control tmux sessions;
- persistence across app restarts for active tmux control sessions;
- perfect parity for every tmux command or every sidebar action;
- nested control-mode sessions.

## Architecture

### 1. Session Types

Extend terminal session metadata so Dispatcher can distinguish:

- local PTY terminals;
- hidden tmux transport terminals;
- tmux pane terminals rendered in xterm;
- synthetic tmux window tabs used as layout roots and tab metadata.

### 2. Control Transport

Add a tmux control-session controller that:

- watches PTY output for the `tmux -CC` DCS handshake;
- parses control-mode lines and command blocks;
- unescapes `%output` payloads into pane data;
- issues tmux commands back over the hidden transport PTY.

### 3. Projection Into Existing UI

Project tmux state into the current stores:

- one synthetic tab session and tree node per tmux window;
- one pane session per tmux pane;
- one layout entry per tmux window reconstructed from tmux pane geometry.

The existing sidebar and split-container UI remain the primary presentation layer.

### 4. Backend Routing

The terminal bridge must route by backend type:

- local PTY terminals keep the current create/write/resize path;
- tmux pane terminals render output from the control session and send input through `send-keys`;
- tmux window root sessions exist for metadata only and are never mounted as panes.

### 5. Shortcut and Focus Routing

When the active tab is tmux-backed:

- `Cmd+T` sends `new-window`;
- `Cmd+D` / `Cmd+Shift+D` send `split-window -h/-v`;
- `Cmd+W` sends `kill-pane` or `kill-window`;
- tab and pane focus changes send `select-window` / `select-pane` as needed.

## Implementation Phases

### Phase 1: Protocol and State

- add session metadata for tmux roles;
- add a streaming protocol parser and command queue;
- detect control-mode entry and exit from PTY output.

### Phase 2: Window and Pane Projection

- query tmux for initial windows and panes after promotion;
- create synthetic window tabs and pane sessions;
- rebuild Dispatcher layouts from tmux pane geometry;
- hide the original transport tab.

### Phase 3: Interaction Routing

- route pane input through `send-keys`;
- route tab and pane actions through tmux commands;
- keep Dispatcher focus aligned with tmux notifications.

### Phase 4: Lifecycle and Verification

- restore the hidden transport tab when `%exit` arrives;
- clean up virtual tabs and sessions;
- add parser and projection tests;
- run the relevant frontend test suite.

## Verification

Minimum verification target:

1. Start a normal Dispatcher terminal.
2. Run `tmux -CC a` locally.
3. Observe virtual Dispatcher tabs for tmux windows.
4. Use `Cmd+T` to create a tmux window.
5. Use `Cmd+D` to create a tmux split.
6. Use `Cmd+W` to close a tmux pane or window.
7. Exit tmux control mode and confirm the original terminal is restored.
