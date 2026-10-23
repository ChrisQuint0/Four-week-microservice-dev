const crypto = require("node:crypto");
const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3003;
const requestTimeout = 5000;

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
      throw new ServiceRequestError(serviceName, error.response?.status, error);
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

function validateItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "Cart must include at least one item";
  }

  for (const item of items) {
    if (
      item === null ||
      typeof item !== "object" ||
      typeof item.productId !== "string" ||
      item.productId.trim().length === 0 ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return "Each cart item must include a productId and positive integer quantity";
    }
  }

  return null;
}

function normalizeItems(items) {
  const quantities = new Map();
  for (const item of items) {
    const productId = item.productId.trim();
    const quantity = (quantities.get(productId) || 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) {
      return null;
    }

    quantities.set(productId, quantity);
  }

  return [...quantities].map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

function handleServiceError(error, response) {
  if (error instanceof ServiceRequestError) {
    if (error.upstreamStatus === 404) {
      return response.status(422).json({
        success: false,
        message: `${error.serviceName} not found`,
      });
    }

    if (error.upstreamStatus === undefined) {
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

  console.error("Unexpected error in cart service:", error);
  return response.status(500).json({
    success: false,
    message: "Cart request could not be completed",
  });
}

function createApp({
  customerServiceUrl = process.env.CUSTOMER_SERVICE_URL ||
    "http://localhost:3002",
  productServiceUrl = process.env.PRODUCT_SERVICE_URL ||
    "http://localhost:3001",
} = {}) {
  const app = express();
  const carts = [
    {
      id: "cart-001",
      customerId: "cust-001",
      items: [{ productId: "prod-001", quantity: 2 }],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cart-002",
      customerId: "cust-002",
      items: [{ productId: "prod-002", quantity: 1 }],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cart-003",
      customerId: "cust-003",
      items: [
        { productId: "prod-001", quantity: 1 },
        { productId: "prod-002", quantity: 1 },
      ],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cart-004",
      customerId: "cust-004",
      items: [{ productId: "prod-001", quantity: 3 }],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cart-005",
      customerId: "cust-005",
      items: [{ productId: "prod-002", quantity: 2 }],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cart-006",
      customerId: "cust-006",
      items: [
        { productId: "prod-001", quantity: 1 },
        { productId: "prod-002", quantity: 2 },
      ],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cart-007",
      customerId: "cust-007",
      items: [{ productId: "prod-001", quantity: 2 }],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cart-008",
      customerId: "cust-008",
      items: [{ productId: "prod-002", quantity: 1 }],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cart-009",
      customerId: "cust-009",
      items: [
        { productId: "prod-001", quantity: 1 },
        { productId: "prod-002", quantity: 1 },
      ],
      updatedAt: new Date().toISOString(),
    },
    {
      id: "cart-010",
      customerId: "cust-010",
      items: [{ productId: "prod-001", quantity: 1 }],
      updatedAt: new Date().toISOString(),
    },
  ];

  app.use(express.json());

  async function validateCustomer(customerId) {
    const customer = await fetchServiceResource(
      `${customerServiceUrl}/customers/${encodeURIComponent(customerId)}`,
      "Customer",
    );

    if (
      customer.id !== customerId ||
      typeof customer.name !== "string" ||
      typeof customer.email !== "string"
    ) {
      throw new ServiceRequestError("Customer", 502);
    }
  }

  async function enrichCart(cart) {
    const items = await Promise.all(
      cart.items.map(async ({ productId, quantity }) => {
        const product = await fetchServiceResource(
          `${productServiceUrl}/products/${encodeURIComponent(productId)}`,
          "Product",
        );

        if (
          product.id !== productId ||
          typeof product.name !== "string" ||
          !Number.isFinite(product.price) ||
          product.price < 0 ||
          !Number.isSafeInteger(product.stockQuantity) ||
          product.stockQuantity < 0
        ) {
          throw new ServiceRequestError("Product", 502);
        }

        const subtotal = product.price * quantity;
        if (!Number.isFinite(subtotal)) {
          throw new ServiceRequestError("Product", 502);
        }

        return {
          productId,
          quantity,
          productName: product.name,
          unitPrice: product.price,
          subtotal,
        };
      }),
    );
    const totalAmount = items.reduce((total, item) => total + item.subtotal, 0);

    if (!Number.isFinite(totalAmount)) {
      throw new ServiceRequestError("Product", 502);
    }

    return { ...cart, items, totalAmount };
  }

  app.get("/health", (request, response) => {
    response.json({ success: true, message: "Cart service is healthy" });
  });

  app.get("/cart", async (request, response) => {
    try {
      const data = await Promise.all(carts.map(enrichCart));
      return response.json({
        success: true,
        data,
        message: "Carts retrieved successfully",
      });
    } catch (error) {
      return handleServiceError(error, response);
    }
  });

  app.get("/cart/:id", async (request, response) => {
    const cart = carts.find((item) => item.id === request.params.id);
    if (!cart) {
      return response.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    try {
      return response.json({
        success: true,
        data: await enrichCart(cart),
        message: "Cart retrieved successfully",
      });
    } catch (error) {
      return handleServiceError(error, response);
    }
  });

  app.post("/cart", async (request, response) => {
    const { customerId, items } = request.body || {};
    if (Object.hasOwn(request.body || {}, "id")) {
      return response.status(400).json({
        success: false,
        message: "Cart id is generated by the service and must not be provided",
      });
    }

    if (typeof customerId !== "string" || customerId.trim().length === 0) {
      return response.status(400).json({
        success: false,
        message: "Cart must include a non-empty customerId",
      });
    }

    const validationError = validateItems(items);
    if (validationError) {
      return response.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const normalizedItems = normalizeItems(items);
    if (!normalizedItems) {
      return response.status(400).json({
        success: false,
        message: "Total quantity for each product must be a safe integer",
      });
    }

    const cart = {
      id: `cart-${crypto.randomUUID()}`,
      customerId: customerId.trim(),
      items: normalizedItems,
      updatedAt: new Date().toISOString(),
    };

    try {
      await validateCustomer(cart.customerId);
      const data = await enrichCart(cart);
      carts.push(cart);
      return response.status(201).json({
        success: true,
        data,
        message: "Cart created successfully",
      });
    } catch (error) {
      return handleServiceError(error, response);
    }
  });

  app.put("/cart", async (request, response) => {
    const body = request.body || {};
    if (typeof body.id !== "string" || body.id.trim().length === 0) {
      return response.status(400).json({
        success: false,
        message: "Cart update must include a non-empty id",
      });
    }

    const cartIndex = carts.findIndex((item) => item.id === body.id.trim());
    if (cartIndex === -1) {
      return response.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const existingCart = carts[cartIndex];
    const customerId = Object.hasOwn(body, "customerId")
      ? body.customerId
      : existingCart.customerId;
    const items = Object.hasOwn(body, "items")
      ? body.items
      : existingCart.items;
    if (typeof customerId !== "string" || customerId.trim().length === 0) {
      return response.status(400).json({
        success: false,
        message: "Cart must include a non-empty customerId",
      });
    }

    const validationError = validateItems(items);
    if (validationError) {
      return response.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const normalizedItems = normalizeItems(items);
    if (!normalizedItems) {
      return response.status(400).json({
        success: false,
        message: "Total quantity for each product must be a safe integer",
      });
    }

    const updatedCart = {
      id: existingCart.id,
      customerId: customerId.trim(),
      items: normalizedItems,
      updatedAt: new Date().toISOString(),
    };

    try {
      await validateCustomer(updatedCart.customerId);
      const data = await enrichCart(updatedCart);
      carts[cartIndex] = updatedCart;
      return response.json({
        success: true,
        data,
        message: "Cart updated successfully",
      });
    } catch (error) {
      return handleServiceError(error, response);
    }
  });

  app.delete("/cart", (request, response) => {
    const body = request.body || {};
    if (
      Object.keys(body).length !== 1 ||
      typeof body.id !== "string" ||
      body.id.trim().length === 0
    ) {
      return response.status(400).json({
        success: false,
        message: "Cart deletion must include only a non-empty id",
      });
    }

    const cartIndex = carts.findIndex((item) => item.id === body.id.trim());
    if (cartIndex === -1) {
      return response.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const [cart] = carts.splice(cartIndex, 1);
    return response.json({
      success: true,
      data: cart,
      message: "Cart deleted successfully",
    });
  });

  app.post("/cart/items", async (request, response) => {
    const body = request.body || {};
    if (typeof body.id !== "string" || body.id.trim().length === 0) {
      return response.status(400).json({
        success: false,
        message: "Adding an item must include a non-empty cart id",
      });
    }

    const cartIndex = carts.findIndex((item) => item.id === body.id.trim());
    if (cartIndex === -1) {
      return response.status(404).json({
        success: false,
        message: "Cart not found",
      });
    }

    const { productId, quantity } = body;
    const validationError = validateItems([{ productId, quantity }]);
    if (validationError) {
      return response.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const cart = carts[cartIndex];
    const updatedItems = normalizeItems([
      ...cart.items,
      { productId, quantity },
    ]);
    if (!updatedItems) {
      return response.status(400).json({
        success: false,
        message: "Total quantity for each product must be a safe integer",
      });
    }

    const updatedCart = {
      ...cart,
      items: updatedItems,
      updatedAt: new Date().toISOString(),
    };

    try {
      const data = await enrichCart(updatedCart);
      carts[cartIndex] = updatedCart;
      return response.status(200).json({
        success: true,
        data,
        message: "Item added to cart successfully",
      });
    } catch (error) {
      return handleServiceError(error, response);
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
    console.log(`Cart Service is listening on port ${port}`);
  });
}

module.exports = { createApp };
