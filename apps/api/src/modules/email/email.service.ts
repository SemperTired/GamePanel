import { Injectable } from "@nestjs/common";
import { DataStore, EmailRecord, ServiceRecord, UserRecord } from "../data.module.js";

@Injectable()
export class EmailService {
  constructor(private readonly data: DataStore) {}

  list() {
    return [...this.data.emails.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async queueWelcomeEmail(user: UserRecord, service: ServiceRecord, password: string, panelUrl = process.env.PANEL_PUBLIC_URL || "https://panel.aethernode.org") {
    const ports = service.ports.map((port) => `${port.key}: ${port.host_ip}:${port.host}/${port.protocol}`).join("\n");
    return this.queue({
      to: user.email,
      subject: `Your AetherNode server is ready: ${service.name}`,
      body: [
        `Welcome to AetherNode, ${user.name}.`,
        "",
        "Your payment has been received and your game server has been created.",
        "",
        `Panel URL: ${panelUrl}`,
        `Login email: ${user.email}`,
        `Temporary password: ${password}`,
        "",
        `Server: ${service.name}`,
        `Game template: ${service.template_id}`,
        `Service ID: ${service.id}`,
        "",
        "Connection details:",
        ports || "Ports will appear after provisioning completes.",
        "",
        "After logging in, open My Instances, select your server, review Config, then use Console and Power Controls to start or restart it.",
        "",
        "For security, change your password after first login.",
      ].join("\n"),
      metadata: { user_id: user.id, service_id: service.id, template_id: service.template_id },
    });
  }

  async queue(input: { to: string; subject: string; body: string; metadata?: unknown }) {
    const now = new Date().toISOString();
    const email: EmailRecord = {
      id: crypto.randomUUID(),
      to: input.to,
      subject: input.subject,
      body: input.body,
      status: process.env.SMTP_HOST ? "sent" : "queued",
      metadata: input.metadata,
      created_at: now,
      updated_at: now,
    };
    await this.data.saveEmail(email);
    await this.data.recordAudit({
      id: crypto.randomUUID(),
      actor: "system",
      action: "email.queued",
      target: email.to,
      metadata: { email_id: email.id, subject: email.subject, delivery: email.status === "sent" ? "smtp_configured" : "outbox_only" },
      created_at: now,
    });
    return email;
  }
}
