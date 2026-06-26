import { describe, expect, it } from "vitest";
import { assertSafeRelativePath, hasPermission } from "./index.js";

describe("shared contracts", () => {
  it("enforces RBAC permissions", () => {
    expect(hasPermission("superadmin", "settings:write")).toBe(true);
    expect(hasPermission("customer", "settings:write")).toBe(false);
    expect(hasPermission("customer", "services:console")).toBe(true);
  });

  it("blocks path traversal", () => {
    expect(assertSafeRelativePath("cfg/server.cfg")).toBe("cfg/server.cfg");
    expect(() => assertSafeRelativePath("../etc/passwd")).toThrow("Unsafe path");
    expect(() => assertSafeRelativePath("/etc/passwd")).toThrow("Unsafe path");
  });
});
