const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3006;
const requestTimeout = 5000;
const sampleStock = [25, 15, 18, 32, 12, 9, 14, 40, 21, 50];

class ProductServiceError extends Error {
  constructor(upstreamStatus, cause) {
    super("Product service request failed", { cause });
    this.upstreamStatus = upstreamStatus;
  }
}

async function validateProduct(url, productId) {
  let result;
  try {
    result = await axios.get(url, { timeout: requestTimeout });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new ProductServiceError(error.response?.status, error);
    }
    throw error;
  }

  if (result.data?.success !== true || result.data.data?.id !== productId) {
    throw new ProductServiceError(502);
  }
}

function handleProductServiceError(error, response) {
  if (error instanceof ProductServiceError) {
    if (error.upstreamStatus === 404) {
      return response.status(422).json({
        success: false,
        message: "Product not found",
      });
    }
    if (error.upstreamStatus === undefined) {
      return response.status(503).json({
        success: false,
        message: "Product service is unavailable",
      });
    }
    return response.status(502).json({
      success: false,
      message: "Product service returned an invalid response",
    });
  }

  console.error("Unexpected error in inventory service:", error);
  return response.status(500).json({
    success: false,
    message: "Inventory request could not be completed",
  });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const quantities = new Map();
  for (const item of items) {
    if (
      item === null ||
      typeof item !== "object" ||
      !isNonEmptyString(item.productId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      return null;
    }

    const productId = item.productId.trim();
    const quantity = (quantities.get(productId) || 0) + item.quantity;
    if (!Number.isSafeInteger(quantity)) {
      return null;
    }
    quantities.set(productId, quantity);
  }

  return [...quantities]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => ({ productId, quantity }));
}

function createApp({
  productServiceUrl =
    process.env.PRODUCT_SERVICE_URL || "http://localhost:3001",
} = {}) {
  const app = express();
  const inventory = sampleStock.map((stockQuantity, index) => {
    const suffix = String(index + 1).padStart(3, "0");
    return {
      id: `inv-${suffix}`,
      productId: `prod-${suffix}`,
      stockQuantity,
      reservedQuantity: 0,
      updatedAt: new Date().toISOString(),
    };
  });
  const reservations = new Map();
  // Match the pending sample orders. Historical completed orders are already
  // reflected in sample stock on hand and must not deduct it again.
  for (const [orderId, productId, quantity] of [
    ["ord-002", "prod-002", 1],
    ["ord-004", "prod-001", 3],
    ["ord-007", "prod-001", 2],
    ["ord-010", "prod-001", 1],
  ]) {
    const timestamp = new Date().toISOString();
    const record = inventory.find((stock) => stock.productId === productId);
    record.reservedQuantity += quantity;
    reservations.set(orderId, {
      orderId,
      items: [{ productId, quantity }],
      status: "RESERVED",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }

  app.use(express.json());

  function stockResponse(record) {
    return {
      ...record,
      availableQuantity: record.stockQuantity - record.reservedQuantity,
    };
  }

  app.get("/health", (request, response) => {
    response.json({ success: true, message: "Inventory service is healthy" });
  });

  app.get("/inventory", (request, response) => {
    response.json({
      success: true,
      data: inventory.map(stockResponse),
      message: "Inventory retrieved successfully",
    });
  });

  // Register reservation routes before the productId lookup route.
  app.get("/inventory/reservations/:orderId", (request, response) => {
    const reservation = reservations.get(request.params.orderId);
    if (!reservation) {
      return response.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }
    return response.json({
      success: true,
      data: reservation,
      message: "Reservation retrieved successfully",
    });
  });

  app.post("/inventory/reservations", (request, response) => {
    const { orderId, items } = request.body || {};
    const normalizedItems = normalizeItems(items);
    if (!isNonEmptyString(orderId) || !normalizedItems) {
      return response.status(400).json({
        success: false,
        message:
          "Reservation must include an orderId and items with productId and positive integer quantity",
      });
    }

    const normalizedOrderId = orderId.trim();
    const existing = reservations.get(normalizedOrderId);
    if (existing) {
      if (
        existing.status === "RELEASED" ||
        JSON.stringify(existing.items) !== JSON.stringify(normalizedItems)
      ) {
        return response.status(409).json({
          success: false,
          message:
            "A different or released reservation already exists for this order",
        });
      }
      return response.json({
        success: true,
        data: existing,
        message: "Reservation already exists",
      });
    }

    // Check every item before modifying any stock. No asynchronous work occurs
    // between checking availability and reserving it in this process.
    const records = [];
    for (const item of normalizedItems) {
      const record = inventory.find(
        (stock) => stock.productId === item.productId,
      );
      if (!record) {
        return response.status(422).json({
          success: false,
          message: `Inventory not found for product ${item.productId}`,
        });
      }
      if (item.quantity > record.stockQuantity - record.reservedQuantity) {
        return response.status(409).json({
          success: false,
          message: `Insufficient stock for product ${item.productId}`,
        });
      }
      records.push(record);
    }

    const timestamp = new Date().toISOString();
    normalizedItems.forEach((item, index) => {
      records[index].reservedQuantity += item.quantity;
      records[index].updatedAt = timestamp;
    });
    const reservation = {
      orderId: normalizedOrderId,
      items: normalizedItems,
      status: "RESERVED",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    reservations.set(normalizedOrderId, reservation);
    return response.status(201).json({
      success: true,
      data: reservation,
      message: "Stock reserved successfully",
    });
  });

  function completeReservation(request, response, status) {
    const reservation = reservations.get(request.params.orderId);
    if (!reservation) {
      return response.status(404).json({
        success: false,
        message: "Reservation not found",
      });
    }
    if (reservation.status === status) {
      return response.json({
        success: true,
        data: reservation,
        message: "Reservation status is unchanged",
      });
    }
    if (reservation.status !== "RESERVED") {
      return response.status(409).json({
        success: false,
        message: "A completed reservation cannot change status",
      });
    }

    const timestamp = new Date().toISOString();
    for (const item of reservation.items) {
      const record = inventory.find(
        (stock) => stock.productId === item.productId,
      );
      record.reservedQuantity -= item.quantity;
      if (status === "COMMITTED") {
        record.stockQuantity -= item.quantity;
      }
      record.updatedAt = timestamp;
    }
    reservation.status = status;
    reservation.updatedAt = timestamp;
    return response.json({
      success: true,
      data: reservation,
      message:
        status === "COMMITTED"
          ? "Reserved stock deducted successfully"
          : "Reserved stock released successfully",
    });
  }

  app.post("/inventory/reservations/:orderId/commit", (request, response) => {
    return completeReservation(request, response, "COMMITTED");
  });

  app.post("/inventory/reservations/:orderId/release", (request, response) => {
    return completeReservation(request, response, "RELEASED");
  });

  app.get("/inventory/:productId", (request, response) => {
    const record = inventory.find(
      (item) => item.productId === request.params.productId,
    );
    if (!record) {
      return response.status(404).json({
        success: false,
        message: "Inventory not found",
      });
    }
    return response.json({
      success: true,
      data: stockResponse(record),
      message: "Inventory retrieved successfully",
    });
  });

  app.post("/inventory", async (request, response) => {
    const { id, productId, stockQuantity } = request.body || {};
    if (
      !isNonEmptyString(id) ||
      !isNonEmptyString(productId) ||
      !Number.isSafeInteger(stockQuantity) ||
      stockQuantity < 0
    ) {
      return response.status(400).json({
        success: false,
        message:
          "Inventory must include an id, productId, and non-negative integer stockQuantity",
      });
    }

    const record = {
      id: id.trim(),
      productId: productId.trim(),
      stockQuantity,
      reservedQuantity: 0,
      updatedAt: new Date().toISOString(),
    };
    function isDuplicate() {
      return inventory.some(
        (item) => item.id === record.id || item.productId === record.productId,
      );
    }
    if (isDuplicate()) {
      return response.status(409).json({
        success: false,
        message: "Inventory with this id or productId already exists",
      });
    }
    try {
      await validateProduct(
        `${productServiceUrl}/products/${encodeURIComponent(record.productId)}`,
        record.productId,
      );
    } catch (error) {
      return handleProductServiceError(error, response);
    }
    if (isDuplicate()) {
      return response.status(409).json({
        success: false,
        message: "Inventory with this id or productId already exists",
      });
    }
    inventory.push(record);
    return response.status(201).json({
      success: true,
      data: stockResponse(record),
      message: "Inventory created successfully",
    });
  });

  app.patch("/inventory/:productId", (request, response) => {
    const record = inventory.find(
      (item) => item.productId === request.params.productId,
    );
    if (!record) {
      return response.status(404).json({
        success: false,
        message: "Inventory not found",
      });
    }
    const body = request.body || {};
    if (
      Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, "stockQuantity") ||
      !Number.isSafeInteger(body.stockQuantity) ||
      body.stockQuantity < 0
    ) {
      return response.status(400).json({
        success: false,
        message: "Only a non-negative integer stockQuantity may be updated",
      });
    }
    if (body.stockQuantity < record.reservedQuantity) {
      return response.status(409).json({
        success: false,
        message: "Stock quantity cannot be less than reserved quantity",
      });
    }
    record.stockQuantity = body.stockQuantity;
    record.updatedAt = new Date().toISOString();
    return response.json({
      success: true,
      data: stockResponse(record),
      message: "Inventory updated successfully",
    });
  });

  app.use((request, response) => {
    response.status(404).json({ success: false, message: "Route not found" });
  });

  return app;
}

if (require.main === module) {
  createApp().listen(port, () => {
    console.log(`Inventory Service is listening on port ${port}`);
  });
}

module.exports = { createApp };
