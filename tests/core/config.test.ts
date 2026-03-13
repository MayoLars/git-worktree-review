import { describe, test, expect } from "bun:test";
import { loadConfig } from "../../src/core/config";

describe("loadConfig", () => {
  test("returns a config object without throwing", async () => {
    const config = await loadConfig();
    expect(config).toBeDefined();
    expect(typeof config).toBe("object");
  });
});
