import { describe, it, expect } from "vitest";
import { resolveLogLevel } from "../../../src/cli/log-level.js";

describe("resolveLogLevel", () => {
  it("returns 'quiet' when the quiet flag is set", () => {
    expect(resolveLogLevel({ quiet: true })).toBe("quiet");
  });

  it("returns 'verbose' when only the verbose flag is set", () => {
    expect(resolveLogLevel({ verbose: true })).toBe("verbose");
  });

  it("returns 'normal' when neither flag is set", () => {
    expect(resolveLogLevel({})).toBe("normal");
  });

  it("returns 'normal' when both flags are explicitly false", () => {
    expect(resolveLogLevel({ quiet: false, verbose: false })).toBe("normal");
  });

  it("prefers 'quiet' over 'verbose' when both flags are set", () => {
    expect(resolveLogLevel({ quiet: true, verbose: true })).toBe("quiet");
  });

  it("returns 'verbose' when quiet is explicitly false and verbose is true", () => {
    expect(resolveLogLevel({ quiet: false, verbose: true })).toBe("verbose");
  });
});
