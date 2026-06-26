import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { DataStore } from "../data.module.js";
import { ProvisioningService } from "../provisioning/provisioning.service.js";

const paypalBaseUrl = () => process.env.PAYPAL_MODE === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

@Injectable()
export class BillingService {
  constructor(private readonly data: DataStore, private readonly provisioning: ProvisioningService) {}

  gateways() {
    return [
      {
        id: "paypal",
        name: "PayPal",
        status: process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "configured" : "missing_credentials",
        mode: process.env.PAYPAL_MODE || "sandbox",
        currency: process.env.PAYPAL_CURRENCY || "USD",
      },
    ];
  }

  async createPayPalOrder(input: { service_id: string; amount: string; description?: string }, user?: { sub?: string; role?: string }) {
    if (!input.service_id || !input.amount) throw new BadRequestException("service_id and amount are required");
    const service = this.data.services.get(input.service_id);
    if (!service) throw new BadRequestException("Unknown service");
    if (user?.role === "customer" && service.owner_user_id !== user.sub) throw new UnauthorizedException("Service is not owned by this customer");
    const accessToken = await this.paypalAccessToken();
    const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          custom_id: input.service_id,
          description: input.description || service.name,
          amount: { currency_code: process.env.PAYPAL_CURRENCY || "USD", value: input.amount },
        }],
        payment_source: {
          paypal: {
            experience_context: {
              return_url: process.env.PAYPAL_RETURN_URL,
              cancel_url: process.env.PAYPAL_CANCEL_URL,
              brand_name: "AetherNode",
              user_action: "PAY_NOW",
            },
          },
        },
      }),
    });
    if (!response.ok) throw new BadRequestException(`PayPal create order failed: ${await response.text()}`);
    return response.json();
  }

  async capturePayPalOrder(orderId: string) {
    if (!orderId) throw new BadRequestException("orderId is required");
    const accessToken = await this.paypalAccessToken();
    const response = await fetch(`${paypalBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    });
    const body = await response.json();
    if (!response.ok) throw new BadRequestException(`PayPal capture failed: ${JSON.stringify(body)}`);
    await this.fulfillPayPalEvent({ event_type: "CHECKOUT.ORDER.APPROVED", resource: body });
    return body;
  }

  async receiveWebhook(headers: Record<string, string | string[] | undefined>, body: any) {
    const verified = await this.verifyWebhook(headers, body);
    if (!verified) throw new UnauthorizedException("Invalid PayPal webhook signature");
    const fulfillment = await this.fulfillPayPalEvent(body);
    return { received: true, verified, fulfillment };
  }

  private async paypalAccessToken(): Promise<string> {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new BadRequestException("PayPal credentials are not configured");
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const response = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    if (!response.ok) throw new BadRequestException(`PayPal auth failed: ${await response.text()}`);
    const body = await response.json() as { access_token: string };
    return body.access_token;
  }

  private async verifyWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): Promise<boolean> {
    if (process.env.PAYPAL_WEBHOOK_VERIFY === "false") return true;
    if (!process.env.PAYPAL_WEBHOOK_ID) return process.env.NODE_ENV !== "production";
    const accessToken = await this.paypalAccessToken();
    const header = (name: string) => {
      const value = headers[name] ?? headers[name.toLowerCase()];
      return Array.isArray(value) ? value[0] : value;
    };
    const response = await fetch(`${paypalBaseUrl()}/v1/notifications/verify-webhook-signature`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_algo: header("paypal-auth-algo"),
        cert_url: header("paypal-cert-url"),
        transmission_id: header("paypal-transmission-id"),
        transmission_sig: header("paypal-transmission-sig"),
        transmission_time: header("paypal-transmission-time"),
        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
        webhook_event: body,
      }),
    });
    if (!response.ok) return false;
    const result = await response.json() as { verification_status?: string };
    return result.verification_status === "SUCCESS";
  }

  private async fulfillPayPalEvent(event: any) {
    const type = event?.event_type || event?.status;
    const resource = event?.resource || event;
    const purchaseUnit = resource?.purchase_units?.[0] || resource?.purchase_units?.[0]?.payments?.captures?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0] || resource?.purchase_units?.[0]?.payments?.captures?.[0];
    const serviceId = purchaseUnit?.custom_id || capture?.custom_id || resource?.custom_id;
    const completed = type === "PAYMENT.CAPTURE.COMPLETED" || resource?.status === "COMPLETED";
    if (!completed || !serviceId) return { action: "ignored", type, service_id: serviceId || null };
    const service = this.data.services.get(serviceId);
    if (!service) return { action: "missing_service", service_id: serviceId };
    service.status = "paid";
    service.updated_at = new Date().toISOString();
    await this.data.saveService(service);
    const job = await this.provisioning.enqueue(service.id, "install");
    await this.data.recordAudit({
      id: crypto.randomUUID(),
      actor: "paypal",
      action: "billing.payment_completed",
      target: service.id,
      metadata: { event_type: type, job_id: job.id },
      created_at: new Date().toISOString(),
    });
    return { action: "queued_provisioning", service_id: service.id, job_id: job.id };
  }
}
