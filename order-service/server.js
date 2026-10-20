const crypto = require("node:crypto");
const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3004;
const requestTimeout = 5000;
const orderStatuses = new Set([
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "FAILED",
]);

class ServiceRequestError extends Error {
  constructor(serviceName, upstreamStatus, cause) {
    super(`${serviceName} service request failed`, { cause });
    this.serviceName = serviceName;
    this.upstreamStatus = upstreamStatus;
  }
}

async function fetchServiceResource(url, serviceName) {
  let response;

  try {
    response = await axios.get(url, { timeout: requestTimeout });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new ServiceRequestError(
        serviceName,
        error.response?.status,
        error,
      );
    }

    throw error;
  }

  if (
    response.data?.success !== true ||
    response.data.data === null ||
    typeof response.data.data !== "object"
  ) {
    throw new ServiceRequestError(serviceName, 502);
  }

  return response.data.data;
}

function handleServiceError(error, response) {
  if (error instanceof ServiceRequestError) {
    if (
      error.serviceName === "Inventory" &&
      [409, 422].includes(error.upstreamStatus)
    ) {
      return response.status(error.upstreamStatus).json({
        success: false,
        message:
          typeof error.cause?.response?.data?.message === "string"
            ? error.cause.response.data.message
            : "Inventory could not complete the stock operation",
      });
    }
    if (error.upstreamStatus === 404) {
      return response.status(422).json({
        success: false,
        message: `${error.serviceName} not found`,
      });
    }

    if (error.upstreamStatus === undefined || error.upstreamStatus === 503) {
      return response.status(503).json({
        success: false,
        message: `${error.serviceName} service is unavailable`,
      });
    }

    return response.status(502).json({
      success: false,
      message: `${error.serviceName} service returned an invalid response`,
    });
  }

  console.error("Unexpected error in order service:", error);
  return response.status(500).json({
    success: false,
    message: "Order request could not be completed",
  });
}

function createApp({
  customerServiceUrl =
    process.env.CUSTOMER_SERVICE_URL || "http://localhost:3002",
  cartServiceUrl = process.env.CART_SERVICE_URL || "http://localhost:3003",
  productServiceUrl =
    process.env.PRODUCT_SERVICE_URL || "http://localhost:3001",
  inventoryServiceUrl =
    process.env.INVENTORY_SERVICE_URL || "http://localhost:3006",
} = {}) {
  const app = express();
  const seedOrders = [
    {
      id: "ord-001",
      customerId: "cust-001",
      cartId: "cart-001",
      items: [{ productId: "prod-001", quantity: 2, unitPrice: 599 }],
      status: "CONFIRMED",
    },
    {
      id: "ord-002",
      customerId: "cust-002",
      cartId: "cart-002",
      items: [{ productId: "prod-002", quantity: 1, unitPrice: 850 }],
      status: "PENDING",
    },
    {
      id: "ord-003",
      customerId: "cust-003",
      cartId: "cart-003",
      items: [
        { productId: "prod-001", quantity: 1, unitPrice: 599 },
        { productId: "prod-002", quantity: 1, unitPrice: 850 },
      ],
      status: "CONFIRMED",
    },
    {
      id: "ord-004",
      customerId: "cust-004",
      cartId: "cart-004",
      items: [{ productId: "prod-001", quantity: 3, unitPrice: 599 }],
      status: "PENDING",
    },
    {
      id: "ord-005",
      customerId: "cust-005",
      cartId: "cart-005",
      items: [{ productId: "prod-002", quantity: 2, unitPrice: 850 }],
      status: "CANCELLED",
    },
    {
      id: "ord-006",
      customerId: "cust-006",
      cartId: "cart-006",
      items: [
        { productId: "prod-001", quantity: 1, unitPrice: 599 },
        { productId: "prod-002", quantity: 2, unitPrice: 850 },
      ],
      status: "CONFIRMED",
    },
    {
      id: "ord-007",
      customerId: "cust-007",
      cartId: "cart-007",
      items: [{ productId: "prod-001", quantity: 2, unitPrice: 599 }],
      status: "PENDING",
    },
    {
      id: "ord-008",
      customerId: "cust-008",
      cartId: "cart-008",
      items: [{ productId: "prod-002", quantity: 1, unitPrice: 850 }],
      status: "FAILED",
    },
    {
      id: "ord-009",
      customerId: "cust-009",
      cartId: "cart-009",
      items: [
        { productId: "prod-001", quantity: 1, unitPrice: 599 },
        { productId: "prod-002", quantity: 1, unitPrice: 850 },
      ],
      status: "CONFIRMED",
    },
    {
      id: "ord-010",
      customerId: "cust-010",
      cartId: "cart-010",
      items: [{ productId: "prod-001", quantity: 1, unitPrice: 599 }],
      status: "PENDING",
    },
  ];
  const orders = seedOrders.map((seedOrder) => {
    const items = seedOrder.items.map((item) => ({
      ...item,
      subtotal: item.unitPrice * item.quantity,
    }));

    return {
      ...seedOrder,
      items,
      totalAmount: items.reduce((total, item) => total + item.subtotal, 0),
      createdAt: new Date().toISOString(),
    };
  });
  const updatingOrderIds = new Set();

  async function updateInventory(order, action) {
    const path =
      action === "reserve"
        ? "/inventory/reservations"
        : `/inventory/reservations/${encodeURIComponent(order.id)}/${action}`;
    const items = order.items.map(({ productId, quantity }) => ({
      productId,
      quantity,
    }));
    let result;
    // Inventory actions are idempotent by order ID. Retry a lost response
    // once using the same ID, so a retry never deducts stock twice.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        result = await axios.post(
          `${inventoryServiceUrl}${path}`,
          action === "reserve" ? { orderId: order.id, items } : {},
          { timeout: requestTimeout },
        );
        break;
      } catch (error) {
        if (!axios.isAxiosError(error)) {
          throw error;
        }
        const status = error.response?.status;
        if (attempt === 0 && (status === undefined || status >= 500)) {
          continue;
        }
        throw new ServiceRequestError("Inventory", status, error);
      }
    }

    const reservation = result.data?.data;
    const expectedStatus = {
      reserve: "RESERVED",
      commit: "COMMITTED",
      release: "RELEASED",
    }[action];
    const expectedItems = new Map(
      items.map((item) => [item.productId, item.quantity]),
    );
    if (
      result.data?.success !== true ||
      reservation?.orderId !== order.id ||
      reservation.status !== expectedStatus ||
      !Array.isArray(reservation.items) ||
      reservation.items.length !== expectedItems.size ||
      new Set(reservation.items.map((item) => item?.productId)).size !==
        expectedItems.size ||
      reservation.items.some(
        (item) =>
          !item ||
          !expectedItems.has(item.productId) ||
          expectedItems.get(item.productId) !== item.quantity,
      )
    ) {
      throw new ServiceRequestError("Inventory", 502);
    }
  }

  app.use(express.json());

  app.get("/health", (request, response) => {
    response.json({ success: true, message: "Order service is healthy" });
  });

  app.get("/orders", (request, response) => {
    response.json({
      success: true,
      data: orders,
      message: "Orders retrieved successfully",
    });
  });

  app.get("/orders/:id", (request, response) => {
    const order = orders.find((item) => item.id === request.params.id);
    if (!order) {
      return response.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    return response.json({
      success: true,
      data: order,
      message: "Order retrieved successfully",
    });
  });

  app.post("/orders", async (request, response) => {
    const { customerId, cartId } = request.body || {};
    if (
      typeof customerId !== "string" ||
      customerId.trim().length === 0 ||
      typeof cartId !== "string" ||
      cartId.trim().length === 0
    ) {
      return response.status(400).json({
        success: false,
        message: "Order must include a non-empty customerId and cartId",
      });
    }

    const normalizedCustomerId = customerId.trim();
    const normalizedCartId = cartId.trim();

    let customer;
    let cart;
    try {
      [customer, cart] = await Promise.all([
        fetchServiceResource(
          `${customerServiceUrl}/customers/${encodeURIComponent(normalizedCustomerId)}`,
          "Customer",
        ),
        fetchServiceResource(
          `${cartServiceUrl}/cart/${encodeURIComponent(normalizedCartId)}`,
          "Cart",
        ),
      ]);
    } catch (error) {
      return handleServiceError(error, response);
    }

    if (
      customer.id !== normalizedCustomerId ||
      typeof customer.name !== "string" ||
      typeof customer.email !== "string"
    ) {
      return response.status(502).json({
        success: false,
        message: "Customer service returned an invalid customer",
      });
    }

    if (
      cart.id !== normalizedCartId ||
      cart.customerId !== normalizedCustomerId
    ) {
      return response.status(422).json({
        success: false,
        message: "Cart does not belong to the specified customer",
      });
    }

    if (!Array.isArray(cart.items) || cart.items.length === 0) {
      return response.status(422).json({
        success: false,
        message: "Cart must contain at least one item",
      });
    }

    const requestedItems = new Map();
    for (const item of cart.items) {
      if (
        item === null ||
        typeof item !== "object" ||
        typeof item.productId !== "string" ||
        item.productId.trim().length === 0 ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        return response.status(502).json({
          success: false,
          message: "Cart service returned an invalid cart item",
        });
      }

      const productId = item.productId.trim();
      const quantity = (requestedItems.get(productId) || 0) + item.quantity;
      if (!Number.isSafeInteger(quantity)) {
        return response.status(422).json({
          success: false,
          message: "Total quantity for each product must be a safe integer",
        });
      }

      requestedItems.set(productId, quantity);
    }

    let products;
    try {
      products = await Promise.all(
        [...requestedItems.keys()].map((productId) =>
          fetchServiceResource(
            `${productServiceUrl}/products/${encodeURIComponent(productId)}`,
            "Product",
          ),
        ),
      );
    } catch (error) {
      return handleServiceError(error, response);
    }

    const productsById = new Map();
    for (const product of products) {
      if (
        typeof product.id !== "string" ||
        typeof product.name !== "string" ||
        !Number.isFinite(product.price) ||
        product.price < 0
      ) {
        return response.status(502).json({
          success: false,
          message: "Product service returned an invalid product",
        });
      }

      productsById.set(product.id, product);
    }

    const orderItems = [];
    for (const [productId, quantity] of requestedItems) {
      const product = productsById.get(productId);
      if (!product) {
        return response.status(502).json({
          success: false,
          message: "Product service returned an unexpected product",
        });
      }

      const subtotal = product.price * quantity;
      if (!Number.isFinite(subtotal)) {
        return response.status(422).json({
          success: false,
          message: "Order total is outside the supported range",
        });
      }

      orderItems.push({
        productId,
        quantity,
        unitPrice: product.price,
        subtotal,
      });
    }

    const totalAmount = orderItems.reduce(
      (total, item) => total + item.subtotal,
      0,
    );
    if (!Number.isFinite(totalAmount)) {
      return response.status(422).json({
        success: false,
        message: "Order total is outside the supported range",
      });
    }

    const order = {
      id: `ord-${crypto.randomUUID()}`,
      customerId: normalizedCustomerId,
      cartId: normalizedCartId,
      items: orderItems,
      totalAmount,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };

    try {
      await updateInventory(order, "reserve");
    } catch (error) {
      // A lost or malformed response can hide a successful reservation.
      // Attempt to release it before returning the original error.
      if (error.upstreamStatus === undefined || error.upstreamStatus >= 500) {
        try {
          await updateInventory(order, "release");
        } catch (cleanupError) {
          if (cleanupError.upstreamStatus !== 404) {
            console.error(
              `Inventory cleanup required for ${order.id}:`, cleanupError,
            );
          }
        }
      }
      return handleServiceError(error, response);
    }

    // TODO: Submit this order ID and total to the Payment service.
    // TODO: Notify the customer with the customer and order IDs.
    orders.push(order);
    return response.status(201).json({
      success: true,
      data: order,
      message: "Order created successfully",
    });
  });

  app.put("/orders", async (request, response) => {
    const body = request.body || {};
    if (
      Object.keys(body).length !== 2 ||
      typeof body.id !== "string" ||
      body.id.trim().length === 0 ||
      !Object.hasOwn(body, "status") ||
      typeof body.status !== "string" ||
      !orderStatuses.has(body.status)
    ) {
      return response.status(400).json({
        success: false,
        message: "Order update must include an id and a valid status",
      });
    }

    const order = orders.find((item) => item.id === body.id.trim());
    if (!order) {
      return response.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (updatingOrderIds.has(order.id)) {
      return response.status(409).json({
        success: false,
        message: "Order is already being updated",
      });
    }
    if (order.status === body.status) {
      return response.json({
        success: true,
        data: order,
        message: "Order status is unchanged",
      });
    }
    if (order.status !== "PENDING") {
      return response.status(409).json({
        success: false,
        message: "A completed order cannot change status",
      });
    }

    updatingOrderIds.add(order.id);
    try {
      await updateInventory(
        order, body.status === "CONFIRMED" ? "commit" : "release",
      );
      order.status = body.status;
      return response.json({
        success: true,
        data: order,
        message: "Order updated successfully",
      });
    } catch (error) {
      return handleServiceError(error, response);
    } finally {
      updatingOrderIds.delete(order.id);
    }
  });

  app.delete("/orders", async (request, response) => {
    const body = request.body || {};
    if (
      Object.keys(body).length !== 1 ||
      typeof body.id !== "string" ||
      body.id.trim().length === 0
    ) {
      return response.status(400).json({
        success: false,
        message: "Order deletion must include only a non-empty id",
      });
    }

    const order = orders.find((item) => item.id === body.id.trim());
    if (!order) {
      return response.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (updatingOrderIds.has(order.id)) {
      return response.status(409).json({
        success: false,
        message: "Order is already being updated",
      });
    }
    updatingOrderIds.add(order.id);
    try {
      if (order.status === "PENDING") {
        await updateInventory(order, "release");
      }
      // Locate it again after the HTTP call; another order may have been deleted.
      orders.splice(orders.indexOf(order), 1);
      return response.json({
        success: true,
        data: order,
        message: "Order deleted successfully",
      });
    } catch (error) {
      return handleServiceError(error, response);
    } finally {
      updatingOrderIds.delete(order.id);
    }
  });

  app.use((request, response) => {
    response.status(404).json({
      success: false,
      message: "Route not found",
    });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(port, () => {
    console.log(`Order Service is listening on port ${port}`);
  });
}

module.exports = { createApp };
