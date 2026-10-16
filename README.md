# E-commerce Platform Services

This repository contains Node.js and Express services:

- **Product Catalog** (`product-service`): product details and stock quantities.
- **Customer Service** (`customer-service`): customer profiles.
- **Shopping Cart** (`cart-service`): stores customer carts and validates
  customers and products against the other services.
- **Order Service** (`order-service`): creates and tracks orders using verified
  customers, carts, catalog prices, and Inventory reservations.
- **Payment Service** (`payment-service`): records simulated payments using
  authoritative order totals and updates orders after payment succeeds or fails.
- **Inventory Service** (`inventory-service`): tracks stock availability and
  supports reserving, committing, and releasing stock for orders.
- **Notification Service** (`notification-service`): creates simulated order
  confirmation notifications after validating the customer.
- **Authentication Service** (`auth-service`): registers fictional accounts,
  verifies credentials, and returns non-sensitive user profiles.
All service data is held in memory. Each service restores its sample records
on restart; changes and additional records are lost. Authentication accounts
and notifications are also lost on restart. Inventory reservations are lost
when Inventory Service restarts.

Payment Service starts with 10 sample payments matching the sample orders.
They are restored to their sample state whenever the service restarts.

## Requirements

- Docker Desktop with Docker Compose, or Node.js 24 or later to run locally.

## Run with Docker Compose

From the repository root, run:

```powershell
docker compose up
```

On the first run, Docker builds all eight service images from their service
Dockerfiles.

Use `docker compose up --build` after changing any service so its image is
rebuilt. Run in the background with `docker compose up -d --build`. View service output with
`docker compose logs -f`, and stop/remove the containers with
`docker compose down`.

Compose sends a termination signal and normally waits up to 10 seconds for
each service to stop. To use a shorter per-container wait, run
`docker compose down --timeout 5`.

| Service           | Base URL                | Health check  |
| ----------------- | ----------------------- | ------------- |
| Product Catalog   | `http://localhost:3001` | `GET /health` |
| Customer Service  | `http://localhost:3002` | `GET /health` |
| Shopping Cart     | `http://localhost:3003` | `GET /health` |
| Order Service     | `http://localhost:3004` | `GET /health` |
| Payment Service   | `http://localhost:3005` | `GET /health` |
| Inventory Service | `http://localhost:3006` | `GET /health` |
| Notification Service | `http://localhost:3007` | `GET /health` |
| Authentication Service | `http://localhost:3008` | `GET /health` |

The host ports `3001` through `3008` must be available. If Compose reports that
a port is already in use, stop the local process using it or change the
host-side port in `docker-compose.yml`.

## Run Locally

Run each service in a separate terminal from the repository root.

Product Catalog:

```powershell
cd product-service
npm install
npm start
```

Customer Service:

```powershell
cd customer-service
npm install
npm start
```

Shopping Cart:

```powershell
cd cart-service
npm install
npm start
```

The cart service uses `CUSTOMER_SERVICE_URL` and `PRODUCT_SERVICE_URL` to locate
the customer and product services; defaults are `http://localhost:3002` and
`http://localhost:3001`.

Order Service:

```powershell
cd order-service
npm install
npm start
```

The order service uses `CUSTOMER_SERVICE_URL`, `CART_SERVICE_URL`,
`PRODUCT_SERVICE_URL`, and `INVENTORY_SERVICE_URL` to locate its dependencies;
defaults are `http://localhost:3002`, `http://localhost:3003`,
`http://localhost:3001`, and `http://localhost:3006`. Start Inventory before
placing orders locally; Compose configures the service URLs and startup order.

Payment Service:

```powershell
cd payment-service
npm install
npm start
```

The payment service uses `ORDER_SERVICE_URL` to locate Order Service; it
defaults to `http://localhost:3004`.

Inventory Service:

```powershell
cd inventory-service
npm install
npm start
```

The inventory service uses `PRODUCT_SERVICE_URL` to validate products when
creating stock records; it defaults to `http://localhost:3001`.

Notification Service:

```powershell
cd notification-service
npm install
npm start
```

Authentication Service:

```powershell
cd auth-service
npm install
npm start
```

Both services use `CUSTOMER_SERVICE_URL` to validate customer references; it
defaults to `http://localhost:3002`. Authentication data and notifications are
held in memory and reset when their service restarts. Passwords are stored as
PBKDF2 hashes; login tokens are demo placeholders and are not suitable for
production authentication.
Run its integration tests with `npm test` from `inventory-service`.

## API Routes

### Product Catalog

| Method   | Route           | Description                                     |
| -------- | --------------- | ----------------------------------------------- |
| `GET`    | `/health`       | Health check                                    |
| `GET`    | `/products`     | List products                                   |
| `GET`    | `/products/:id` | Get a product                                   |
| `POST`   | `/products`     | Create a product                                |
| `PUT`    | `/products/:id` | Update a product (partial updates are accepted) |
| `DELETE` | `/products/:id` | Delete a product                                |

Example product request:

```json
{
  "id": "prod-002",
  "name": "USB Keyboard",
  "description": "Wired keyboard",
  "price": 850,
  "stockQuantity": 15,
  "category": "Accessories"
}
```

### Customer Service

| Method   | Route            | Description                                      |
| -------- | ---------------- | ------------------------------------------------ |
| `GET`    | `/health`        | Health check                                     |
| `GET`    | `/customers`     | List customers                                   |
| `GET`    | `/customers/:id` | Get a customer                                   |
| `POST`   | `/customers`     | Create a customer                                |
| `PUT`    | `/customers/:id` | Update a customer (partial updates are accepted) |
| `DELETE` | `/customers/:id` | Delete a customer                                |

Example customer request:

```json
{
  "id": "cust-002",
  "name": "Jamie Reyes",
  "email": "jamie.reyes@example.test"
}
```

### Shopping Cart

| Method   | Route             | Description                     |
| -------- | ----------------- | ------------------------------- |
| `GET`    | `/health`         | Health check                    |
| `GET`    | `/cart`           | List carts                      |
| `GET`    | `/cart/:id`       | Retrieve a cart                 |
| `POST`   | `/cart`           | Create a cart                   |
| `PUT`    | `/cart/:id`       | Update a cart (partial updates) |
| `DELETE` | `/cart/:id`       | Delete a cart                   |
| `POST`   | `/cart/:id/items` | Add an item to a cart           |

Example cart request:

```json
{
  "id": "cart-001",
  "customerId": "cust-001",
  "items": [
    { "productId": "prod-001", "quantity": 2 },
    { "productId": "prod-002", "quantity": 1 }
  ]
}
```

Cart creation and updates verify the customer and each referenced product
through their services. Product names, prices, subtotals, and the cart total are
looked up and calculated by the cart service; client-submitted prices and totals
are ignored. Quantities must be positive integers. Cart validation does not
reserve stock.

### Order Service

| Method   | Route         | Description                |
| -------- | ------------- | -------------------------- |
| `GET`    | `/health`     | Health check               |
| `GET`    | `/orders`     | List orders                |
| `GET`    | `/orders/:id` | Retrieve an order          |
| `POST`   | `/orders`     | Place an order from a cart |
| `PUT`    | `/orders/:id` | Update the order status    |
| `DELETE` | `/orders/:id` | Delete a test order        |

Example order request:

```json
{
  "customerId": "cust-001",
  "cartId": "cart-001"
}
```

Order creation verifies the customer and cart, confirms the cart belongs to
that customer, and re-fetches each product from Product Catalog to validate
product identities and calculate authoritative prices and totals. It then
reserves all items in Inventory before storing the new `PENDING` order.
Inventory is the source of stock availability; Product Catalog's
`stockQuantity` is no longer used to accept or reject an order.

Only pending orders can move to `CONFIRMED`, `CANCELLED`, or `FAILED`.
Confirmation commits the Inventory reservation and deducts stock. Cancellation
or failure releases the reservation. Order status changes only after Inventory
confirms the operation; dependency failures leave the order pending for retry.
Repeated updates to the same status are safe. Completed orders cannot change
to another status or reopen. Concurrent status updates and deletion of the
same order return a conflict while one operation is running.

Deleting a pending test order releases its stock first. Deleting a completed
test order removes only that record and does not restock committed quantities.
If the reservation is missing, a pending order's status change or deletion
fails instead of silently accepting an inconsistent stock state.

### Payment Service

| Method  | Route                  | Description                            |
| ------- | ---------------------- | -------------------------------------- |
| `GET`   | `/health`              | Health check                           |
| `GET`   | `/payments`            | List simulated payments                |
| `GET`   | `/payments/:id`        | Retrieve a payment                     |
| `POST`  | `/payments`            | Create a payment for an existing order |
| `PATCH` | `/payments/:id/status` | Update payment status                  |

Create a payment by sending only the order ID:

```json
{
  "orderId": "ord-001"
}
```

Payment Service retrieves the order and uses its `totalAmount`; clients cannot
choose the payment amount. Only one payment may be created per order. Payments
start in `PENDING`; updating a payment to `PAID` confirms its order through
Order Service, which commits reserved stock. Updating it to `FAILED` fails a
pending order through Order Service, which releases stock. An already cancelled
or failed order can record a failed payment without changing its order status.
A confirmed order cannot accept a failed payment. Payment and order statuses
remain separate fields; completed payment statuses cannot be changed.
If the order/stock operation fails, payment remains pending for retry.

### Inventory Service

| Method  | Route                                      | Description                                  |
| ------- | ------------------------------------------ | -------------------------------------------- |
| `GET`   | `/health`                                  | Health check                                 |
| `GET`   | `/inventory`                               | List stock records                           |
| `GET`   | `/inventory/:productId`                    | Retrieve stock for a product                 |
| `POST`  | `/inventory`                               | Create stock for an existing catalog product |
| `PATCH` | `/inventory/:productId`                    | Update stock on hand                         |
| `POST`  | `/inventory/reservations`                  | Reserve stock for an order reference         |
| `GET`   | `/inventory/reservations/:orderId`         | Retrieve a reservation                       |
| `POST`  | `/inventory/reservations/:orderId/commit`  | Deduct reserved stock                        |
| `POST`  | `/inventory/reservations/:orderId/release` | Release reserved stock                       |

Inventory starts with 10 records (`inv-001` through `inv-010`) matching the
catalog's product IDs and initial stock quantities. Each record contains
`id`, `productId`, `stockQuantity`, `reservedQuantity`, and `updatedAt`.
Responses also calculate `availableQuantity` as stock on hand minus reservations.
It also starts with reservations for the pending sample orders `ord-002`,
`ord-004`, `ord-007`, and `ord-010`. Initially, `prod-001` has 6 reserved units
and 19 available, and `prod-002` has 1 reserved unit and 14 available.
Historical confirmed sample orders are already accounted for in stock on hand.

Create stock after creating the corresponding product in Product Catalog:

```json
{
  "id": "inv-011",
  "productId": "prod-011",
  "stockQuantity": 20
}
```

Stock quantities must be non-negative safe integers. IDs and product IDs must
be unique. `PATCH /inventory/:productId` accepts only `stockQuantity`, which
cannot be reduced below the quantity currently reserved. Reserved and available
quantities are maintained by the server.

Example reservation request:

```json
{
  "orderId": "ord-001",
  "items": [
    { "productId": "prod-001", "quantity": 2 },
    { "productId": "prod-002", "quantity": 1 }
  ]
}
```

Reservations require a non-empty order reference and positive safe integer
quantities. Repeated product IDs are merged. All items must have stock records
and sufficient available stock; a failed request reserves nothing. Availability
checking and mutation occur synchronously in one service process to prevent
concurrent requests from reserving the same units.

Reservations start in `RESERVED`. Commit changes the status to `COMMITTED` and
reduces both stock on hand and reserved quantities. Release changes the status
to `RELEASED` and reduces only reserved quantities. Repeating the same action
is safe; a completed reservation cannot change to the other completed status.
Retrying reservation creation with the same order ID and equivalent items
returns the existing reserved or committed reservation. Different items, or
attempting to reuse a released order reference, return a conflict.

Inventory accepts the caller's order reference without fetching Order Service.
Order Service calls reservation endpoints automatically during checkout and
status updates. Payment communicates with Order, which owns the order status
and coordinates committing or releasing stock. Inventory changes do not
synchronize Product Catalog's stock field.

Inventory HTTP operations use a five-second timeout and one retry on network
or server failure, with the same order ID to avoid duplicate mutations. An
unsuccessful checkout with an ambiguous reservation result attempts to release
its stock; if cleanup also fails, the order ID is logged for reconciliation.
These are separate HTTP operations, not a distributed transaction.

Stock guarantees apply to one running Inventory instance with in-memory data.
Restarting just one service can leave its state inconsistent with the others.
For a clean classroom demonstration, restart the full stack together to restore
matching sample orders, payments, and inventory reservations.

## Integrated Inventory Workflow

With all services running, use Postman to:

1. `GET /inventory/prod-001` on port 3006 and note stock and reservations.
2. `POST /orders` on port 3004 with `customerId: "cust-001"` and
   `cartId: "cart-001"`. Save the returned order ID. Two units are reserved.
3. `POST /payments` on port 3005 with that `orderId`. Save the payment ID.
4. `PATCH /payments/:id/status` with `{"status":"PAID"}`. The order becomes
   confirmed, stock on hand falls by two, and its reservation is committed.
5. Repeat with a new order and `{"status":"FAILED"}` to verify stock is
   released without reducing stock on hand.
6. Create another order and `PUT /orders/:id` with `{"status":"CANCELLED"}`
   to verify cancellation also releases stock.

Run the connected Cart/Order/Inventory/Payment tests with `npm test` from
`order-service` after installing dependencies in those service folders.

Successful responses use a JSON envelope with `success`, `data` (when applicable), and `message`. Product IDs are the catalog's identifiers for use by other services; customer IDs identify customer profiles.
