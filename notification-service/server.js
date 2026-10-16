const crypto = require("node:crypto");
const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3007;
const requestTimeout = 5000;

class ServiceRequestError extends Error {
  constructor(upstreamStatus) {
    super("Customer service request failed");
    this.upstreamStatus = upstreamStatus;
  }
}

function createApp({
  customerServiceUrl =
    process.env.CUSTOMER_SERVICE_URL || "http://localhost:3002",
} = {}) {
  const app = express();
  const notifications = [];
  const statuses = new Set(["CREATED", "SENT", "FAILED"]);

  app.use(express.json());

  app.get("/health", (request, response) => {
    response.json({
      success: true,
      service: "notification-service",
      status: "UP",
    });
  });

  app.get("/notifications", (request, response) => {
    response.json({
      success: true,
      data: notifications,
      message: "Notifications retrieved successfully",
    });
  });

  app.get("/notifications/:id", (request, response) => {
    const notification = notifications.find(
      (item) => item.id === request.params.id,
    );
    if (!notification) {
      return response.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    return response.json({
      success: true,
      data: notification,
      message: "Notification retrieved successfully",
    });
  });

  app.post("/notifications", async (request, response) => {
    const { customerId, orderId } = request.body || {};
    if (
      typeof customerId !== "string" || !customerId.trim() ||
      typeof orderId !== "string" || !orderId.trim()
    ) {
      return response.status(400).json({
        success: false,
        message: "Notification must include a non-empty customerId and orderId",
      });
    }

    const normalizedCustomerId = customerId.trim();
    try {
      const result = await axios.get(
        `${customerServiceUrl}/customers/${encodeURIComponent(normalizedCustomerId)}`,
        { timeout: requestTimeout },
      );
      if (
        result.data?.success !== true ||
        result.data.data?.id !== normalizedCustomerId
      ) {
        throw new ServiceRequestError(502);
      }
    } catch (error) {
      if (error instanceof ServiceRequestError) {
        return response.status(error.upstreamStatus).json({
          success: false,
          message: "Customer service returned an invalid customer",
        });
      }
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404) {
          return response.status(422).json({
            success: false,
            message: "Customer not found",
          });
        }
        if (status === undefined || status === 503) {
          return response.status(503).json({
            success: false,
            message: "Customer service is unavailable",
          });
        }
        return response.status(502).json({
          success: false,
          message: "Customer service returned an invalid response",
        });
      }
      console.error("Unexpected error in notification service:", error);
      return response.status(500).json({
        success: false,
        message: "Notification could not be created",
      });
    }

    const notification = {
      id: `notif-${crypto.randomUUID()}`,
      customerId: normalizedCustomerId,
      orderId: orderId.trim(),
      message: `Your order ${orderId.trim()} has been confirmed.`,
      type: "ORDER_CONFIRMATION",
      status: "CREATED",
      createdAt: new Date().toISOString(),
    };
    notifications.push(notification);
    return response.status(201).json({
      success: true,
      data: notification,
      message: "Notification created successfully",
    });
  });

  app.patch("/notifications/:id/status", (request, response) => {
    const notification = notifications.find(
      (item) => item.id === request.params.id,
    );
    if (!notification) {
      return response.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }
    const body = request.body || {};
    if (
      Object.keys(body).length !== 1 || !Object.hasOwn(body, "status") ||
      !statuses.has(body.status)
    ) {
      return response.status(400).json({
        success: false,
        message: "A valid notification status is required",
      });
    }
    notification.status = body.status;
    return response.json({
      success: true,
      data: notification,
      message: "Notification status updated successfully",
    });
  });

  app.use((request, response) => {
    response.status(404).json({ success: false, message: "Route not found" });
  });
  return app;
}

if (require.main === module) {
  createApp().listen(port, "0.0.0.0", () => {
    console.log(`Notification Service is listening on port ${port}`);
  });
}

module.exports = { createApp };
