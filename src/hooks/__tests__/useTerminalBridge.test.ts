import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  createTerminalMock,
  writeTerminalMock,
  resizeTerminalMock,
  warmPoolMock,
  createdTerminals,
} = vi.hoisted(() => ({
  createTerminalMock: vi.fn(async () => {}),
  writeTerminalMock: vi.fn(async () => {}),
  resizeTerminalMock: vi.fn(async () => {}),
  warmPoolMock: vi.fn(async () => {}),
  createdTerminals: [] as Array<{
    scrollToBottom: ReturnType<typeof vi.fn>;
    resize: ReturnType<typeof vi.fn>;
    cols: number;
    rows: number;
  }>,
}));

vi.mock("@xterm/xterm", () => {
  class TerminalMock {
    cols = 80;
    rows = 24;
    options: Record<string, unknown>;
    buffer = {
      active: {
        viewportY: 0,
        getLine: vi.fn(() => null),
      },
    };

    open = vi.fn();
    loadAddon = vi.fn();
    attachCustomKeyEventHandler = vi.fn();
    scrollToBottom = vi.fn();
    write = vi.fn();
    focus = vi.fn();
    clear = vi.fn();
    paste = vi.fn();
    resize = vi.fn((cols: number, rows: number) => {
      this.cols = cols;
      this.rows = rows;
    });
    refresh = vi.fn();
    dispose = vi.fn();
    onData = vi.fn(() => ({ dispose: vi.fn() }));
    onResize = vi.fn(() => ({ dispose: vi.fn() }));

    constructor(options: Record<string, unknown>) {
      this.options = options;
      createdTerminals.push(this);
    }
  }

  return {
    Terminal: TerminalMock,
  };
});

vi.mock("@xterm/addon-fit", () => {
  class FitAddonMock {
    fit = vi.fn();
  }

  return {
    FitAddon: FitAddonMock,
  };
});

vi.mock("@xterm/addon-search", () => {
  class SearchAddonMock {
    clearDecorations = vi.fn();
    findNext = vi.fn();
    findPrevious = vi.fn();
  }

  return {
    SearchAddon: SearchAddonMock,
  };
});

vi.mock("@xterm/addon-web-links", () => {
  class WebLinksAddonMock {}

  return {
    WebLinksAddon: WebLinksAddonMock,
  };
});

vi.mock("@xterm/addon-webgl", () => {
  class WebglAddonMock {
    onContextLoss = vi.fn();
    dispose = vi.fn();
  }

  return {
    WebglAddon: WebglAddonMock,
  };
});

vi.mock("@tauri-apps/api/core", () => {
  class ChannelMock<T> {
    onmessage: ((message: T) => void) | null = null;
  }

  return {
    invoke: vi.fn(async () => {}),
    Channel: ChannelMock,
  };
});

vi.mock("../../lib/tauriCommands", () => ({
  createTerminal: createTerminalMock,
  writeTerminal: writeTerminalMock,
  resizeTerminal: resizeTerminalMock,
  warmPool: warmPoolMock,
}));

vi.mock("../../components/common/FontSettings", () => ({
  buildFontFamilyCSS: vi.fn(() => "Menlo"),
}));

import {
  disposeTerminalInstance,
  ensureTerminalScreenshotTarget,
  reflectImmediateTabActivity,
  sendSyntheticTerminalInput,
  syncTerminalFrontendSize,
} from "../useTerminalBridge";
import { useLayoutStore } from "../../stores/useLayoutStore";
import { useTerminalStore } from "../../stores/useTerminalStore";

describe("useTerminalBridge synthetic input", () => {
  beforeEach(() => {
    createdTerminals.length = 0;
    createTerminalMock.mockClear();
    writeTerminalMock.mockClear();
    resizeTerminalMock.mockClear();
    warmPoolMock.mockClear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    disposeTerminalInstance("term-scroll-test");
  });

  it("scrolls synthetic terminal input to the bottom before writing to the PTY", () => {
    ensureTerminalScreenshotTarget("term-scroll-test");

    expect(createdTerminals).toHaveLength(1);

    sendSyntheticTerminalInput("term-scroll-test", "\u0003");

    expect(createdTerminals[0].scrollToBottom).toHaveBeenCalledTimes(1);
    expect(writeTerminalMock).toHaveBeenCalledWith("term-scroll-test", "\u0003");
  });

  it("resizes an existing xterm frontend to match a tmux pane grid", () => {
    ensureTerminalScreenshotTarget("term-scroll-test");

    syncTerminalFrontendSize("term-scroll-test", 109, 25);

    expect(createdTerminals[0].resize).toHaveBeenCalledWith(109, 25);
    expect(createdTerminals[0].cols).toBe(109);
    expect(createdTerminals[0].rows).toBe(25);
  });

  it("clears brown tab status immediately for a tab-root session when a child pane gets input", () => {
    useTerminalStore.getState().addSession("tab-root", "A");
    useTerminalStore.getState().addSession("pane", "A");
    useLayoutStore.getState().initLayout("tab-root", "pane");

    useTerminalStore.getState().setDetectedActivity("tab-root", true);
    useTerminalStore.getState().setPossiblyDone("tab-root", true);
    useTerminalStore.getState().setLongInactive("tab-root", true);
    useTerminalStore.getState().setDetectedActivity("pane", true);
    useTerminalStore.getState().setPossiblyDone("pane", true);
    useTerminalStore.getState().setLongInactive("pane", true);

    reflectImmediateTabActivity("pane");

    expect(useTerminalStore.getState().sessions["tab-root"].isPossiblyDone).toBe(false);
    expect(useTerminalStore.getState().sessions["tab-root"].isLongInactive).toBe(false);
    expect(useTerminalStore.getState().sessions["tab-root"].hasDetectedActivity).toBe(true);
    expect(useTerminalStore.getState().sessions["pane"].isPossiblyDone).toBe(false);
    expect(useTerminalStore.getState().sessions["pane"].isLongInactive).toBe(false);
  });
});
