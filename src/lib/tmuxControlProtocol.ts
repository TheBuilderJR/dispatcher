export const TMUX_CONTROL_START = "\u001bP1000p";
export const TMUX_CONTROL_END = "\u001b\\";
const TMUX_WINDOW_SNAPSHOT_FORMAT = '"#{window_id}\\t#{window_name}\\t#{window_active}\\t#{window_flags}"';
const TMUX_PANE_SNAPSHOT_FORMAT =
  '"#{window_id}\\t#{pane_id}\\t#{pane_left}\\t#{pane_top}\\t#{pane_width}\\t#{pane_height}\\t#{pane_active}\\t#{pane_current_path}\\t#{cursor_x}\\t#{cursor_y}\\t#{alternate_on}"';

export interface TmuxWindowSnapshot {
  windowId: string;
  title: string;
  isActive: boolean;
  flags: string;
}

export interface TmuxPaneSnapshot {
  windowId: string;
  paneId: string;
  left: number;
  top: number;
  width: number;
  height: number;
  isActive: boolean;
  cwd?: string;
  cursorX: number;
  cursorY: number;
  alternateOn: boolean;
}

export function buildTmuxWindowSnapshotCommand(targetWindowId?: string): string {
  return targetWindowId
    ? `display-message -p -t ${targetWindowId} ${TMUX_WINDOW_SNAPSHOT_FORMAT}`
    : `list-windows -F ${TMUX_WINDOW_SNAPSHOT_FORMAT}`;
}

export function buildTmuxPaneSnapshotCommand(options?: {
  targetWindowId?: string;
  allWindows?: boolean;
}): string {
  if (options?.targetWindowId) {
    return `list-panes -t ${options.targetWindowId} -F ${TMUX_PANE_SNAPSHOT_FORMAT}`;
  }

  if (options?.allWindows) {
    return `list-panes -a -F ${TMUX_PANE_SNAPSHOT_FORMAT}`;
  }

  return `list-panes -F ${TMUX_PANE_SNAPSHOT_FORMAT}`;
}

export function buildTmuxPaneCaptureCommand(options: {
  paneId: string;
  alternateScreen?: boolean;
  includeHistory?: boolean;
}): string {
  const flags = ["-p", "-e", "-C"];
  if (options.alternateScreen) {
    flags.push("-a", "-q");
  } else if (options.includeHistory !== false) {
    flags.push("-S", "-");
  }
  return `capture-pane ${flags.join(" ")} -t ${options.paneId}`;
}

export function buildTmuxNewWindowCommand(options: {
  targetWindowId: string;
  title?: string;
  inheritCurrentPanePath?: boolean;
}): string {
  const segments = ["new-window", "-a", "-t", options.targetWindowId];
  const trimmedTitle = options.title?.trim();
  if (trimmedTitle) {
    segments.push("-n", quoteTmuxCommandArgument(trimmedTitle));
  }
  if (options.inheritCurrentPanePath) {
    segments.push("-c", '"#{pane_current_path}"');
  }
  return segments.join(" ");
}

export function unescapeTmuxOutput(value: string): string {
  let result = "";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\" && index + 3 < value.length) {
      const octal = value.slice(index + 1, index + 4);
      if (/^[0-7]{3}$/.test(octal)) {
        result += String.fromCharCode(parseInt(octal, 8));
        index += 3;
        continue;
      }
    }

    result += char;
  }

  return result;
}

export function encodeTmuxSendKeysHex(data: string, chunkSize: number = 64): string[] {
  const bytes = new TextEncoder().encode(data);
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.slice(offset, offset + chunkSize);
    chunks.push(Array.from(slice, (byte) => byte.toString(16).padStart(2, "0")).join(" "));
  }

  return chunks;
}

export function parseTmuxWindowSnapshot(line: string): TmuxWindowSnapshot | null {
  const [windowId, title, activeFlag, flags = ""] = line.split("\t");
  if (!windowId || title === undefined || activeFlag === undefined) {
    return null;
  }

  return {
    windowId,
    title,
    isActive: activeFlag === "1",
    flags,
  };
}

export function selectTmuxWindowSnapshot(
  lines: readonly string[],
  targetWindowId?: string
): TmuxWindowSnapshot | null {
  const snapshots = lines
    .map(parseTmuxWindowSnapshot)
    .filter((value): value is TmuxWindowSnapshot => Boolean(value));

  if (targetWindowId) {
    return snapshots.find((snapshot) => snapshot.windowId === targetWindowId) ?? null;
  }

  return snapshots[0] ?? null;
}

export function parseTmuxPaneSnapshot(line: string): TmuxPaneSnapshot | null {
  const [
    windowId,
    paneId,
    left,
    top,
    width,
    height,
    activeFlag,
    cwd = "",
    cursorX = "0",
    cursorY = "0",
    alternateOn = "0",
  ] = line.split("\t");
  if (!windowId || !paneId || left === undefined || top === undefined || width === undefined || height === undefined || activeFlag === undefined) {
    return null;
  }

  const parsedLeft = Number(left);
  const parsedTop = Number(top);
  const parsedWidth = Number(width);
  const parsedHeight = Number(height);
  const parsedCursorX = Number(cursorX);
  const parsedCursorY = Number(cursorY);
  if (![parsedLeft, parsedTop, parsedWidth, parsedHeight, parsedCursorX, parsedCursorY].every(Number.isFinite)) {
    return null;
  }

  return {
    windowId,
    paneId,
    left: parsedLeft,
    top: parsedTop,
    width: parsedWidth,
    height: parsedHeight,
    isActive: activeFlag === "1",
    cwd: cwd || undefined,
    cursorX: parsedCursorX,
    cursorY: parsedCursorY,
    alternateOn: alternateOn === "1",
  };
}

export function quoteTmuxCommandArgument(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
