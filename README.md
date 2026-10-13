# E-commerce Platform Services

This repository contains Node.js and Express services:

- **Product Catalog** (`product-service`): product details and stock quantities.
- **Customer Service** (`customer-service`): customer profiles.
- **Shopping Cart** (`cart-service`): stores customer carts and validates
  customers and products against the other services.
- **Order Service** (`order-service`): creates and tracks orders using verified
  customers, carts, and catalog prices.
- **Payment Service** (`payment-service`): records simulated payments using
  authoritative order totals and confirms orders after successful payment.

All service data is held in memory. Product and customer seed records are
restored on restart; carts, orders, and additional payments are lost when their
services restart.

Payment Service starts with 10 sample payments matching the sample orders.
They are restored to their sample state whenever the service restarts.

## Requirements

- Docker Desktop with Docker Compose, or Node.js 24 or later to run locally.

## Run with Docker Compose

From the repository root, run:

```powershell
docker compose up
```

On the first run, Docker builds the Product Catalog, Customer, Shopping Cart,
Order, and Payment Service images from their service Dockerfiles.

Use `docker compose up --build` after changing files in Product Catalog,
Customer, Shopping Cart, Order, or Payment Service so their images are
rebuilt. Run in the background with `docker compose up -d --build`. View service output with
`docker compose logs -f`, and stop/remove the containers with
`docker compose down`.

Compose sends a termination signal and normally waits up to 10 seconds for
each service to stop. To use a shorter per-container wait, run
`docker compose down --timeout 5`.

| Service          | Base URL                | Health check  |
| ---------------- | ----------------------- | ------------- |
| Product Catalog  | `http://localhost:3001` | `GET /health` |
| Customer Service | `http://localhost:3002` | `GET /health` |
| Shopping Cart    | `http://localhost:3003` | `GET /health` |
| Order Service    | `http://localhost:3004` | `GET /health` |
| Payment Service  | `http://localhost:3005` | `GET /health` |

The host ports `3001` through `3005` must be available. If Compose reports that
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

The order service uses `CUSTOMER_SERVICE_URL`, `CART_SERVICE_URL`, and
`PRODUCT_SERVICE_URL` to locate its dependencies; defaults are
`http://localhost:3002`, `http://localhost:3003`, and `http://localhost:3001`.

Payment Service:

```powershell
cd payment-service
npm install
npm start
```

The payment service uses `ORDER_SERVICE_URL` to locate Order Service; it
defaults to `http://localhost:3004`.

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

| Method   | Route            | Description                       |
| -------- | ---------------- | --------------------------------- |
| `GET`    | `/health`        | Health check                      |
| `GET`    | `/cart`          | List carts                        |
| `GET`    | `/cart/:id`      | Retrieve a cart                   |
| `POST`   | `/cart`          | Create a cart                     |
| `PUT`    | `/cart/:id`      | Update a cart (partial updates)   |
| `DELETE` | `/cart/:id`      | Delete a cart                     |
| `POST`   | `/cart/:id/items` | Add an item to a cart             |

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

| Method   | Route         | Description                           |
| -------- | ------------- | ------------------------------------- |
| `GET`    | `/health`     | Health check                          |
| `GET`    | `/orders`     | List orders                           |
| `GET`    | `/orders/:id` | Retrieve an order                     |
| `POST`   | `/orders`     | Place an order from a cart            |
| `PUT`    | `/orders/:id` | Update the order status               |
| `DELETE` | `/orders/:id` | Delete a test order                   |

Example order request:

```json
{
  "customerId": "cust-001",
  "cartId": "cart-001"
}
```

Order creation verifies the customer and cart, confirms the cart belongs to
that customer, and re-fetches each product from Product Catalog to validate
availability and calculate authoritative prices and totals. New orders start
with status `PENDING`; permitted statuses are `PENDING`, `CONFIRMED`,
`CANCELLED`, and `FAILED`. Product availability is checked but stock is not
reserved or decremented.

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
Order Service. Payment status is maintained independently from order status,
and completed payment statuses cannot be changed.

Successful responses use a JSON envelope with `success`, `data` (when applicable), and `message`. Product IDs are the catalog's identifiers for use by other services; customer IDs identify customer profiles.
