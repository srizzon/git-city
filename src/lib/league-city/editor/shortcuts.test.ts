import { describe, expect, it } from "vitest";
import { keyToAction } from "./shortcuts";

describe("keyToAction", () => {
  it("maps the editor keys", () => {
    expect(keyToAction({ key: "3" })).toEqual({ type: "slot", slot: 2 });
    expect(keyToAction({ key: "R" })).toEqual({ type: "rotate" });
    expect(keyToAction({ key: "Delete" })).toEqual({ type: "remove" });
    expect(keyToAction({ key: "Backspace" })).toEqual({ type: "remove" });
    expect(keyToAction({ key: "Escape" })).toEqual({ type: "cancel" });
    expect(keyToAction({ key: "g" })).toEqual({ type: "grid" });
    expect(keyToAction({ key: "q" })).toEqual({ type: "camRotate", dir: -1 });
    expect(keyToAction({ key: "e" })).toEqual({ type: "camRotate", dir: 1 });
    expect(keyToAction({ key: "p" })).toEqual({ type: "preview" });
    expect(keyToAction({ key: "w" })).toEqual({ type: "pan", dx: 0, dz: -1 });
    expect(keyToAction({ key: "ArrowLeft" })).toEqual({ type: "pan", dx: -1, dz: 0 });
  });

  it("maps undo and redo on both platforms", () => {
    expect(keyToAction({ key: "z", metaKey: true })).toEqual({ type: "undo" });
    expect(keyToAction({ key: "z", ctrlKey: true })).toEqual({ type: "undo" });
    expect(keyToAction({ key: "Z", metaKey: true, shiftKey: true })).toEqual({ type: "redo" });
    expect(keyToAction({ key: "y", ctrlKey: true })).toEqual({ type: "redo" });
  });

  it("leaves browser shortcuts alone", () => {
    expect(keyToAction({ key: "r", metaKey: true })).toBeNull();
    expect(keyToAction({ key: "s", ctrlKey: true })).toBeNull();
    expect(keyToAction({ key: "0" })).toBeNull();
  });

  it("does nothing while typing", () => {
    expect(keyToAction({ key: "Backspace", target: { tagName: "INPUT" } as unknown as EventTarget })).toBeNull();
    expect(keyToAction({ key: "z", metaKey: true, target: { tagName: "TEXTAREA" } as unknown as EventTarget })).toBeNull();
    expect(keyToAction({ key: "r", target: { tagName: "DIV", isContentEditable: true } as unknown as EventTarget })).toBeNull();
  });
});
