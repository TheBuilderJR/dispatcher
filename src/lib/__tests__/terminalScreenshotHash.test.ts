import { describe, expect, it } from "vitest";
import { split, leaf } from "../../test/helpers";
import {
  buildCompoundScreenshotHashInput,
  getTabRootTerminalIds,
  getTabTerminalIds,
} from "../terminalScreenshotHash";

describe("terminalScreenshotHash", () => {
  it("returns split-pane terminal ids in layout order", () => {
    const layouts = {
      root: split(leaf("root"), split(leaf("split-a"), leaf("split-b"))),
    };

    expect(
      getTabTerminalIds(layouts, "root", new Set(["root", "split-a", "split-b", "other"]))
    ).toEqual(["root", "split-a", "split-b"]);
  });

  it("resolves unique tab roots for split panes and standalone terminals", () => {
    const layouts = {
      root: split(leaf("root"), leaf("split-a")),
      solo: leaf("solo"),
    };

    expect(getTabRootTerminalIds(layouts, ["root", "split-a", "solo"])).toEqual([
      "root",
      "solo",
    ]);
  });

  it("builds a compound hash input that preserves pane order and membership", () => {
    expect(buildCompoundScreenshotHashInput(["hash-a", "hash-b"])).toBe(
      "dispatcher:screenshot-compound:v1\ncount=2\nhash-a\nhash-b"
    );
    expect(buildCompoundScreenshotHashInput(["hash-a", "hash-b"])).not.toBe(
      buildCompoundScreenshotHashInput(["hash-a"])
    );
    expect(buildCompoundScreenshotHashInput(["hash-a", "hash-b"])).not.toBe(
      buildCompoundScreenshotHashInput(["hash-b", "hash-a"])
    );
  });
});
