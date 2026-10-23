const crypto = require("node:crypto");
const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3007;

function createApp({
  customerServiceUrl = process.env.CUSTOMER_SERVICE_URL ||
    "http://localhost:3002",
  orderServiceUrl = process.env.ORDER_SERVICE_URL || "http://localhost:3004",
} = {}) {
  const app = express();
  const notifications = [];
  const statuses = new Set(["CREATED", "SENT", "FAILED"]);
  app.use(express.json());

  app.get("/health", (req, res) =>
    res.json({ success: true, service: "notification-service", status: "UP" }),
  );
  app.get("/notifications", (req, res) =>
    res.json({
      success: true,
      data: notifications,
      message: "Notifications retrieved successfully",
    }),
  );
  app.get("/notifications/:id", (req, res) => {
    const item = notifications.find(
      (notification) => notification.id === req.params.id,
    );
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    return res.json({
      success: true,
      data: item,
      message: "Notification retrieved successfully",
    });
  });
  app.post("/notifications", async (req, res) => {
    const { customerId, orderId } = req.body || {};
    if (
      typeof customerId !== "string" ||
      !customerId.trim() ||
      typeof orderId !== "string" ||
      !orderId.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Notification must include a non-empty customerId and orderId",
      });
    }
    const normalizedCustomerId = customerId.trim();
    const normalizedOrderId = orderId.trim();
    try {
      const [customerResult, orderResult] = await Promise.all([
        axios.get(
          `${customerServiceUrl}/customers/${encodeURIComponent(normalizedCustomerId)}`,
          { timeout: 5000 },
        ),
        axios.get(
          `${orderServiceUrl}/orders/${encodeURIComponent(normalizedOrderId)}`,
          { timeout: 5000 },
        ),
      ]);
      if (
        customerResult.data?.success !== true ||
        customerResult.data.data?.id !== normalizedCustomerId
      ) {
        return res.status(502).json({
          success: false,
          message: "Customer service returned an invalid customer",
        });
      }
      const order = orderResult.data?.data;
      if (
        orderResult.data?.success !== true ||
        order?.id !== normalizedOrderId ||
        order.customerId !== normalizedCustomerId
      ) {
        return res.status(422).json({
          success: false,
          message: "Order does not belong to the specified customer",
        });
      }
      if (order.status !== "CONFIRMED") {
        return res.status(409).json({
          success: false,
          message: "Notification requires a confirmed order",
        });
      }
      const existingNotification = notifications.find(
        (item) => item.orderId === normalizedOrderId,
      );
      if (existingNotification) {
        if (existingNotification.customerId !== normalizedCustomerId) {
          return res.status(422).json({
            success: false,
            message: "Order already has a notification for a different customer",
          });
        }
        return res.status(200).json({
          success: true,
          data: existingNotification,
          message: "Notification already exists for this order",
        });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) {
          const failedUrl = error.config?.url || "";
          const resource = failedUrl.includes("/orders/")
            ? "Order"
            : "Customer";
          return res.status(422).json({
            success: false,
            message: `${resource} not found`,
          });
        }
        if (
          error.response?.status === undefined ||
          error.response?.status === 503
        )
          return res.status(503).json({
            success: false,
            message: "Customer service is unavailable",
          });
        return res.status(502).json({
          success: false,
          message: "Customer service returned an invalid response",
        });
      }
      console.error("Unexpected notification service error:", error);
      return res
        .status(500)
        .json({ success: false, message: "Notification could not be created" });
    }
    const notification = {
      id: `notif-${crypto.randomUUID()}`,
      customerId: normalizedCustomerId,
      orderId: normalizedOrderId,
      message: `Your order ${normalizedOrderId} has been confirmed.`,
      type: "ORDER_CONFIRMATION",
      status: "CREATED",
      createdAt: new Date().toISOString(),
    };
    notifications.push(notification);
    return res.status(201).json({
      success: true,
      data: notification,
      message: "Notification created successfully",
    });
  });
  app.patch("/notifications/status", (req, res) => {
    const body = req.body || {};
    if (
      Object.keys(body).length !== 2 ||
      typeof body.id !== "string" ||
      !body.id.trim() ||
      !Object.hasOwn(body, "status") ||
      !statuses.has(body.status)
    ) {
      return res.status(400).json({
        success: false,
        message: "Notification update must include an id and valid status",
      });
    }

    const item = notifications.find(
      (notification) => notification.id === body.id.trim(),
    );
    if (!item)
      return res
        .status(404)
        .json({ success: false, message: "Notification not found" });
    item.status = body.status;
    return res.json({
      success: true,
      data: item,
      message: "Notification status updated successfully",
    });
  });
  app.use((req, res) =>
    res.status(404).json({ success: false, message: "Route not found" }),
  );
  return app;
}

if (require.main === module)
  createApp().listen(port, "0.0.0.0", () =>
    console.log(`Notification Service is listening on port ${port}`),
  );
module.exports = { createApp };
