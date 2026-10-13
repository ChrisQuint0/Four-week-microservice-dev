const crypto = require("node:crypto");
const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3005;
const requestTimeout = 5000;
const paymentStatuses = new Set(["PENDING", "PAID", "FAILED"]);
const orderStatuses = new Set(["PENDING", "CONFIRMED", "CANCELLED", "FAILED"]);
const samplePayments = [
  ["ord-001", 1198, "PAID"],
  ["ord-002", 850, "PENDING"],
  ["ord-003", 1449, "PAID"],
  ["ord-004", 1797, "PENDING"],
  ["ord-005", 1700, "FAILED"],
  ["ord-006", 2299, "PAID"],
  ["ord-007", 1198, "PENDING"],
  ["ord-008", 850, "FAILED"],
  ["ord-009", 1449, "PAID"],
  ["ord-010", 599, "PENDING"],
].map(([orderId, amount, status], index) => {
  const timestamp = new Date(
    Date.UTC(2026, 9, 13, 8, 15 + index),
  ).toISOString();

  return {
    id: `pay-${String(index + 1).padStart(3, "0")}`,
    orderId,
    amount,
    status,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
});

class OrderServiceError extends Error {
  constructor(upstreamStatus, cause) {
    super("Order service request failed", { cause });
    this.upstreamStatus = upstreamStatus;
  }
}

async function fetchOrder(url) {
  let result;

  try {
    result = await axios.get(url, { timeout: requestTimeout });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new OrderServiceError(error.response?.status, error);
    }

    throw error;
  }

  if (
    result.data?.success !== true ||
    result.data.data === null ||
    typeof result.data.data !== "object"
  ) {
    throw new OrderServiceError(502);
  }

  return result.data.data;
}

async function confirmOrder(url, orderId) {
  let result;

  try {
    result = await axios.put(
      url,
      { status: "CONFIRMED" },
      { timeout: requestTimeout },
    );
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new OrderServiceError(error.response?.status, error);
    }

    throw error;
  }

  if (
    result.data?.success !== true ||
    result.data.data === null ||
    typeof result.data.data !== "object" ||
    result.data.data.id !== orderId ||
    result.data.data.status !== "CONFIRMED"
  ) {
    throw new OrderServiceError(502);
  }
}

function handleOrderServiceError(error, response) {
  if (error instanceof OrderServiceError) {
    if (error.upstreamStatus === 404) {
      return response.status(422).json({
        success: false,
        message: "Order not found",
      });
    }

    if (error.upstreamStatus === undefined) {
      return response.status(503).json({
        success: false,
        message: "Order service is unavailable",
      });
    }

    return response.status(502).json({
      success: false,
      message: "Order service returned an invalid response",
    });
  }

  console.error("Unexpected error in payment service:", error);
  return response.status(500).json({
    success: false,
    message: "Payment request could not be completed",
  });
}

function isValidOrder(order, orderId) {
  return (
    order.id === orderId &&
    Number.isFinite(order.totalAmount) &&
    order.totalAmount >= 0 &&
    orderStatuses.has(order.status)
  );
}

function createApp({
  orderServiceUrl =
    process.env.ORDER_SERVICE_URL || "http://localhost:3004",
} = {}) {
  const app = express();
  const payments = samplePayments.map((payment) => ({ ...payment }));
  const pendingOrderIds = new Set();
  const updatingPaymentIds = new Set();

  app.use(express.json());

  app.get("/health", (request, response) => {
    response.json({ success: true, message: "Payment service is healthy" });
  });

  app.get("/payments", (request, response) => {
    response.json({
      success: true,
      data: payments,
      message: "Payments retrieved successfully",
    });
  });

  app.get("/payments/:id", (request, response) => {
    const payment = payments.find((item) => item.id === request.params.id);
    if (!payment) {
      return response.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    return response.json({
      success: true,
      data: payment,
      message: "Payment retrieved successfully",
    });
  });

  app.post("/payments", async (request, response) => {
    const body = request.body || {};
    if (
      Object.keys(body).length !== 1 ||
      typeof body.orderId !== "string" ||
      body.orderId.trim().length === 0
    ) {
      return response.status(400).json({
        success: false,
        message: "Payment must include only a non-empty orderId",
      });
    }

    const orderId = body.orderId.trim();
    if (
      pendingOrderIds.has(orderId) ||
      payments.some((payment) => payment.orderId === orderId)
    ) {
      return response.status(409).json({
        success: false,
        message: "A payment already exists for this order",
      });
    }

    pendingOrderIds.add(orderId);
    let order;
    try {
      order = await fetchOrder(
        `${orderServiceUrl}/orders/${encodeURIComponent(orderId)}`,
      );
    } catch (error) {
      return handleOrderServiceError(error, response);
    } finally {
      pendingOrderIds.delete(orderId);
    }

    if (!isValidOrder(order, orderId)) {
      return response.status(502).json({
        success: false,
        message: "Order service returned an invalid order",
      });
    }

    if (order.status === "CANCELLED" || order.status === "FAILED") {
      return response.status(409).json({
        success: false,
        message: "Payment cannot be created for an inactive order",
      });
    }

    const timestamp = new Date().toISOString();
    const payment = {
      id: `pay-${crypto.randomUUID()}`,
      orderId,
      amount: order.totalAmount,
      status: "PENDING",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    payments.push(payment);

    return response.status(201).json({
      success: true,
      data: payment,
      message: "Simulated payment created",
    });
  });

  app.patch("/payments/:id/status", async (request, response) => {
    const payment = payments.find((item) => item.id === request.params.id);
    if (!payment) {
      return response.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const body = request.body || {};
    if (
      Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, "status") ||
      typeof body.status !== "string" ||
      !paymentStatuses.has(body.status)
    ) {
      return response.status(400).json({
        success: false,
        message: "Only a valid payment status may be updated",
      });
    }

    if (payment.status === body.status) {
      return response.json({
        success: true,
        data: payment,
        message: "Payment status is unchanged",
      });
    }

    if (payment.status !== "PENDING") {
      return response.status(409).json({
        success: false,
        message: "A completed payment cannot change status",
      });
    }

    if (updatingPaymentIds.has(payment.id)) {
      return response.status(409).json({
        success: false,
        message: "Payment status is already being updated",
      });
    }

    updatingPaymentIds.add(payment.id);
    try {
      if (body.status === "PAID") {
        let order;
        try {
          order = await fetchOrder(
            `${orderServiceUrl}/orders/${encodeURIComponent(payment.orderId)}`,
          );
        } catch (error) {
          return handleOrderServiceError(error, response);
        }

        if (!isValidOrder(order, payment.orderId)) {
          return response.status(502).json({
            success: false,
            message: "Order service returned an invalid order",
          });
        }
        if (order.status === "CANCELLED" || order.status === "FAILED") {
          return response.status(409).json({
            success: false,
            message: "Payment cannot succeed for an inactive order",
          });
        }

        try {
          await confirmOrder(
            `${orderServiceUrl}/orders/${encodeURIComponent(payment.orderId)}`,
            payment.orderId,
          );
        } catch (error) {
          return handleOrderServiceError(error, response);
        }
      }

      payment.status = body.status;
      payment.updatedAt = new Date().toISOString();
      return response.json({
        success: true,
        data: payment,
        message: "Payment status updated successfully",
      });
    } finally {
      updatingPaymentIds.delete(payment.id);
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
    console.log(`Payment Service is listening on port ${port}`);
  });
}

module.exports = { createApp };