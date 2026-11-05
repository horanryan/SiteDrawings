import { describe, expect, it } from "vitest";
import { ACTION_SHORTCUTS, QUICK_GUIDE, TOOL_SHORTCUTS, toolForKey } from "./shortcuts";

describe("keyboard shortcuts", () => {
  it("assigns every tool a unique key and lists the same keys in the guide", () => {
    const toolEntries = Object.entries(TOOL_SHORTCUTS);
    const allKeys = [...toolEntries.map(([, key]) => key), ...Object.values(ACTION_SHORTCUTS)];
    expect(new Set(allKeys.map((key) => key.toLowerCase())).size).toBe(allKeys.length);
    for (const [tool, key] of toolEntries) {
      expect(toolForKey(key)).toBe(tool);
      expect(toolForKey(key.toLowerCase())).toBe(tool);
      expect(QUICK_GUIDE.some(([listed]) => listed === key)).toBe(true);
      expect(toolForKey(key, true)).toBeUndefined();
    }
    for (const key of Object.values(ACTION_SHORTCUTS)) {
      expect(QUICK_GUIDE.some(([listed]) => listed === key)).toBe(true);
    }
    expect(toolForKey("unassigned")).toBeUndefined();
  });
});
