import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AuthGuard, RequirePermission } from "../auth/auth.guard.js";
import { BillingService } from "./billing.service.js";

@ApiTags("billing")
@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get("gateways")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @RequirePermission("billing:read")
  gateways() {
    return this.billing.gateways();
  }

  @Post("paypal/orders")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @RequirePermission("billing:read")
  createPayPalOrder(@Body() body: { service_id: string; amount: string; description?: string }, @Req() request: { user: { sub?: string; role?: string } }) {
    return this.billing.createPayPalOrder(body, request.user);
  }

  @Post("paypal/orders/:orderId/capture")
  @ApiBearerAuth()
  @UseGuards(AuthGuard)
  @RequirePermission("billing:read")
  capturePayPalOrder(@Param("orderId") orderId: string) {
    return this.billing.capturePayPalOrder(orderId);
  }

  @Post("paypal/webhook")
  webhook(@Headers() headers: Record<string, string | string[] | undefined>, @Body() body: unknown) {
    return this.billing.receiveWebhook(headers, body);
  }
}
