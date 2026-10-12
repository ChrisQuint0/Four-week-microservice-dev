# E-commerce Platform Services

This repository contains two Node.js and Express services:

- **Product Catalog** (`product-service`): product details and stock quantities.
- **Customer Service** (`customer-service`): customer profiles.

Both services currently store data in memory. Seed records are restored when a service restarts; changes made through the API are not persisted.

## Requirements

- Docker Desktop with Docker Compose, or Node.js 24 or later to run locally.

## Run with Docker Compose

From the repository root, run:

```powershell
docker compose up
```

On the first run, Docker downloads the `node:24-alpine` image and each service installs its npm dependencies. The source folders are mounted into the containers, so code changes are available without building custom images. No Dockerfiles are currently used.

Run in the background with `docker compose up -d`. View service output with `docker compose logs -f`, and stop/remove the containers with `docker compose down`.

| Service          | Base URL                | Health check  |
| ---------------- | ----------------------- | ------------- |
| Product Catalog  | `http://localhost:3001` | `GET /health` |
| Customer Service | `http://localhost:3002` | `GET /health` |

The host ports `3001` and `3002` must be available. If Compose reports that a port is already in use, stop the local process using it or change the host-side port in `docker-compose.yml`.

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

Successful responses use a JSON envelope with `success`, `data` (when applicable), and `message`. Product IDs are the catalog's identifiers for use by other services; customer IDs identify customer profiles.
