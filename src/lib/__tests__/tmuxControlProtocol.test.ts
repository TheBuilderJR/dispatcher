import { describe, expect, it } from "vitest";
import {
  buildTmuxPaneSnapshotCommand,
  buildTmuxWindowSnapshotCommand,
  encodeTmuxSendKeysHex,
  parseTmuxPaneSnapshot,
  parseTmuxWindowSnapshot,
  selectTmuxWindowSnapshot,
  unescapeTmuxOutput,
} from "../tmuxControlProtocol";

describe("tmuxControlProtocol", () => {
  it("unescapes tmux octal output sequences", () => {
    expect(unescapeTmuxOutput("\\033[?2004hhello\\015\\012")).toBe("\u001b[?2004hhello\r\n");
  });

  it("encodes input bytes into hex chunks for send-keys -H", () => {
    expect(encodeTmuxSendKeysHex("A€", 16)).toEqual(["41 e2 82 ac"]);
  });

  it("parses tmux window snapshots", () => {
    expect(parseTmuxWindowSnapshot("@1\tshell\t1\t*")).toEqual({
      windowId: "@1",
      title: "shell",
      isActive: true,
      flags: "*",
    });
  });

  it("parses tmux pane snapshots", () => {
    expect(parseTmuxPaneSnapshot("@1\t%3\t0\t12\t80\t24\t0\t/tmp/project")).toEqual({
      windowId: "@1",
      paneId: "%3",
      left: 0,
      top: 12,
      width: 80,
      height: 24,
      isActive: false,
      cwd: "/tmp/project",
    });
  });

  it("selects the requested tmux window snapshot when tmux returns multiple rows", () => {
    expect(selectTmuxWindowSnapshot([
      "@1\tbash\t0\t-",
      "@2\tbash\t1\t*",
    ], "@2")).toEqual({
      windowId: "@2",
      title: "bash",
      isActive: true,
      flags: "*",
    });
  });

  it("builds hydrate pane commands across all windows for attach flows", () => {
    expect(buildTmuxWindowSnapshotCommand()).toBe(
      'list-windows -F "#{window_id}\\t#{window_name}\\t#{window_active}\\t#{window_flags}"'
    );
    expect(buildTmuxPaneSnapshotCommand({ allWindows: true })).toBe(
      'list-panes -a -F "#{window_id}\\t#{pane_id}\\t#{pane_left}\\t#{pane_top}\\t#{pane_width}\\t#{pane_height}\\t#{pane_active}\\t#{pane_current_path}"'
    );
    expect(buildTmuxPaneSnapshotCommand({ targetWindowId: "@24" })).toBe(
      'list-panes -t @24 -F "#{window_id}\\t#{pane_id}\\t#{pane_left}\\t#{pane_top}\\t#{pane_width}\\t#{pane_height}\\t#{pane_active}\\t#{pane_current_path}"'
    );
  });
});
