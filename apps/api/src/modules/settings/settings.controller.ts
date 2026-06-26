import { Body, Controller, Get, Param, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { DataStore } from "../data.module.js";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";

const defaults = {
  branding: { panel_name: "AetherPanel", company_name: "AetherNode", primary_color: "#06b6d4", support_url: "http://discord.aethernode.org" },
  payments: { paypal_enabled: false, stripe_enabled: false, currency: "USD" },
  steam: { anonymous: true, username: "", workshop_cache: "/var/lib/aetherpanel/workshop" },
  security: { two_factor_required: false, rate_limit_enabled: true, maintenance_mode: false },
};

@ApiTags("settings")
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly data: DataStore) {}

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
