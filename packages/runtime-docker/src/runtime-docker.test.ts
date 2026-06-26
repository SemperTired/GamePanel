import { describe, expect, it } from "vitest";
import { DockerRuntimeProvider } from "./index.js";

describe("DockerRuntimeProvider", () => {
  it("creates and controls mock services without Docker", async () => {
    process.env.AETHERPANEL_FORCE_MOCK_RUNTIME = "1";
    const runtime = new DockerRuntimeProvider();
    const id = await runtime.create({
      serviceId: "svc_1",
      name: "Test Server",
      image: "example/game:latest",
      environment: {},
      ports: [{ key: "game", host: 25565, container: 25565, protocol: "tcp", host_ip: "0.0.0.0" }],
      volumeName: "aether_test",
      memoryMb: 2048,
      dataPath: "/data",
    });
    await runtime.start(id);
    expect((await runtime.stats(id)).running).toBe(true);
    expect(await runtime.sendCommand(id, "say hello")).toBe(true);
    expect(await runtime.logs(id)).toContain("say hello");
  });
});
