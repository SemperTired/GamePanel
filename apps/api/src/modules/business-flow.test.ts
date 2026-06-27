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

function servicesForTest() {
  process.env.PROVISIONING_QUEUE = "memory";
  const data = new DataStore();
  const templates = new TemplatesService(data);
  const infrastructure = new InfrastructureService(data);
  const services = new ServicesService(data, templates, infrastructure);
  const provisioning = new ProvisioningService(data);
  const email = new EmailService(data);
  const billing = new BillingService(data, provisioning, services, email);
  const scheduler = new SchedulerService(data, services);
  return { data, billing, services, scheduler, provisioning };
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
});
