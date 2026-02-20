import { describe, it, expect } from "vitest";
import { useFontSizeStore } from "../useFontSizeStore";

describe("useFontSizeStore", () => {
  it("increase from default (13) → 14", () => {
    expect(useFontSizeStore.getState().fontSize).toBe(13);
    useFontSizeStore.getState().increase();
    expect(useFontSizeStore.getState().fontSize).toBe(14);
  });

  it("decrease from default (13) → 12", () => {
    useFontSizeStore.getState().decrease();
    expect(useFontSizeStore.getState().fontSize).toBe(12);
  });

  it("capped at max (32)", () => {
    useFontSizeStore.setState({ fontSize: 32 });
    useFontSizeStore.getState().increase();
    expect(useFontSizeStore.getState().fontSize).toBe(32);
  });

  it("capped at min (8)", () => {
    useFontSizeStore.setState({ fontSize: 8 });
    useFontSizeStore.getState().decrease();
    expect(useFontSizeStore.getState().fontSize).toBe(8);
  });

  it("reset returns to 13", () => {
    useFontSizeStore.setState({ fontSize: 20 });
    useFontSizeStore.getState().reset();
    expect(useFontSizeStore.getState().fontSize).toBe(13);
  });
});
