const crypto = require("node:crypto");
const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3007;

function createApp({
  customerServiceUrl = process.env.CUSTOMER_SERVICE_URL ||
    "http://localhost:3002",
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
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Notification must include a non-empty customerId and orderId",
        });
    }
    try {
      const result = await axios.get(
        `${customerServiceUrl}/customers/${encodeURIComponent(customerId.trim())}`,
        { timeout: 5000 },
      );
      if (
        result.data?.success !== true ||
        result.data.data?.id !== customerId.trim()
      ) {
        return res
          .status(502)
          .json({
            success: false,
            message: "Customer service returned an invalid customer",
          });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404)
          return res
            .status(422)
            .json({ success: false, message: "Customer not found" });
        if (
          error.response?.status === undefined ||
          error.response?.status === 503
        )
          return res
            .status(503)
            .json({
              success: false,
              message: "Customer service is unavailable",
            });
        return res
          .status(502)
          .json({
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
      customerId: customerId.trim(),
      orderId: orderId.trim(),
      message: `Your order ${orderId.trim()} has been confirmed.`,
      type: "ORDER_CONFIRMATION",
      status: "CREATED",
      createdAt: new Date().toISOString(),
    };
    notifications.push(notification);
    return res
      .status(201)
      .json({
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
