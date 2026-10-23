# Group 1 Comprehensive Project Guide

## E-Commerce and Online Shopping Platform — IT 204

## 1. What Group 1 needs to accomplish

According to the project instructions, Group 1 is the Docker/Image Team and the primary developer of the eight microservices. The assignment begins with two services in Week 1 and expands the same continuous application over four weeks. Group 1 must develop the services, test their REST APIs, create Dockerfiles, and build Docker images, while coordinating with other groups responsible for AWS deployment, networking, API testing, and documentation.

The required technology stack is:

- Node.js + Express — implement REST APIs.
- JSON — exchange structured data between services.
- Docker — package each service into a container.
- Amazon ECR — store Docker images.
- Amazon ECS/Fargate — run the containers in AWS.
- Amazon API Gateway — provide a common client-facing entry point as the project expands.
- Postman — test API endpoints and service integration.
- GitHub — recommended collaboration and version control workflow for Group 1.

The first six technologies are specified in the assignment; GitHub is included here as the proposed collaboration workflow.

## 2. Four-week development roadmap

Week 1 — Foundation

Ports 3001–3002

- Product Catalog Service
- Customer Service
- CRUD endpoints, sample JSON data, Dockerfiles, local tests, and initial images.

Week 2 — Shopping workflow

Ports 3003–3004

- Shopping Cart Service
- Order Service
- Integrate cart items with products and orders with carts and customers.

Week 3 — Transactions and stock

Ports 3005–3006

- Payment Service
- Inventory Service
- Add simulated payments, stock management, and integration through API Gateway.

Week 4 — Complete platform

Ports 3007–3008

- Notification Service
- Authentication Service
- Finish API Gateway routes and demonstrate the complete shopping workflow.

Important: Retain the previous services as new ones are introduced. Test locally before deploying to AWS, use fictional test data, record results and errors in the project journal, and consistently use AWS Region `ap-southeast-1` (Singapore), unless the instructor directs otherwise.

## 3. Recommended project structure

Create one GitHub repository for the entire Group 1 codebase, with separate folders for each independently deployable service.

```
ecommerce-platform/
├── product-service/
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   └── .dockerignore
├── customer-service/
│   ├── server.js
│   ├── package.json
│   ├── package-lock.json
│   ├── Dockerfile
│   └── .dockerignore
├── cart-service/
├── order-service/
├── payment-service/
├── inventory-service/
├── notification-service/
├── auth-service/
├── postman/
│   └── ecommerce-api-collection.json
├── docs/
│   ├── architecture.md
│   ├── api-contracts.md
│   └── project-journal.md
├── .gitignore
└── README.md
```

The abbreviated service folders should eventually have the same basic Node.js project files as the first two services.

This structure is a recommendation, not a folder layout mandated by the assignment. It keeps code, API contracts, test collections, and documentation together without mixing the eight services into one Express application.

## 4. Development standards for all eight services

Before building the services, agree on a few rules so every member can integrate code without constantly changing field names or API responses.

### 4.1 Common API response format

Use the following response format consistently. This is a recommended design convention, not a format explicitly prescribed in the assignment.

Successful response:

```
{
  "success": true,
  "data": {
    "id": "sample-001"
  },
  "message": "Request completed successfully"
}
```

Error response:

```
{
  "success": false,
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "The requested resource was not found"
  }
}
```

Use appropriate HTTP status codes:

| Status                      | Meaning                                           |
| --------------------------- | ------------------------------------------------- |
| `200 OK`                    | Successful retrieval or update                    |
| `201 Created`               | A resource was created                            |
| `400 Bad Request`           | Invalid input or missing fields                   |
| `401 Unauthorized`          | Missing or invalid authentication                 |
| `403 Forbidden`             | Insufficient permissions                          |
| `404 Not Found`             | Requested record does not exist                   |
| `409 Conflict`              | Duplicate record or stock conflict                |
| `500 Internal Server Error` | Unexpected server failure                         |
| `502 Bad Gateway`           | An upstream service returned an unusable response |
| `503 Service Unavailable`   | Required service is unavailable                   |

### 4.2 JSON data rules

1. Use a consistent ID type across all services. This guide uses strings such as `"prod-001"` and `"cust-001"`.
2. Use camelCase for JSON properties: `customerId`, `productId`, and `totalAmount`.
3. Store prices and amounts as numbers in the project examples; never use currency symbols inside the JSON number.
4. Use ISO 8601 timestamps, for example `"2026-10-13T08:00:00Z"`.
5. Validate incoming JSON before creating or updating records.
6. Return clear errors for invalid IDs and missing fields.
7. Keep fictional data in the project. Do not use actual customer information, payment details, or passwords.
8. For the initial lab, in-memory arrays can be used if the instructor permits. They are temporary and are lost when a process restarts. For durable production data, each service would need persistent storage.

### 4.3 Common Express setup

Use a separate `server.js` in each service. The following example illustrates the minimum setup for the Product Catalog Service.

```

const express = require("express");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "product-service",
    status: "UP"
  });
});

// Add the service-specific routes here.

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Product service listening on port ${PORT}`);
});
```

The health endpoint is a recommended addition. Binding to `0.0.0.0` is important for a service running inside a Docker container, as the assignment explicitly requires the first two services to listen on that address.

## 5. Complete JSON data contracts for the eight services

The project PDF specifies the core fields and service responsibilities but leaves some endpoint lists and request details unspecified in its extracted content. The following contracts therefore distinguish between fields required or described by the assignment and recommended fields and API designs to make integration workable.

All examples are illustrative fictional data. Suggested endpoints should be confirmed by Group 1 before other groups implement their integrations.

### Service 1 — Product Catalog (Quinto)

## Product Catalog Service

Folder: `product-service` · Port: `3001`

Owner: Group 1 · Week 1

Purpose: Store and manage the products available for purchase. Other services use its product IDs to validate cart items and order items.

The assignment requires product IDs, names, prices, stock quantities, and CRUD endpoints.

Recommended product object:

```
{
  "id": "prod-001",
  "name": "Wireless Mouse",
  "description": "Wireless optical mouse",
  "price": 599.00,
  "stockQuantity": 25,
  "category": "Accessories"
}
```

Recommended endpoints:

| Method | Endpoint        | Purpose               |
| ------ | --------------- | --------------------- |
| GET    | `/products`     | Retrieve all products |
| GET    | `/products/:id` | Retrieve one product  |
| POST   | `/products`     | Create a product      |
| PUT    | `/products/:id` | Update a product      |
| DELETE | `/products/:id` | Delete a test product |
| GET    | `/health`       | Health check          |

Example request — `POST /products`:

```
{
  "id": "prod-002",
  "name": "USB Keyboard",
  "description": "Wired keyboard",
  "price": 850.00,
  "stockQuantity": 15,
  "category": "Accessories"
}
```

Example list response:

```
{
  "success": true,
  "data": [
    {
      "id": "prod-001",
      "name": "Wireless Mouse",
      "description": "Wireless optical mouse",
      "price": 599.00,
      "stockQuantity": 25,
      "category": "Accessories"
    }
  ],
  "message": "Products retrieved successfully"
}
```

Integration rule: `productId` in the Cart, Order, and Inventory services must refer to the same logical product ID. Product Catalog is the source for product names and prices.

The product's `stockQuantity` is useful as initial catalog data, but the Inventory Service should become the authoritative source for stock availability once that service is introduced.

### Service 2 — Customer (Quinto)

## Customer Service

Folder: `customer-service` · Port: `3002`

Owner: Group 1 · Week 1

Purpose: Manage customer profiles and provide customer information to the Order, Cart, Notification, and Authentication workflows.

The assignment specifies fictional customer records containing an ID, name, and email. Customer records are created only as part of Authentication registration; clients must not create customers directly through Customer Service.

Recommended customer object:

```

{
  "id": "cust-001",
  "name": "Alex Santos",
  "email": "alex.santos@example.test"
}
```

Recommended endpoints:

| Method | Endpoint         | Purpose                                                                |
| ------ | ---------------- | ---------------------------------------------------------------------- |
| GET    | `/customers`     | List customers                                                         |
| GET    | `/customers/:id` | Retrieve one customer                                                  |
| PUT    | `/customers`     | Update a customer's name and/or email using the ID in the request body |
| DELETE | `/customers`     | Delete a customer and cascade-delete its Authentication registration   |
| GET    | `/health`        | Health check                                                           |

There is no public `POST /customers` endpoint. Register a customer through
Authentication Service with `POST http://localhost:3008/register`:

```
{
  "name": "Jamie Reyes",
  "email": "jamie.reyes@example.test",
  "username": "jamie_demo",
  "password": "DemoOnly-123!",
  "role": "CUSTOMER"
}
```

Authentication Service calls its internal Customer Service creation route,
which generates the next available ID, such as `cust-011`, and returns that
ID in the registration response. To verify the new profile, send
`GET http://localhost:3002/customers/{customerId}`. A direct
`POST http://localhost:3002/customers` must not be used and returns
`405 Method Not Allowed`.

Example request — `PUT /customers`:

```
{
  "id": "cust-011",
  "name": "Jamie Reyes Updated",
  "email": "jamie.updated@example.test"
}
```

The `id` is the selector and cannot be changed. Only `name` and `email` may be
updated. Send `PUT http://localhost:3002/customers` with the JSON body above.
Expect `200 OK` and the same unchanged ID. Unknown fields, an update without
`id`, or an update without `name` or `email` return `400 Bad Request`.

Example request — `DELETE /customers`:

```
{
  "id": "cust-011"
}
```

Customer Service removes the customer only after Authentication Service
successfully deletes the linked registration. If Authentication Service is
unavailable, the customer remains and the request fails. After a successful
delete, `GET /customers/{customerId}` returns `404`, and logging in with the
deleted account returns `401`. There is no public
customer-registration deletion endpoint in Authentication Service; the
cascade route is internal to the two services.

Integration rule: The same generated `customerId` must be used in the Cart,
Order, and Notification services. Authentication owns registration and login,
while Customer Service owns customer profile updates and deletion.

### Service 3 — Shopping Cart (Goto)

## Shopping Cart Service

Folder: `cart-service` · Port: `3003`

Owner: Group 1 with Group 9 support · Week 2

Purpose: Store products selected by customers and validate those products against Product Catalog.

The assignment specifically describes cart records containing `customerId`, `productId`, and `quantity`. It also requires the Cart service to check whether a referenced product exists.

Recommended cart object:

```

{
  "id": "cart-001",
  "customerId": "cust-001",
  "items": [
    {
      "productId": "prod-001",
      "quantity": 2
    }
  ],
  "updatedAt": "2026-10-13T08:00:00Z"
}
```

Recommended endpoints:

| Method | Endpoint          | Purpose               |
| ------ | ----------------- | --------------------- |
| GET    | `/cart`           | List carts            |
| GET    | `/cart/:id`       | Retrieve one cart     |
| POST   | `/cart`           | Create a cart         |
| PUT    | `/cart/:id`       | Update a cart         |
| DELETE | `/cart/:id`       | Delete a cart         |
| POST   | `/cart/items`      | Add an item to a cart |
| GET    | `/health`         | Health check          |

The first five are a suggested CRUD contract based on the assignment's cart-service requirement; the item-specific route is an additional convenience.

Example request — `POST /cart`:

```
{
  "customerId": "cust-001",
  "items": [
    {
      "productId": "prod-001",
      "quantity": 2
    },
    {
      "productId": "prod-002",
      "quantity": 1
    }
  ]
}
```

The Cart Service generates an ID for each new cart and returns it in
`data.id`; do not include `id` in the request. Save the returned ID for later
cart operations and checkout.

Example successful response:

```
{
  "success": true,
  "data": {
    "id": "cart-001",
    "customerId": "cust-001",
    "items": [
      {
        "productId": "prod-001",
        "quantity": 2,
        "productName": "Wireless Mouse",
        "unitPrice": 599.00,
        "subtotal": 1198.00
      },
      {
        "productId": "prod-002",
        "quantity": 1,
        "productName": "USB Keyboard",
        "unitPrice": 850.00,
        "subtotal": 850.00
      }
    ],
    "totalAmount": 2048.00
  },
  "message": "Cart created successfully"
}
```

Example request — `POST /cart/items`:

Send this request to `http://localhost:3003/cart/items` with the
`Content-Type: application/json` header. Include the cart ID, product ID, and
quantity in the JSON body.

```json
{
  "id": "cart-001",
  "productId": "prod-002",
  "quantity": 1
}
```

Expect `200 OK`. The response contains the complete updated cart, including
catalog-enriched `productName`, authoritative `unitPrice`, calculated
`subtotal`, and `totalAmount`:

```json
{
  "success": true,
  "data": {
    "id": "cart-001",
    "customerId": "cust-001",
    "items": [
      {
        "productId": "prod-001",
        "quantity": 2,
        "productName": "Wireless Mouse",
        "unitPrice": 599,
        "subtotal": 1198
      },
      {
        "productId": "prod-002",
        "quantity": 1,
        "productName": "USB Keyboard",
        "unitPrice": 850,
        "subtotal": 850
      }
    ],
    "totalAmount": 2048
  },
  "message": "Item added to cart successfully"
}
```

If the product is already in the cart, the new quantity is added to the
existing quantity. For example, adding two more `prod-001` units to
`cart-001` changes its quantity from `2` to `4`; the service still calculates
the price and subtotal from Product Catalog. This route does not reserve
inventory; reservation happens when Order Service creates an order.

Expected error checks:

| Request                                          | Expected result            |
| ------------------------------------------------ | -------------------------- |
| Unknown cart ID in the URL                       | `404 Not Found`            |
| Missing `productId` or `quantity`                | `400 Bad Request`          |
| Zero, negative, decimal, or non-integer quantity | `400 Bad Request`          |
| Unknown product ID                               | `422 Unprocessable Entity` |

The product name, unit price, subtotal, and total in the response are recommended enriched fields. They can be calculated using Product Catalog data.

Integration requirements:

- Verify `customerId` through Customer Service.
- Verify every `productId` through Product Catalog.
- Reject nonexistent products and nonpositive quantities.
- Do not trust client-submitted prices or totals.
- Recheck inventory availability during order processing.

### Service 4 — Order (Goto)

## Order Service

Folder: `order-service` · Port: `3004`

Owner: Group 1 with Group 9 support · Week 2

Purpose: Create and track orders using valid customer and cart information.

The assignment specifies `orderId`, `customerId`, items, total amount, and status. It requires integration with Cart and Customer, with invalid customer or product references handled clearly.

Recommended order object:

```

{
  "id": "ord-001",
  "customerId": "cust-001",
  "cartId": "cart-001",
  "items": [
    {
      "productId": "prod-001",
      "quantity": 2,
      "unitPrice": 599.00,
      "subtotal": 1198.00
    }
  ],
  "totalAmount": 1198.00,
  "status": "PENDING",
  "createdAt": "2026-10-13T08:10:00Z"
}
```

Recommended endpoints:

| Method | Endpoint      | Purpose                         |
| ------ | ------------- | ------------------------------- |
| GET    | `/orders`     | List orders                     |
| GET    | `/orders/:id` | Retrieve an order               |
| POST   | `/orders`     | Place an order                  |
| PUT    | `/orders/:id` | Update permitted order fields   |
| DELETE | `/orders/:id` | Delete a test order, if allowed |
| GET    | `/health`     | Health check                    |

Example request — `POST /orders`:

```
{
  "cartId": "cart-001"
}
```

Order Service retrieves the cart and reads its `customerId`, then validates
that customer through Customer Service. The request only needs the cart ID.
Order Service also obtains authoritative product prices and calculates the
order total instead of accepting an arbitrary total from the client.

Example response:

```
{
  "success": true,
  "data": {
    "id": "ord-001",
    "customerId": "cust-001",
    "cartId": "cart-001",
    "items": [
      {
        "productId": "prod-001",
        "quantity": 2,
        "unitPrice": 599.00,
        "subtotal": 1198.00
      }
    ],
    "totalAmount": 1198.00,
    "status": "PENDING",
    "createdAt": "2026-10-13T08:10:00Z"
  },
  "message": "Order created successfully"
}
```

Recommended statuses: `PENDING`, `CONFIRMED`, `CANCELLED`, and `FAILED`.

Integration requirements:

- Read the cart from Cart Service.
- Verify the customer through Customer Service.
- Validate products and calculate prices using Product Catalog.
- Coordinate stock reservation or deduction with Inventory.
- Pass the final `orderId` and amount to Payment.
- Pass the `customerId` and order reference to Notification.

A key design decision is to keep Order Service as the owner of order status. A payment record's status and an inventory record's quantity should not be used as substitutes for order status.

### Service 5 — Payment (Talato)

## Payment Service

Folder: `payment-service` · Port: `3005`

Owner: Group 1 · Week 3

Purpose: Record simulated payments and provide payment status. No real payment gateway is required by the assignment.

The required fields are `paymentId`, `orderId`, `amount`, and `status`; example statuses are `PENDING`, `PAID`, and `FAILED`.

Recommended payment object:

```

{
  "id": "pay-001",
  "orderId": "ord-001",
  "amount": 1198.00,
  "status": "PENDING",
  "createdAt": "2026-10-13T08:15:00Z",
  "updatedAt": "2026-10-13T08:15:00Z"
}
```

Recommended endpoints:

| Method | Endpoint               | Purpose                     |
| ------ | ---------------------- | --------------------------- |
| GET    | `/payments`            | List payment records        |
| GET    | `/payments/:id`        | Retrieve a payment          |
| POST   | `/payments`            | Create a simulated payment  |
| PATCH  | `/payments/:id/status` | Update the simulated status |
| GET    | `/health`              | Health check                |

Example request — `POST /payments`:

```
{
  "orderId": "ord-001"
}
```

The Payment Service should retrieve the order and its authoritative total from Order Service rather than accepting a freely chosen payment amount.

Example response:

```
{
  "success": true,
  "data": {
    "id": "pay-001",
    "orderId": "ord-001",
    "amount": 1198.00,
    "status": "PENDING",
    "createdAt": "2026-10-13T08:15:00Z",
    "updatedAt": "2026-10-13T08:15:00Z"
  },
  "message": "Simulated payment created"
}
```

Integration requirements:

- Verify the order exists.
- Use the order's actual total.
- Maintain payment status independently from order status.
- When the simulated payment succeeds, notify Order Service so it can apply its agreed order-state transition.
- Reject invalid or duplicate payment requests where appropriate.

Never collect real card numbers, CVVs, bank credentials, or other sensitive payment information for this lab.

### Service 6 — Inventory (Talato)

## Inventory Service

Folder: `inventory-service` · Port: `3006`

Owner: Group 1 · Week 3

Purpose: Track stock availability and update quantities as orders are processed.

The assignment specifies sample product IDs and stock quantities and requires stock retrieval and updates. It also directs the team to ensure the ordering workflow can reach Inventory.

Recommended inventory object:

```

{
  "id": "inv-001",
  "productId": "prod-001",
  "stockQuantity": 25,
  "reservedQuantity": 0,
  "updatedAt": "2026-10-13T08:00:00Z"
}
```

`reservedQuantity` is a recommended extension. It supports the distinction between stock on hand and stock already allocated to pending orders.

Recommended endpoints:

| Method | Endpoint                                   | Purpose                      |
| ------ | ------------------------------------------ | ---------------------------- |
| GET    | `/inventory`                               | List inventory records       |
| GET    | `/inventory/:productId`                    | Retrieve stock for a product |
| POST   | `/inventory`                               | Create a stock record        |
| PATCH  | `/inventory/:productId`                    | Update stock                 |
| POST   | `/inventory/reservations`                  | Reserve stock for an order   |
| POST   | `/inventory/reservations/:orderId/release` | Release a reservation        |
| GET    | `/health`                                  | Health check                 |

The reservation endpoints are recommendations for making order integration more reliable, rather than explicitly listed endpoints in the PDF.

Example stock response:

```
{
  "success": true,
  "data": {
    "id": "inv-001",
    "productId": "prod-001",
    "stockQuantity": 25,
    "reservedQuantity": 2,
    "availableQuantity": 23,
    "updatedAt": "2026-10-13T08:00:00Z"
  },
  "message": "Inventory retrieved successfully"
}
```

Integration requirements:

- `productId` must match Product Catalog.
- `stockQuantity` must never be negative.
- Reject quantities greater than the available stock.
- Reserve stock when an order is accepted; commit the deduction or release the reservation according to the agreed payment/order workflow.
- Avoid letting two simultaneous requests reserve the same units.

For a basic class demonstration, these operations can be implemented simply. A production-grade solution would need atomic updates and persistent storage to prevent concurrent orders from overselling stock.

### Service 7 — Notification (Quinto)

## Notification Service

Folder: `notification-service` · Port: `3007`

Owner: Group 1 · Week 4

Purpose: Create a simulated order-confirmation notification for a customer.

The assignment specifies notification records containing customer ID, message, type, and status, with a confirmation returned when a notification record is created. Real email or SMS delivery is unnecessary unless approved by the instructor.

Recommended notification object:

```

{
  "id": "notif-001",
  "customerId": "cust-001",
  "orderId": "ord-001",
  "message": "Your order ord-001 has been confirmed.",
  "type": "ORDER_CONFIRMATION",
  "status": "CREATED",
  "createdAt": "2026-10-13T08:20:00Z"
}
```

The `orderId`, `id`, and timestamp are recommended additions; the required core fields remain customer ID, message, type, and status.

Recommended endpoints:

| Method | Endpoint                    | Purpose                 |
| ------ | --------------------------- | ----------------------- |
| GET    | `/notifications`            | List notifications      |
| GET    | `/notifications/:id`        | Retrieve a notification |
| POST   | `/notifications`            | Create a notification   |
| PATCH  | `/notifications/:id/status` | Update its status       |
| GET    | `/health`                   | Health check            |

Example request — `POST /notifications`:

```
{
  "customerId": "cust-001",
  "orderId": "ord-001",
  "message": "Your order ord-001 has been confirmed.",
  "type": "ORDER_CONFIRMATION"
}
```

Example response:

```
{
  "success": true,
  "data": {
    "id": "notif-001",
    "customerId": "cust-001",
    "orderId": "ord-001",
    "message": "Your order ord-001 has been confirmed.",
    "type": "ORDER_CONFIRMATION",
    "status": "CREATED",
    "createdAt": "2026-10-13T08:20:00Z"
  },
  "message": "Notification record created successfully"
}
```

Integration requirements:

- Validate `customerId` against Customer Service.
- Include the correct order reference.
- Create the notification only after the appropriate order event, such as confirmation.
- Do not claim that an email or SMS was actually sent. `CREATED` means the notification record exists, not that an external delivery succeeded.

### Service 8 — Authentication (Quinto)

## Authentication Service

Folder: `auth-service` · Port: `3008`

Owner: Group 1 · Week 4

Purpose: Register fictional test accounts, demonstrate login, and demonstrate basic role behavior.

The assignment requires fictional test accounts and basic login and role behavior, and prohibits storing real passwords or sensitive customer information.

Recommended test-account object:

```

{
  "id": "user-001",
  "customerId": "cust-001",
  "username": "alex_demo",
  "role": "CUSTOMER",
  "status": "ACTIVE"
}
```

Do not return passwords, password hashes, or secret tokens as part of the public user profile.

Recommended endpoints:

| Method | Endpoint     | Purpose                               |
| ------ | ------------ | ------------------------------------- |
| POST   | `/register`  | Register a fictional account          |
| POST   | `/login`     | Verify test credentials               |
| GET    | `/users/:id` | Retrieve a non-sensitive user profile |
| PUT    | `/users`     | Update username, password, or role    |
| GET    | `/health`    | Health check                          |

Example registration request. Auth Service creates the linked customer and
receives its generated ID from Customer Service:

```
{
  "name": "Jamie Reyes",
  "email": "jamie.reyes@example.test",
  "username": "jamie_demo",
  "password": "DemoOnly-123!",
  "role": "CUSTOMER"
}
```

Example login request:

```
{
  "username": "alex_demo",
  "password": "DemoOnly-123!"
}
```

Update a user by sending `PUT /users` with the user ID and one or more fields:

```
{
  "id": "user-001",
  "username": "alex_updated",
  "password": "DemoOnly-456!",
  "role": "ADMIN"
}
```

Usernames must be unique, passwords must have at least eight characters, and
roles must be `CUSTOMER` or `ADMIN`. Passwords are re-hashed and never returned
in the response.

Example successful login response:

```
{
  "success": true,
  "data": {
    "userId": "user-001",
    "customerId": "cust-001",
    "username": "alex_demo",
    "role": "CUSTOMER",
    "accessToken": "demo-token-placeholder"
  },
  "message": "Login successful"
}
```

The token shown is a placeholder for illustrating the response shape, not a valid credential.

Integration requirements:

- Associate the account with a real customer record in Customer Service.
- Define how the account's `customerId` is used by the Cart and Order workflows.
- Demonstrate the difference between a `CUSTOMER` role and an optional `ADMIN` role.
- If tokens are implemented, validate them in protected endpoints or at the API Gateway, as appropriate.
- Use a proper password-hashing approach even for a classroom demo if passwords are stored. Keep test credentials fictional and outside GitHub.

## 6. How the eight services integrate

The most important part of this project is not simply making eight APIs. The services must share identifiers and exchange the correct data so that a single shopping transaction works end to end.

### 6.1 ASCII architecture diagram

The following diagram shows the recommended integration architecture. It distinguishes the client-facing API Gateway from the internal REST API calls between microservices.

```

                     CUSTOMER / POSTMAN
                             |
                             v
                   +-------------------+
                   |   API GATEWAY     |
                   | Common API entry  |
                   +-------------------+
                             |
            +----------------+----------------+
            |                |                |
            v                v                v
     +-------------+  +-------------+  +-------------+
     | AUTH        |  | PRODUCT     |  | CUSTOMER    |
     | :3008       |  | CATALOG     |  | SERVICE     |
     | Login/roles |  | :3001       |  | :3002       |
     +------+------+  +------+------+  +------+------+
            |                ^                |
            |                |                |
            |          productId              |
            |                |                |
            |          +-----+------+         |
            |          |            |         |
            |          v            |         v
            |    +-------------+    |  +-------------+
            +--->| CART        |----+->| ORDER       |
                 | :3003       |       | :3004       |
                 | customerId  |       | customerId  |
                 | productId   |       | orderId     |
                 +-------------+       +------+------+
                                              |
                            +-----------------+----------------+
                            |                                  |
                            v                                  v
                     +-------------+                    +-------------+
                     | INVENTORY   |                    | PAYMENT     |
                     | :3006       |                    | :3005       |
                     | Stock       |                    | orderId     |
                     +------+------+                    +------+------+
                            |                                  |
                            +----------------+-----------------+
                                             |
                                             v
                                    +------------------+
                                    | ORDER STATUS     |
                                    | Updated by       |
                                    | Order Service    |
                                    +--------+---------+
                                             |
                                             v
                                    +------------------+
                                    | NOTIFICATION     |
                                    | :3007            |
                                    | customerId       |
                                    | orderId          |
                                    +------------------+

   Deployment path for EACH service:

   Source code -> Docker image -> Amazon ECR
                                   |
                                   v
                             ECS / Fargate
                                   |
                                   v
                            Reachable API endpoint
                                   |
                                   v
                         API Gateway / internal APIs
```

This is a proposed logical architecture. The exact API Gateway integration type, network routes, and service-discovery method depend on the AWS configuration selected by the deployment and networking teams.

### 6.2 Integration map

| Caller         | Service called     | Data passed or retrieved            | Reason                                                        |
| -------------- | ------------------ | ----------------------------------- | ------------------------------------------------------------- |
| API Gateway    | All eight services | HTTP requests and responses         | Common entry point                                            |
| Authentication | Customer           | `customerId`                        | Associate login accounts with customer records                |
| Cart           | Customer           | `customerId`                        | Validate the customer                                         |
| Cart           | Product Catalog    | `productId`                         | Validate product existence and obtain current product details |
| Order          | Cart               | `cartId`, cart items                | Obtain the selected items                                     |
| Order          | Customer           | `customerId`                        | Verify the customer                                           |
| Order          | Product Catalog    | `productId`                         | Validate products and retrieve authoritative prices           |
| Order          | Inventory          | `productId`, quantity, `orderId`    | Check or reserve stock                                        |
| Payment        | Order              | `orderId`                           | Obtain the order and authoritative total                      |
| Order          | Payment            | Payment status or payment reference | Update the order after the simulated payment result           |
| Notification   | Customer / Order   | `customerId`, `orderId`             | Create the correct confirmation record                        |

The assignment explicitly requires Cart-to-Product integration, Order-to-Cart and Customer integration, Order-to-Payment and ordering-workflow-to-Inventory connectivity, and an end-to-end notification workflow. Some additional validation calls in this map are recommended design choices.

### 6.3 How shared JSON data moves between services

The most important relationships are these:

### Relationship 1: Customer identity

Customer Service → Cart → Order → Notification

Shared key: `customerId`

### Relationship 2: Product identity

Product Catalog → Cart → Order → Inventory

Shared key: `productId`

### Relationship 3: Order transaction

Cart → Order → Payment → Order status → Notification

Shared key: `orderId`

Example of the complete data chain

1. Product Catalog returns `prod-001`, its name, and its price.
2. Customer Service returns `cust-001` for the fictional customer.
3. Cart Service stores `cust-001` and a cart item referencing `prod-001`.
4. Order Service retrieves the cart and creates `ord-001`.
5. Inventory verifies that the requested quantity is available.
6. Payment creates `pay-001` associated with `ord-001`.
7. Order Service updates the order based on the simulated payment result.
8. Notification creates `notif-001` referencing `cust-001` and `ord-001`.

This chain only works when the IDs remain consistent across services. For example, an Order request referencing `"prod-999"` must not be accepted if that product does not exist.

## 7. Postman testing plan (Selosa)

Group 1 should provide reproducible local tests before handing the services over for deployment and integration testing.

### Week 1 — Product Catalog and Customer

- Retrieve the product and customer lists.
- Retrieve individual records using valid IDs.
- Register a new fictional customer through Authentication Service and confirm
  that Customer Service receives the generated customer record.
- Update customer name and email without changing the customer ID.
- Delete a customer and confirm its Authentication registration is also removed.
- Test unknown IDs and malformed request bodies.

### Week 2 — Cart and Order

- Create a cart for a valid customer.
- Add a valid product and quantity.
- Submit a nonexistent product ID and verify the error.
- Place an order using an existing cart.
- Submit an invalid customer ID.
- Verify that order items and totals match the source records.

### Week 3 — Payment and Inventory

- Retrieve inventory for an existing product.
- Attempt to reserve more units than are available.
- Create a simulated payment for a valid order.
- Test `PENDING`, `PAID`, and `FAILED` statuses.
- Verify that the order's state changes according to the agreed payment workflow.
- Test invalid order IDs and unavailable services.

### Week 4 — Notification and Authentication

- Register a fictional test account.
- Log in with valid and invalid credentials.
- Test customer and admin role behavior.
- Create a notification for a valid customer and order.
- Run the complete shopping workflow through API Gateway.
- Confirm the final responses and capture screenshots.

Save the requests in a shared Postman collection under `postman/ecommerce-api-collection.json`. Use environment variables for the base URL and service URLs so that the same collection can be reused locally and against the deployed platform.

## 8. Project journal and evidence (Selosa)

The assignment requires the group to record API results, deployment evidence, errors, and solutions in a project journal.

Use a table like this in `docs/project-journal.md`:

| Date   | Service        | Test or task         | Result  | Error / solution | Evidence        |
| ------ | -------------- | -------------------- | ------- | ---------------- | --------------- |
| Week 1 | Product        | `GET /products`      | Pending | —                | Screenshot link |
| Week 1 | Customer       | `POST /customers`    | Pending | —                | Screenshot link |
| Week 2 | Cart           | Invalid product test | Pending | —                | Screenshot link |
| Week 2 | Order          | Valid cart checkout  | Pending | —                | Screenshot link |
| Week 3 | Inventory      | Stock reservation    | Pending | —                | Screenshot link |
| Week 3 | Payment        | Simulated payment    | Pending | —                | Screenshot link |
| Week 4 | Authentication | Login and role test  | Pending | —                | Screenshot link |
| Week 4 | Notification   | Order confirmation   | Pending | —                | Screenshot link |

Use actual results rather than marking tests successful before running them.

Group 1 should keep the following evidence ready for submission:

- Source code and GitHub repository.
- Eight Dockerfiles and successful build output.
- Local API tests and Postman collection.
- JSON request/response examples for each service.
- Integration diagram and API contracts.
- Image tags and ECR references received from the deployment team.
- Project journal documenting errors and fixes.
- Final integrated test results.

The assignment also requires deployment evidence, ECR screenshots, running-task evidence, architecture diagrams, and a presentation. Group 1 should coordinate with the other assigned groups to collect those artifacts.

## 9. Final implementation checklist by week

## Four-week task tracker

0 / 24 complete

### Week 1 — Foundation

Verify development tools and Docker

Build Product Catalog on port 3001

Build Customer on port 3002

Test CRUD endpoints in Postman

Build both Docker images

Commit working code and API examples to GitHub

### Week 2 — Cart and Order

Build Cart on port 3003

Build Order on port 3004

Validate products and customers across services

Calculate order totals from authoritative product data

Build both Docker images

Run integrated cart and order tests

### Week 3 — Payment and Inventory

Build Payment on port 3005

Build Inventory on port 3006

Implement simulated payment statuses

Validate and update stock quantities

Build both Docker images

Coordinate API Gateway routes and test integration

### Week 4 — Completion

Build Notification on port 3007

Build Authentication on port 3008

Implement fictional account login and role behavior

Complete service URLs and API Gateway integration

Build both Docker images

Run the complete end-to-end shopping scenario and document evidence

Reset tracker
