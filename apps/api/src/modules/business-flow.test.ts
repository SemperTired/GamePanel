import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DataStore } from "./data.module.js";
import { BillingService } from "./billing/billing.service.js";
import { EmailService } from "./email/email.service.js";
import { InfrastructureService } from "./infrastructure/infrastructure.service.js";
import { ProvisioningService } from "./provisioning/provisioning.service.js";
import { SchedulerService } from "./scheduler/scheduler.service.js";
import { ServicesService } from "./services/services.service.js";
import { TemplatesService } from "./templates/templates.service.js";
import { ConfigurationsService } from "./configurations/configurations.service.js";

function servicesForTest() {
  process.env.PROVISIONING_QUEUE = "memory";
  const data = new DataStore();
  const templates = new TemplatesService(data);
  const infrastructure = new InfrastructureService(data);
  const services = new ServicesService(data, templates, infrastructure);
  const configurations = new ConfigurationsService(data, templates);
  const provisioning = new ProvisioningService(data);
  const email = new EmailService(data);
  const billing = new BillingService(data, provisioning, services, email);
  const scheduler = new SchedulerService(data, services);
  return { data, billing, services, scheduler, provisioning, configurations };
}

describe("business automation flows", () => {
  it("fulfills a paid order by creating a customer, service, job, and welcome email", async () => {
    const { data, billing, provisioning } = servicesForTest();
    const result = await billing.receivePaymentFulfillment(undefined, {
      paid: true,
      customer_email: "customer@example.com",
      customer_name: "Customer One",
      template_id: "minecraft-java",
      service_name: "Customer Minecraft",
      amount: "24.99",
      currency: "USD",
      payment_id: "PAY-123",
    });

    expect(result.action).toBe("queued_provisioning");
    expect([...data.users.values()].some((user) => user.email === "customer@example.com" && user.role === "customer")).toBe(true);
    expect([...data.services.values()][0].owner_user_id).toBe(result.user_id);
    expect(provisioning.list()[0]).toMatchObject({ service_id: result.service_id, action: "install", status: "queued" });
    expect([...data.emails.values()][0].body).toContain("https://panel.aethernode.org");
  });

  it("runs a scheduled backup task against a service", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aetherpanel-test-"));
    process.env.AETHERPANEL_BACKUP_ROOT = path.join(tempRoot, "backups");
    process.env.AETHERPANEL_DATA_ROOT = path.join(tempRoot, "services");
    const { scheduler, services } = servicesForTest();
    const service = await services.create({
      name: "Scheduled Backup Server",
      template_id: "minecraft-java",
      owner_user_id: "usr_customer",
      location_id: "local",
    });

    const task = await scheduler.create({ service_id: service.id, name: "Hourly backup", action: "backup", cadence: "manual" });
    const result = await scheduler.runNow(task.id);
    expect(result.last_status).toBe("success");
    expect((await services.backups(service.id)).length).toBe(1);
  });

  it("marks an instance paid and provisions it from the operator button flow", async () => {
    process.env.AETHERPANEL_FORCE_MOCK_RUNTIME = "1";
    const { services } = servicesForTest();
    const service = await services.create({
      name: "Operator Paid Server",
      template_id: "minecraft-java",
      owner_user_id: "usr_superadmin",
      location_id: "local",
    });

    const result = await services.markPaid(service.id, { provision: true, start: true });

    expect(result.status).toBe("active");
    expect(result.runtime_id).toBeTruthy();
    expect(result.power_state).toBe("running");
  });

  it("marks an instance paid without provisioning when the operator uses Mark Paid only", async () => {
    process.env.AETHERPANEL_FORCE_MOCK_RUNTIME = "1";
    const { services } = servicesForTest();
    const service = await services.create({
      name: "Operator Paid Only Server",
      template_id: "minecraft-java",
      owner_user_id: "usr_superadmin",
      location_id: "local",
    });

    const result = await services.markPaid(service.id, { provision: false, start: false });

    expect(result.status).toBe("paid");
    expect(result.runtime_id).toBeFalsy();
    expect(result.power_state).toBe("created");
  });

  it("lets customers save startup variables on their own service but not another customer service", async () => {
    const { services, configurations } = servicesForTest();
    const owned = await services.create({
      name: "Customer Path of Titans",
      template_id: "path-of-titans",
      owner_user_id: "usr_customer",
      location_id: "local",
    });
    const other = await services.create({
      name: "Other Path of Titans",
      template_id: "path-of-titans",
      owner_user_id: "usr_other",
      location_id: "local",
    });

    await configurations.updateStartupVariables(owned.id, { AuthToken: "token-present" }, { sub: "usr_customer", role: "customer" });
    expect(configurations.get(owned.id, { sub: "usr_customer", role: "customer" }).startup_variables.find((item) => item.key === "AuthToken")?.value).toBe("token-present");
    await expect(configurations.updateStartupVariables(other.id, { AuthToken: "blocked" }, { sub: "usr_customer", role: "customer" })).rejects.toThrow("Insufficient permission");
  });
});
