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

describe("Inventory Service integration", () => {
  let productServer;
  let inventoryServer;
  let inventoryUrl;

  before(async () => {
    const productApp = express();
    productApp.get("/products/:id", (request, response) => {
      if (request.params.id === "prod-invalid") {
        return response.json({ success: true, data: { id: "wrong-product" } });
      }
      if (request.params.id === "prod-error") {
        return response.status(500).json({ success: false });
      }
      if (request.params.id === "prod-missing") {
        return response.status(404).json({ success: false });
      }
      setTimeout(() => response.json({
        success: true,
        data: { id: request.params.id, name: "Test product" },
      }), 15);
    });
    productServer = await listen(productApp);
    inventoryServer = await listen(createApp({
      productServiceUrl: `http://127.0.0.1:${productServer.address().port}`,
    }));
    inventoryUrl = `http://127.0.0.1:${inventoryServer.address().port}`;
  });

  after(async () => {
    await Promise.all([close(inventoryServer), close(productServer)]);
  });

  async function stock(productId) {
    return (await axios.get(`${inventoryUrl}/inventory/${productId}`)).data.data;
  }

  async function expectStatus(promise, status) {
    await assert.rejects(promise, (error) =>
      error.response?.status === status && error.response.data.success === false,
    );
  }

  it("starts with 10 stock records matching Product Catalog and a health check", async () => {
    assert.equal((await axios.get(`${inventoryUrl}/health`)).data.success, true);
    const listed = (await axios.get(`${inventoryUrl}/inventory`)).data.data;
    assert.equal(listed.length, 10);
    assert.equal(listed[0].id, "inv-001");
    assert.equal(listed[0].productId, "prod-001");
    assert.equal(listed[0].stockQuantity, 25);
    assert.equal(listed[0].reservedQuantity, 6);
    assert.equal(listed[0].availableQuantity, 19);
    assert.ok(Number.isFinite(Date.parse(listed[0].updatedAt)));
    await expectStatus(axios.get(`${inventoryUrl}/inventory/prod-missing`), 404);
    await expectStatus(axios.get(`${inventoryUrl}/missing`), 404);
  });

  it("validates new stock records and upstream product responses", async () => {
    for (const stockQuantity of [-1, 1.5, "2", Number.MAX_SAFE_INTEGER + 1]) {
      await expectStatus(axios.post(`${inventoryUrl}/inventory`, {
        id: "inv-new", productId: "prod-new", stockQuantity,
      }), 400);
    }
    await expectStatus(axios.post(`${inventoryUrl}/inventory`, {}), 400);
    for (const [productId, status] of [
      ["prod-missing", 422], ["prod-invalid", 502], ["prod-error", 502],
    ]) {
      await expectStatus(axios.post(`${inventoryUrl}/inventory`, {
        id: "inv-new", productId, stockQuantity: 5,
      }), status);
    }
    const created = await axios.post(`${inventoryUrl}/inventory`, {
      id: " inv-new ", productId: " prod-new ", stockQuantity: 5,
      reservedQuantity: 100, availableQuantity: 100,
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.data.id, "inv-new");
    assert.equal(created.data.data.reservedQuantity, 0);
    assert.equal(created.data.data.availableQuantity, 5);
    await expectStatus(axios.post(`${inventoryUrl}/inventory`, {
      id: "inv-new", productId: "prod-other", stockQuantity: 5,
    }), 409);
    await expectStatus(axios.post(`${inventoryUrl}/inventory`, {
      id: "inv-other", productId: "prod-new", stockQuantity: 5,
    }), 409);
  });

  it("rejects concurrent duplicate creation after product validation", async () => {
    const attempts = await Promise.allSettled([1, 2].map(() =>
      axios.post(`${inventoryUrl}/inventory`, {
        id: "inv-race", productId: "prod-race", stockQuantity: 5,
      }),
    ));
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    const rejected = attempts.find((item) => item.status === "rejected");
    assert.equal(rejected.reason.response.status, 409);
  });

  it("reserves merged quantities and safely retries requests", async () => {
    const created = await axios.post(`${inventoryUrl}/inventory/reservations`, {
      orderId: " ord-reserve ",
      items: [
        { productId: " prod-001 ", quantity: 1 },
        { productId: "prod-001", quantity: 2 },
        { productId: "prod-002", quantity: 2 },
      ],
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.data.orderId, "ord-reserve");
    assert.equal(created.data.data.status, "RESERVED");
    assert.equal((await stock("prod-001")).stockQuantity, 25);
    assert.equal((await stock("prod-001")).reservedQuantity, 9);
    assert.equal((await stock("prod-001")).availableQuantity, 16);
    const retried = await axios.post(`${inventoryUrl}/inventory/reservations`, {
      orderId: "ord-reserve",
      items: [
        { productId: "prod-002", quantity: 2 },
        { productId: "prod-001", quantity: 3 },
      ],
    });
    assert.equal(retried.status, 200);
    assert.equal((await stock("prod-001")).reservedQuantity, 9);
    await expectStatus(axios.post(`${inventoryUrl}/inventory/reservations`, {
      orderId: "ord-reserve", items: [{ productId: "prod-001", quantity: 4 }],
    }), 409);
    assert.equal((await axios.get(
      `${inventoryUrl}/inventory/reservations/ord-reserve`,
    )).data.data.status, "RESERVED");
  });

  it("rejects invalid or unavailable items without partially reserving stock", async () => {
    for (const items of [[], [null], [{ productId: "prod-001", quantity: 0 }],
      [{ productId: "prod-001", quantity: -1 }],
      [{ productId: "prod-001", quantity: 1.5 }],
      [{ productId: "prod-001", quantity: Number.MAX_SAFE_INTEGER },
        { productId: "prod-001", quantity: 1 }]]) {
      await expectStatus(axios.post(`${inventoryUrl}/inventory/reservations`, {
        orderId: "ord-invalid", items,
      }), 400);
    }
    await expectStatus(axios.post(`${inventoryUrl}/inventory/reservations`, {
      items: [{ productId: "prod-003", quantity: 1 }],
    }), 400);
    for (const [productId, quantity, status] of [
      ["prod-004", 33, 409], ["prod-missing", 1, 422],
    ]) {
      await expectStatus(axios.post(`${inventoryUrl}/inventory/reservations`, {
        orderId: "ord-unavailable",
        items: [{ productId: "prod-003", quantity: 1 }, { productId, quantity }],
      }), status);
      assert.equal((await stock("prod-003")).reservedQuantity, 0);
    }
    await expectStatus(axios.get(`${inventoryUrl}/inventory/reservations/ord-unavailable`), 404);
  });

  it("prevents concurrent reservations from overselling", async () => {
    const attempts = await Promise.allSettled(["ord-race-a", "ord-race-b"].map((orderId) =>
      axios.post(`${inventoryUrl}/inventory/reservations`, {
        orderId, items: [{ productId: "prod-006", quantity: 6 }],
      }),
    ));
    assert.equal(attempts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(attempts.find((item) => item.status === "rejected").reason.response.status, 409);
    assert.equal((await stock("prod-006")).reservedQuantity, 6);
    assert.equal((await stock("prod-006")).availableQuantity, 3);
  });

  it("permits only valid stock updates that preserve reservations", async () => {
    for (const body of [{ stockQuantity: -1 }, { stockQuantity: 1.5 },
      { reservedQuantity: 0 }, { stockQuantity: 30, productId: "prod-other" }, {}]) {
      await expectStatus(axios.patch(`${inventoryUrl}/inventory/prod-001`, body), 400);
    }
    await expectStatus(axios.patch(`${inventoryUrl}/inventory/prod-001`, {
      stockQuantity: 2,
    }), 409);
    const updated = await axios.patch(`${inventoryUrl}/inventory/prod-001`, {
      stockQuantity: 30,
    });
    assert.equal(updated.data.data.availableQuantity, 21);
    assert.equal(updated.data.data.reservedQuantity, 9);
    await expectStatus(axios.patch(`${inventoryUrl}/inventory/prod-missing`, {
      stockQuantity: 2,
    }), 404);
  });

  it("commits stock exactly once and rejects release after commit", async () => {
    const url = `${inventoryUrl}/inventory/reservations/ord-reserve`;
    const completed = await axios.post(`${url}/commit`);
    assert.equal(completed.data.data.status, "COMMITTED");
    assert.equal((await stock("prod-001")).stockQuantity, 27);
    assert.equal((await stock("prod-001")).reservedQuantity, 6);
    assert.equal((await stock("prod-002")).stockQuantity, 13);
    await axios.post(`${url}/commit`);
    assert.equal((await stock("prod-001")).stockQuantity, 27);
    await expectStatus(axios.post(`${url}/release`), 409);
  });

  it("releases stock exactly once and rejects reuse of a released reservation", async () => {
    await axios.post(`${inventoryUrl}/inventory/reservations`, {
      orderId: "ord-release", items: [{ productId: "prod-007", quantity: 4 }],
    });
    const url = `${inventoryUrl}/inventory/reservations/ord-release`;
    assert.equal((await axios.post(`${url}/release`)).data.data.status, "RELEASED");
    await axios.post(`${url}/release`);
    assert.equal((await stock("prod-007")).stockQuantity, 14);
    assert.equal((await stock("prod-007")).reservedQuantity, 0);
    await expectStatus(axios.post(`${url}/commit`), 409);
    await expectStatus(axios.post(`${inventoryUrl}/inventory/reservations`, {
      orderId: "ord-release", items: [{ productId: "prod-007", quantity: 4 }],
    }), 409);
    await expectStatus(axios.post(`${inventoryUrl}/inventory/reservations/missing/commit`), 404);
    await expectStatus(axios.post(`${inventoryUrl}/inventory/reservations/missing/release`), 404);
  });

  it("returns an unavailable-service error without creating stock", async () => {
    const unavailable = await listen(createApp({ productServiceUrl: "http://127.0.0.1:0" }));
    try {
      await expectStatus(axios.post(
        `http://127.0.0.1:${unavailable.address().port}/inventory`,
        { id: "inv-unavailable", productId: "prod-unavailable", stockQuantity: 1 },
      ), 503);
      assert.equal((await axios.get(
        `http://127.0.0.1:${unavailable.address().port}/inventory`,
      )).data.data.length, 10);
    } finally {
      await close(unavailable);
    }
  });
});
