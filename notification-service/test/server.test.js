const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const axios = require("axios");
const express = require("express");
const { createApp } = require("../server");

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

describe("Notification Service integration", () => {
  let customerServer;
  let orderServer;
  let notificationServer;
  let notificationUrl;

  before(async () => {
    const customerApp = express();
    customerApp.get("/customers/:id", (request, response) => {
      const customer = request.params.id === "cust-001"
        ? { id: "cust-001", name: "Alex Santos", email: "alex@example.test" }
        : null;
      return response
        .status(customer ? 200 : 404)
        .json({ success: Boolean(customer), data: customer });
    });
    const orderApp = express();
    orderApp.get("/orders/:id", (request, response) => {
      const order = request.params.id === "ord-001"
        ? {
            id: "ord-001",
            customerId: "cust-001",
            status: "CONFIRMED",
          }
        : null;
      return response
        .status(order ? 200 : 404)
        .json({ success: Boolean(order), data: order });
    });

    customerServer = await listen(customerApp);
    orderServer = await listen(orderApp);
    notificationServer = await listen(
      createApp({
        customerServiceUrl: `http://127.0.0.1:${customerServer.address().port}`,
        orderServiceUrl: `http://127.0.0.1:${orderServer.address().port}`,
      }),
    );
    notificationUrl = `http://127.0.0.1:${notificationServer.address().port}`;
  });

  after(async () => {
    await Promise.all([
      close(notificationServer),
      close(orderServer),
      close(customerServer),
    ]);
  });

  it("creates at most one confirmation notification per order", async () => {
    const body = { customerId: "cust-001", orderId: "ord-001" };
    const created = await axios.post(`${notificationUrl}/notifications`, body);
    assert.equal(created.status, 201);

    const repeated = await axios.post(`${notificationUrl}/notifications`, body);
    assert.equal(repeated.status, 200);
    assert.equal(repeated.data.data.id, created.data.data.id);

    const listed = await axios.get(`${notificationUrl}/notifications`);
    assert.equal(listed.data.data.length, 1);
    assert.equal(listed.data.data[0].orderId, "ord-001");
  });
});
