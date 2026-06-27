# AetherPanel Launch Flow

## Manual user to instance assignment

1. Log in to `https://panel.aethernode.org` as a superadmin or provider admin.
2. Open `Users`.
3. Create the customer account with role `customer`, or select an existing user.
4. In `Instance Assignments`, choose the customer in the instance owner selector.
5. Open `Instances`, select the service, and confirm `Assignment & Status` shows the correct owner.

Customers only see services where `owner_user_id` matches their user id. Staff and superadmins can see all services.

## Paid checkout fulfillment

AetherNode.org should call AetherPanel after PayPal confirms payment:

```http
POST https://panel.aethernode.org/api/v1/billing/fulfillment/payment-completed
Content-Type: application/json
x-aetherpanel-secret: ${AETHERPANEL_FULFILLMENT_SECRET}
```

```json
{
  "paid": true,
  "customer_email": "customer@example.com",
  "customer_name": "Customer Name",
  "template_id": "minecraft-java",
  "service_name": "Customer Minecraft",
  "amount": "24.99",
  "currency": "USD",
  "payment_id": "PAYPAL-CAPTURE-ID",
  "location_id": "local",
  "node_id": "local",
  "startup_variables": {}
}
```

The fulfillment endpoint:

- Creates or reuses the customer account.
- Assigns the service to that user.
- Marks the service `paid`.
- Queues the provisioning job.
- Creates a welcome email in `Mail`.

## Customer email review

Open `Mail` in the admin panel to review generated customer messages. SMTP delivery can be connected later, but the outbox gives operators the exact login/server details produced by automation.

## Scheduled automation

Open `Scheduler` after selecting an instance. Supported task actions:

- `backup`
- `restart`
- `start`
- `stop`
- `kill`
- `command`

Supported cadences:

- `manual`
- `hourly`
- `daily`
- `weekly`
- `interval`

Use scheduled backups before risky updates, daily restarts for games that need routine process refreshes, and command tasks for in-game warnings before maintenance.
