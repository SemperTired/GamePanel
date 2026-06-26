import { describe, expect, it } from "vitest";
import { modEntrySchema } from "@aetherpanel/shared";
import { applyModAdapter, convertAmpKvp, loadTemplates } from "./index.js";

describe("templates", () => {
  it("loads curated yaml templates", () => {
    const templates = loadTemplates();
    expect(templates.some((template) => template.id === "project-zomboid")).toBe(true);
    expect(templates.some((template) => template.id === "arma3")).toBe(true);
  });

  it("converts AMP kvp metadata into review templates", () => {
    const template = convertAmpKvp("example-game.kvp", {
      "Meta.DisplayName": "Example Game",
      "Meta.Description": "Example",
      "Meta.OS": "Windows, Linux",
      "App.CommandLine": "./server",
      "App.Ports.$ApplicationPort1": "28015",
    });
    expect(template.id).toBe("example-game");
    expect(template.source.needs_review).toBe(true);
    expect(template.ports[0].default).toBe(28015);
  });

  it("writes Project Zomboid workshop ids as semicolon separated config", () => {
    const template = loadTemplates().find((item) => item.id === "project-zomboid")!;
    const result = applyModAdapter(template, [
      modEntrySchema.parse({ id: "123", provider: "steam", enabled: true, order: 1 }),
      modEntrySchema.parse({ id: "456", provider: "steam", enabled: true, order: 0 }),
    ]);
    expect(result.configWrites[0]).toMatchObject({ key: "WorkshopItems", value: "456;123" });
  });
});
