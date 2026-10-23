# E-Commerce Platform — Local API and Integration Testing Guide

This README is the tester's guide for the eight-service local workflow. API
Gateway is not part of this project setup. All data is held in memory; restarting
a service resets its data to the sample state. Restart the full stack for a
clean test run.

## 1. Start the services

From the repository root, start all eight services:

```powershell
docker compose up --build
```

Wait until the services are listening. Their local base URLs are:

| Service | Port | Base URL |
| --- | ---: | --- |
| Product Catalog | 3001 | `http://localhost:3001` |
| Customer | 3002 | `http://localhost:3002` |
| Cart | 3003 | `http://localhost:3003` |
| Order | 3004 | `http://localhost:3004` |
| Payment | 3005 | `http://localhost:3005` |
| Inventory | 3006 | `http://localhost:3006` |
| Notification | 3007 | `http://localhost:3007` |
| Authentication | 3008 | `http://localhost:3008` |

Create a Postman environment with:

| Variable | Initial value |
| --- | --- |
| `customerId` | `cust-001` |
| `productId` | `prod-001` |
| `cartId` | Leave empty; save the generated cart ID |
| `orderId` | Leave empty; save the generated order ID |
| `paymentId` | Leave empty; save the generated payment ID |
| `notificationId` | Leave empty; save the automatically generated notification ID |

Add `Content-Type: application/json` to requests with JSON bodies. The local
services do not currently require an `Authorization` header. Use only fictional
data and the demo credentials in this guide.

## 2. Endpoint test checklist

Run the healthy-path checks as part of the workflow below. Also exercise each
listed validation/not-found case, using disposable IDs or data where possible.
IDs for updates and deletes are generally in the JSON body; individual GET
routes continue to take IDs in the URL.

| Service | Endpoint | Checks |
| --- | --- | --- |
| All services | `GET /health` | HTTP 200 and `success: true` |
| Product | `GET /products` | HTTP 200; list includes sample products |
| Product | `GET /products/:id` | Existing product returns 200; unknown ID returns 404 |
| Product | `POST /products` | Valid product returns 201; duplicate ID returns 409; missing/invalid fields return 400 |
| Product | `PUT /products` | Existing ID and valid updated fields return 200; unknown ID returns 404; invalid resulting record returns 400 |
| Product | `DELETE /products` | Body contains only `id`; existing ID returns 200; unknown ID returns 404; malformed body returns 400 |
| Customer | `GET /customers` | HTTP 200 and customer list |
| Customer | `GET /customers/:id` | Existing customer returns 200; unknown ID returns 404 |
| Customer | `POST /customers` | Public creation is disabled; expect 405. Registration is through Auth Service |
| Customer | `PUT /customers` | Update name/email with body `id`; unknown ID returns 404; malformed or invalid fields return 400 |
| Customer | `DELETE /customers` | Body contains only `id`; removes customer and linked Auth record; unknown ID returns 404 |
| Cart | `GET /cart` | HTTP 200 and enriched cart list |
| Cart | `GET /cart/:id` | Existing cart returns 200; unknown ID returns 404 |
| Cart | `POST /cart` | Valid customer/items returns 201 with generated ID; supplied `id` or invalid input returns 400; unknown customer/product returns 422 |
| Cart | `PUT /cart` | Body uses existing `id`; updates provided customer/items; invalid input returns 400; unknown cart returns 404 |
| Cart | `DELETE /cart` | Body contains only `id`; success returns 200; unknown cart returns 404 |
| Cart | `POST /cart/items` | Body requires cart `id`, `productId`, and positive integer `quantity`; missing/invalid values return 400, unknown cart 404, unknown product 422 |
| Order | `GET /orders` | HTTP 200; list includes sample and newly created orders |
| Order | `GET /orders/:id` | Existing order returns 200; unknown ID returns 404 |
| Order | `POST /orders` | Body requires only `cartId`; successful checkout returns 201; invalid/missing cart ID returns 400; unknown cart or customer returns 422; insufficient stock returns 409 |
| Order | `PUT /orders` | Body requires `id` and status `CONFIRMED`, `CANCELLED`, or `FAILED`; invalid values return 400; missing order returns 404; incompatible completed-order change returns 409 |
| Order | `DELETE /orders` | Body contains only `id`; a pending order releases stock before deletion; missing order returns 404 |
| Payment | `GET /payments` | HTTP 200 and payment list |
| Payment | `GET /payments/:id` | Existing payment returns 200; unknown ID returns 404 |
| Payment | `POST /payments` | Body contains only `orderId`; returns 201 with authoritative order amount; invalid request 400, unknown order 422, inactive or duplicate order 409 |
| Payment | `PATCH /payments/status` | Body requires `id` and `PENDING`, `PAID`, or `FAILED`; invalid request 400, missing payment 404, invalid transition 409 |
| Inventory | `GET /inventory` | HTTP 200 with stock, reserved, and available quantities |
| Inventory | `GET /inventory/:productId` | Existing product returns 200; unknown product returns 404 |
| Inventory | `POST /inventory` | Creates stock for an existing catalog product; success 201, invalid body 400, duplicate ID/product 409, unknown product 422 |
| Inventory | `PATCH /inventory` | Body requires `productId` and non-negative integer `stockQuantity`; unknown product 404; cannot reduce stock below reserved amount (409) |
| Inventory | `POST /inventory/reservations` | Internal checkout operation; valid `orderId` and non-empty `items` reserves all-or-none; invalid body 400, unknown inventory 422, insufficient stock 409 |
| Inventory | `GET /inventory/reservations/:orderId` | Existing reservation returns 200; unknown reservation returns 404 |
| Inventory | `POST /inventory/reservations/:orderId/commit` | Internal payment/order operation; reserved quantities are deducted from stock; missing reservation 404; incompatible completed reservation 409 |
| Inventory | `POST /inventory/reservations/:orderId/release` | Internal cancellation/failure operation; releases reserved quantity without deducting stock; missing reservation 404; incompatible completed reservation 409 |
| Notification | `GET /notifications` | HTTP 200 and notification list |
| Notification | `GET /notifications/:id` | Existing notification returns 200; unknown ID returns 404 |
| Notification | `POST /notifications` | Body requires `customerId` and `orderId`; validates customer/order; success 201 or returns existing notification for same order; invalid body 400, unknown/mismatched customer/order 422, unconfirmed order 409 |
| Notification | `PATCH /notifications/status` | Body requires `id` and `CREATED`, `SENT`, or `FAILED`; invalid body 400, unknown ID 404 |
| Auth | `POST /register` | Creates a Customer and linked account; valid request 201, malformed data 400, duplicate username/customer conflict 409 |
| Auth | `POST /login` | Valid credentials return 200; malformed body 400; incorrect username/password 401 |
| Auth | `GET /users/:id` | Returns a non-sensitive user profile; unknown ID 404 |
| Auth | `PUT /users` | Body requires user `id` and one or more of username/password/role; invalid data 400, unknown user 404, duplicate username 409 |

The internal `POST /internal/customers` and
`DELETE /internal/users/customer/:customerId` routes are service-to-service
routes used by Auth and Customer Services. Test them through registration and
customer deletion rather than treating them as public client APIs.

## 3. Health checks

Send `GET /health` to each base URL on ports 3001–3008. Every service should
return HTTP 200 and `success: true`. Resolve any unavailable service before
continuing.

## 4. Authentication and customer setup

Authentication Service starts with the fictional demo account. Test login
using `POST http://localhost:3008/login`:

```json
{
  "username": "alex_demo",
  "password": "DemoOnly-123!"
}
```

Expect HTTP 200. The response includes `userId`, `customerId: "cust-001"`,
username, role, and a demo access token. Save the returned `customerId` as
`customerId`; the demo token is a placeholder and is not required on other
requests.

Test registration separately with `POST http://localhost:3008/register`:

```json
{
  "name": "Jamie Demo",
  "email": "jamie.demo@example.test",
  "username": "postman_demo",
  "password": "DemoOnly-456!",
  "role": "CUSTOMER"
}
```

Expect HTTP 201. Auth Service creates the customer through Customer Service
and returns generated `data.customerId` and `data.id`. Save them as
`registeredCustomerId` and `userId`. Repeating the same username should return
409. Retrieve the account with `GET http://localhost:3008/users/{{userId}}`;
profiles must not expose a password, salt, or password hash.

Test account updates with `PUT http://localhost:3008/users`:

```json
{
  "id": "{{userId}}",
  "username": "postman_demo_updated",
  "password": "DemoOnly-789!",
  "role": "ADMIN"
}
```

Expect HTTP 200 with updated profile fields only. Passwords require at least
eight characters and are re-hashed; roles are `CUSTOMER` or `ADMIN`.
Usernames are unique case-insensitively. Verify login works with the new
username/password and the previous credentials no longer work (401). Updating
one or more of `username`, `password`, and `role` is supported.

For Customer Service, test `GET http://localhost:3002/customers` and
`GET http://localhost:3002/customers/cust-001`; expect HTTP 200 and
`alex.santos@example.test` in the customer record. Direct
`POST http://localhost:3002/customers` returns 405. Test customer updates with
`PUT http://localhost:3002/customers`:

```json
{
  "id": "{{registeredCustomerId}}",
  "name": "Jamie Demo Updated",
  "email": "jamie.updated@example.test"
}
```

Expect HTTP 200. The ID is only a selector and cannot be changed. Deleting a
customer with `DELETE http://localhost:3002/customers` and
`{"id":"{{registeredCustomerId}}"}` also deletes its linked Auth account.
Confirm the customer GET returns 404 and login for that account returns 401.
Use a dedicated test registration; do not delete `cust-001`.

## 5. Product Catalog

Send `GET http://localhost:3001/products`. Expect HTTP 200 and sample product
`prod-001` (Wireless Mouse, price 599, non-negative stock quantity).
`GET http://localhost:3001/products/prod-001` retrieves its details.

Test product creation with `POST http://localhost:3001/products`:

```json
{
  "id": "prod-test-001",
  "name": "Test Headphones",
  "description": "Fictional test product",
  "price": 1200,
  "stockQuantity": 8,
  "category": "Audio"
}
```

Expect HTTP 201. The ID must be unique; a repeated ID returns 409. Product
records require a non-empty ID/name, description and category strings, a
non-negative finite price, and a non-negative integer stock quantity. Missing
or invalid data returns 400.

Update the test product with `PUT http://localhost:3001/products`, including
its ID and any valid fields to change. Expect HTTP 200. Delete it using
`DELETE http://localhost:3001/products` with `{"id":"prod-test-001"}` and
expect HTTP 200. Unknown IDs return 404. Do not delete `prod-001` or `prod-002`
before the integration flow.

## 6. Cart

Create a cart with `POST http://localhost:3003/cart`:

```json
{
  "customerId": "cust-001",
  "items": [{ "productId": "prod-001", "quantity": 2 }]
}
```

The service generates the cart ID; do not send `id`. Expect HTTP 201 and save
`data.id` as `cartId`. The response should include `unitPrice: 599`,
`subtotal: 1198`, and `totalAmount: 1198`. Prices and totals come from Product
Catalog, not from client-supplied values. Invalid customer/item/quantity data
returns 400; unknown customer or product returns 422.

Retrieve the cart with `GET http://localhost:3003/cart/{{cartId}}`; also test
`GET http://localhost:3003/cart`. To add three more units of the same product,
send `POST http://localhost:3003/cart/items`:

```json
{
  "id": "{{cartId}}",
  "productId": "prod-001",
  "quantity": 3
}
```

Expect HTTP 200. The service merges quantities, so the cart now has five
`prod-001` units, subtotal `2995`, and total `2995`. It does not reserve stock.
Try an unknown cart (404), unknown product (422), missing ID/product or
non-positive/non-integer quantity (400). `PUT http://localhost:3003/cart`
updates an existing cart using body `id` (and optional `customerId`/`items`);
`DELETE http://localhost:3003/cart` accepts only `{"id":"{{cartId}}"}`.

## 7. Orders and Inventory

Record the current stock using
`GET http://localhost:3006/inventory/prod-001`. Save
`data.availableQuantity` as `availableBefore`. The sample starts with
`stockQuantity: 25`, `reservedQuantity: 6`, and `availableQuantity: 19` for
`prod-001`.

Create an order from the cart with `POST http://localhost:3004/orders`:

```json
{
  "cartId": "{{cartId}}"
}
```

Only `cartId` is required; Order Service gets and validates the customer ID
from the cart. Expect HTTP 201, save `data.id` as `orderId`, and verify:

- `status` is `PENDING`, `customerId` is `cust-001`, and `cartId` matches.
- `totalAmount` is `2995`; the five units use Product Catalog's price 599.
- Inventory `availableQuantity` decreases by five, but `stockQuantity` remains
  unchanged while the quantity is reserved.

Retrieve the order with `GET http://localhost:3004/orders/{{orderId}}`, list
orders with `GET http://localhost:3004/orders`, and inspect the reservation
with `GET http://localhost:3006/inventory/reservations/{{orderId}}`. It must
be `RESERVED`, reference the same order, and contain five `prod-001` units.

Test order error handling:

- `POST /orders` with `{}` returns 400.
- `POST /orders` with `{"cartId":"cart-does-not-exist"}` returns 422 and
  creates no order or reservation.
- To test a cart with a missing customer, register a separate fictional
  customer, create a cart for its returned customer ID, delete that customer
  through `DELETE /customers`, and submit an order using that cart ID. Expect
  422 (`Customer not found`); inventory should not be reserved.
- An order with an unknown product is rejected with 422 and must not leave a
  partial reservation.
- A request exceeding available inventory returns 409 and must not reserve
  any of its items.

Inventory endpoint tests:

- `GET /inventory` lists stock records and computed `availableQuantity`.
- `GET /inventory/prod-001` retrieves stock; unknown product returns 404.
- `POST /inventory` creates stock for a catalog product using
  `{"id":"inv-test-001","productId":"prod-test-001","stockQuantity":8}`.
  It returns 201; invalid input returns 400, duplicate ID/product 409, and
  missing catalog product 422.
- `PATCH /inventory` updates stock with
  `{"productId":"prod-test-001","stockQuantity":10}`. It returns 200; invalid
  values return 400, unknown product 404, and a value below reservations 409.
- Reservation endpoints are used automatically by checkout/status updates.
  Their direct API contract is in the endpoint checklist above. Verify
  reservation GETs during checkout, cancellation, and payment tests.

Test cancellation on a separate one-item cart/order so the main order remains
pending for payment:

1. Create another cart for `cust-001` containing one `prod-001`; save its
   generated ID. Record inventory available quantity.
2. Create an order with `POST /orders` and that cart ID. Save the new order
   ID; available quantity decreases by one.
3. Send `PUT http://localhost:3004/orders`:

   ```json
   {
     "id": "{{cancelOrderId}}",
     "status": "CANCELLED"
   }
   ```

   Expect HTTP 200. The reservation becomes `RELEASED`, available quantity
   returns to the pre-checkout value, and stock on hand is unchanged.
4. A completed order cannot transition to a different status (409).

Also test deletion on a separate pending one-item order:
`DELETE http://localhost:3004/orders` with `{"id":"{{deleteOrderId}}"}`.
Expect HTTP 200; its pending reservation is released before deletion,
available stock is restored, and subsequent `GET /orders/{{deleteOrderId}}`
returns 404. Do not delete the main order.

## 8. Payments and automatic notifications

Create a payment for the still-pending main order using
`POST http://localhost:3005/payments`:

```json
{
  "orderId": "{{orderId}}"
}
```

Expect HTTP 201. Save `data.id` as `paymentId`. Amount is taken from Order
Service (`2995`) and status starts `PENDING`; clients cannot choose amount.
Verify with `GET http://localhost:3005/payments/{{paymentId}}` and list with
`GET http://localhost:3005/payments`.

Change its status with `PATCH http://localhost:3005/payments/status`:

```json
{
  "id": "{{paymentId}}",
  "status": "PAID"
}
```

On success, verify all automated effects:

1. Payment becomes `PAID`.
2. Payment Service automatically updates the order to `CONFIRMED`.
3. Order Service commits the inventory reservation; it becomes `COMMITTED`,
   `reservedQuantity` falls, and stock on hand is reduced by five.
4. Payment Service automatically `POST`s a confirmation to Notification
   Service. No manual notification POST is needed for this order.

Get notifications with `GET http://localhost:3007/notifications`, find the
record for `{{orderId}}`, save its ID as `notificationId`, and verify its
`customerId`, `orderId`, `type: "ORDER_CONFIRMATION"`, `status: "CREATED"`,
and order-specific message. Retrieve it with
`GET http://localhost:3007/notifications/{{notificationId}}`. To simulate
delivery, send `PATCH http://localhost:3007/notifications/status`:

```json
{
  "id": "{{notificationId}}",
  "status": "SENT"
}
```

Expect HTTP 200. `SENT` means the test updated the simulated notification
record; this project does not send a real email or SMS.

Retrying the same `PAID` status is idempotent and must not create a duplicate
notification. Notification Service also returns the existing notification
when the same order is posted again. If Notification Service is unavailable,
the payment update returns 503 and the payment stays `PENDING` (the order may
already be `CONFIRMED`). Restore Notification Service and retry the same
`PAID` request; the order confirmation and notification creation are safe to
retry.

Payment negative checks:

- Creating a payment for an unknown order returns 422.
- Creating a payment for a cancelled/failed order or a second payment for the
  same order returns 409.
- Supplying amount or other extra fields to `POST /payments` returns 400.
- Invalid status returns 400; unknown payment returns 404.
- A failed payment for a pending order makes the order `FAILED` and releases
  inventory. A failed payment for a confirmed order returns 409.
- A completed payment cannot transition to the other completed status (409).

Notification direct-endpoint checks (use only separate test orders):

- Create a separate confirmed order that has not already generated its
  automatic notification. Send `POST http://localhost:3007/notifications`:

  ```json
  {
    "customerId": "cust-001",
    "orderId": "{{confirmedTestOrderId}}"
  }
  ```

  Expect HTTP 201 and save `data.id`. Posting the same customer/order pair
  again returns HTTP 200 with the same notification instead of creating a
  duplicate.
- `POST /notifications` requires both `customerId` and `orderId`; malformed
  fields return 400.
- The customer must exist, the order must exist, and the customer must own
  that order; unknown or mismatched resources return 422.
- The order must be `CONFIRMED`; otherwise notification creation returns 409.
- `PATCH /notifications/status` accepts only `CREATED`, `SENT`, or `FAILED`;
  unknown IDs return 404 and invalid bodies/statuses return 400.

## 9. Automated verification

Install dependencies once in each service folder if not already installed.
From the repository root, run:

```powershell
Push-Location auth-service; npm test; Pop-Location
Push-Location cart-service; npm test; Pop-Location
Push-Location inventory-service; npm test; Pop-Location
Push-Location order-service; npm test; Pop-Location
Push-Location payment-service; npm test; Pop-Location
Push-Location notification-service; npm test; Pop-Location
```

The automated suites cover Auth, Cart, Inventory, Order, Payment, and
Notification integration. Product and Customer endpoint CRUD/error checks
should also be run manually using the Postman steps above.

## Runtime notes

- All services keep data in memory. Changes and generated resources disappear
  when the owning service restarts.
- Inventory starts with reservations for pending sample orders `ord-002`,
  `ord-004`, `ord-007`, and `ord-010`. `prod-001` begins with six reserved
  units; account for this when comparing available stock.
- Payment starts with ten sample payment records. Notification Service starts
  with no notifications.
- Use `docker compose up --build` after code changes. To run detached, use
  `docker compose up -d --build`; view logs with `docker compose logs -f`;
  stop the stack with `docker compose down`.
- Services call one another using Compose service URLs. For local standalone
  execution, set the corresponding `*_SERVICE_URL` environment variables when
  defaults are not appropriate.

The older standalone guide path now redirects here:
[docs/testing-guide.md](docs/testing-guide.md).
