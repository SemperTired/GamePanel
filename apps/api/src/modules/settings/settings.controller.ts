import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { DataStore } from "../data.module.js";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";

const defaults = {
  branding: { panel_name: "AetherPanel", company_name: "AetherNode", primary_color: "#06b6d4", support_url: "http://discord.aethernode.org", public_url: "https://aethernode.org/panel" },
  payments: { paypal_enabled: false, stripe_enabled: false, currency: "USD", tax_enabled: false, invoice_prefix: "AEN" },
  steam: { anonymous: true, username: "", workshop_cache: "/var/lib/aetherpanel/workshop", web_api_key_configured: Boolean(process.env.STEAM_WEB_API_KEY) },
  security: { two_factor_required: false, rate_limit_enabled: true, maintenance_mode: false, session_hours: 12, customer_ip_lock: false },
  infrastructure: { wan_ip: process.env.AETHERNODE_WAN_IP || "", data_root: process.env.AETHERPANEL_DATA_ROOT || "/var/lib/aetherpanel/services", unifi_dry_run: true },
  mail: { from_name: "AetherNode", from_email: "billing@aethernode.org", smtp_host: "", smtp_port: 587, ticket_mailbox: "support@aethernode.org" },
  notifications: { order_paid: true, service_ready: true, ticket_reply: true, outage_notice: true },
  support: { discord_url: "http://discord.aethernode.org", knowledgebase_enabled: true, ticket_sla_hours: 24 },
};

@ApiTags("settings")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly data: DataStore) {}

  @Get()
  @RequirePermission("settings:read")
  list() {
    return Object.fromEntries(Object.entries(defaults).map(([section, value]) => [section, this.data.settings.get(section) || value]));
  }

  @Get(":section")
  @RequirePermission("settings:read")
  get(@Param("section") section: keyof typeof defaults) {
    return this.data.settings.get(section) || defaults[section] || {};
  }

  @Put(":section")
  @RequirePermission("settings:write")
  async put(@Param("section") section: string, @Body() body: unknown) {
    await this.data.saveSetting(section, body);
    return body;
  }
}
