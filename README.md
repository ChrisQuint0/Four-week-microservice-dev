# E-commerce Platform Services

This repository contains Node.js and Express services:

- **Product Catalog** (`product-service`): product details and stock quantities.
- **Customer Service** (`customer-service`): customer profiles.
- **Shopping Cart** (`cart-service`): stores customer carts and validates
  customers and products against the other services.
- **Order Service** (`order-service`): creates and tracks orders using verified
  customers, carts, and catalog prices.

All service data is held in memory. Product and customer seed records are
restored on restart; carts and orders are lost when their services restart.

## Requirements

- Docker Desktop with Docker Compose, or Node.js 24 or later to run locally.

## Run with Docker Compose

From the repository root, run:

```powershell
docker compose up
```

On the first run, Docker builds the Product Catalog, Shopping Cart, and Order
Service images from their service Dockerfiles and downloads the `node:24-alpine`
image for the Customer Service, which mounts its source folder and installs
dependencies at startup.

Use `docker compose up --build` after changing files in Product Catalog,
Shopping Cart, or Order Service so their images are rebuilt. Run in the background with
`docker compose up -d --build`. View service output with
`docker compose logs -f`, and stop/remove the containers with
`docker compose down`.

| Service          | Base URL                | Health check  |
| ---------------- | ----------------------- | ------------- |
| Product Catalog  | `http://localhost:3001` | `GET /health` |
| Customer Service | `http://localhost:3002` | `GET /health` |
| Shopping Cart    | `http://localhost:3003` | `GET /health` |
| Order Service    | `http://localhost:3004` | `GET /health` |

The host ports `3001` through `3004` must be available. If Compose reports that
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
`CANCELLED`, and `FAILED`. Inventory reservation, Payment, and Notification
integrations are placeholders for later service work. Product availability is
checked but stock is not reserved or decremented.

Successful responses use a JSON envelope with `success`, `data` (when applicable), and `message`. Product IDs are the catalog's identifiers for use by other services; customer IDs identify customer profiles.
