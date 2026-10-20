const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const axios = require("axios");
const express = require("express");
const { createApp } = require("../server");

const orders = {
  "ord-001": {
    id: "ord-001",
    totalAmount: 1198,
    status: "PENDING",
  },
  "ord-test-001": {
    id: "ord-test-001",
    totalAmount: 1198,
    status: "PENDING",
  },
  "ord-test-002": {
    id: "ord-test-002",
    totalAmount: 850,
    status: "PENDING",
  },
  "ord-test-paid": {
    id: "ord-test-paid",
    totalAmount: 1198,
    status: "PENDING",
  },
  "ord-002": {
    id: "ord-002",
    totalAmount: 850,
    status: "PENDING",
  },
  "ord-race": {
    id: "ord-race",
    totalAmount: 50,
    status: "PENDING",
  },
  "ord-test-race": {
    id: "ord-test-race",
    totalAmount: 50,
    status: "PENDING",
  },
  "ord-cancelled": {
    id: "ord-cancelled",
    totalAmount: 100,
    status: "CANCELLED",
  },
};

function listen(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

describe("Payment Service integration", () => {
  let orderServer;
  let paymentServer;
  let paymentUrl;
  let failOrderUpdates = false;

  before(async () => {
    const orderApp = express();
    orderApp.use(express.json());
    orderApp.get("/orders/:id", (request, response) => {
      const order = orders[request.params.id];
      if (!order) {
        return response.status(404).json({ success: false });
      }

      if (
        request.params.id === "ord-race" ||
        request.params.id === "ord-test-race"
      ) {
        return setTimeout(
          () => response.json({ success: true, data: order }),
          30,
        );
      }

      return response.json({ success: true, data: order });
    });
    orderApp.put("/orders", (request, response) => {
      if (failOrderUpdates) {
        return response.status(503).json({ success: false });
      }

      const order = orders[request.body.id];
      if (!order) {
        return response.status(404).json({ success: false });
      }

      order.status = request.body.status;
      return response.json({ success: true, data: order });
    });

    orderServer = await listen(orderApp);
    paymentServer = await listen(
      createApp({
        orderServiceUrl: `http://127.0.0.1:${orderServer.address().port}`,
      }),
    );
    paymentUrl = `http://127.0.0.1:${paymentServer.address().port}`;
  });

  after(async () => {
    await Promise.all([close(paymentServer), close(orderServer)]);
  });

  it("serves a health check and starts with 10 sample payments", async () => {
    const health = await axios.get(`${paymentUrl}/health`);
    assert.equal(health.data.success, true);

    const listed = await axios.get(`${paymentUrl}/payments`);
    assert.equal(listed.data.data.length, 10);
    assert.equal(listed.data.data[0].id, "pay-001");
    assert.equal(listed.data.data[0].orderId, "ord-001");
    assert.equal(listed.data.data[0].amount, 1198);
    assert.equal(listed.data.data[0].status, "PAID");
  });

  it("requires an order ID and rejects client-selected amounts", async () => {
    await assert.rejects(
      axios.post(`${paymentUrl}/payments`, { amount: 1 }),
      (error) => error.response.status === 400,
    );
    await assert.rejects(
      axios.post(`${paymentUrl}/payments`, {
        orderId: "ord-test-001",
        amount: 1,
      }),
      (error) => error.response.status === 400,
    );
  });

  it("verifies orders and rejects missing, inactive, and duplicate payments", async () => {
    await assert.rejects(
      axios.post(`${paymentUrl}/payments`, { orderId: "ord-missing" }),
      (error) => error.response.status === 422,
    );
    await assert.rejects(
      axios.post(`${paymentUrl}/payments`, { orderId: "ord-cancelled" }),
      (error) => error.response.status === 409,
    );

    const created = await axios.post(`${paymentUrl}/payments`, {
      orderId: "ord-test-001",
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.data.orderId, "ord-test-001");
    assert.equal(created.data.data.amount, 1198);
    assert.equal(created.data.data.status, "PENDING");
    assert.ok(Number.isFinite(Date.parse(created.data.data.createdAt)));
    assert.equal(created.data.data.updatedAt, created.data.data.createdAt);

    await assert.rejects(
      axios.post(`${paymentUrl}/payments`, { orderId: "ord-test-001" }),
      (error) => error.response.status === 409,
    );

    const retrieved = await axios.get(
      `${paymentUrl}/payments/${created.data.data.id}`,
    );
    assert.equal(retrieved.data.data.id, created.data.data.id);
  });

  it("prevents concurrent duplicate payment creation", async () => {
    const attempts = await Promise.allSettled([
      axios.post(`${paymentUrl}/payments`, { orderId: "ord-test-race" }),
      axios.post(`${paymentUrl}/payments`, { orderId: "ord-test-race" }),
    ]);

    assert.equal(
      attempts.filter((attempt) => attempt.status === "fulfilled").length,
      1,
    );
    assert.equal(
      attempts.filter(
        (attempt) =>
          attempt.status === "rejected" && attempt.reason.response.status === 409,
      ).length,
      1,
    );
  });

  it("only marks a payment paid after Order Service confirms the order", async () => {
    const paymentId = (
      await axios.post(`${paymentUrl}/payments`, {
        orderId: "ord-test-paid",
      })
    ).data.data.id;

    await assert.rejects(
      axios.patch(`${paymentUrl}/payments/status`, {
        id: paymentId,
        status: "APPROVED",
      }),
      (error) => error.response.status === 400,
    );

    failOrderUpdates = true;
    await assert.rejects(
      axios.patch(`${paymentUrl}/payments/status`, {
        id: paymentId,
        status: "PAID",
      }),
      (error) => error.response.status === 503,
    );
    failOrderUpdates = false;

    const stillPending = await axios.get(
      `${paymentUrl}/payments/${paymentId}`,
    );
    assert.equal(stillPending.data.data.status, "PENDING");
    assert.equal(orders["ord-test-paid"].status, "PENDING");

    const updated = await axios.patch(
      `${paymentUrl}/payments/status`,
      { id: paymentId, status: "PAID" },
    );
    assert.equal(updated.data.data.status, "PAID");
    assert.equal(orders["ord-test-paid"].status, "CONFIRMED");

    const unchanged = await axios.patch(
      `${paymentUrl}/payments/status`,
      { id: paymentId, status: "PAID" },
    );
    assert.equal(unchanged.data.data.status, "PAID");

    await assert.rejects(
      axios.patch(`${paymentUrl}/payments/status`, {
        id: paymentId,
        status: "FAILED",
      }),
      (error) => error.response.status === 409,
    );
  });

  it("fails the order before recording a failed payment", async () => {
    const created = await axios.post(`${paymentUrl}/payments`, {
      orderId: "ord-test-002",
    });
    const updated = await axios.patch(
      `${paymentUrl}/payments/status`,
      { id: created.data.data.id, status: "FAILED" },
    );

    assert.equal(updated.data.data.status, "FAILED");
    assert.equal(orders["ord-test-002"].status, "FAILED");
  });
});
