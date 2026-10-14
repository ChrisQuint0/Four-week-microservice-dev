const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const axios = require("axios");
const express = require("express");
const { createApp: createOrderApp } = require("../server");
const { createApp: createInventoryApp } = require("../../inventory-service/server");
const { createApp: createCartApp } = require("../../cart-service/server");
const { createApp: createPaymentApp } = require("../../payment-service/server");

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

async function withPlatform(run) {
  const servers = [];
  async function start(app) {
    const server = await listen(app);
    servers.push(server);
    return `http://127.0.0.1:${server.address().port}`;
  }
  try {
    const productApp = express();
    const products = {
      // Deliberately disagree with Inventory to prove stock authority moved.
      "prod-001": { id: "prod-001", name: "Mouse", price: 599, stockQuantity: 0 },
      "prod-002": { id: "prod-002", name: "Keyboard", price: 850, stockQuantity: 999 },
      "prod-011": { id: "prod-011", name: "New product", price: 25, stockQuantity: 999 },
    };
    productApp.get("/products/:id", (request, response) => {
      const product = products[request.params.id];
      return response.status(product ? 200 : 404).json({ success: !!product, data: product });
    });
    const productServiceUrl = await start(productApp);
    const customerApp = express();
    customerApp.get("/customers/:id", (request, response) => {
      const valid = request.params.id === "cust-001";
      return response.status(valid ? 200 : 404).json({
        success: valid,
        data: { id: "cust-001", name: "Demo", email: "demo@example.test" },
      });
    });
    const customerServiceUrl = await start(customerApp);
    const cartServiceUrl = await start(createCartApp({ productServiceUrl, customerServiceUrl }));
    const control = { fail: null, malformed: null, drop: null, delay: null };
    const inventoryApp = createInventoryApp({ productServiceUrl });
    const inventoryProxy = express();
    inventoryProxy.use((request, response) => {
      const action = request.method === "POST"
        ? request.path === "/inventory/reservations" ? "reserve" : request.path.split("/").pop()
        : null;
      if (action && control.fail === action) {
        return response.status(503).json({ success: false, message: "Inventory unavailable" });
      }
      const originalJson = response.json.bind(response);
      response.json = (body) => {
        if (action && control.drop === action) {
          control.drop = null;
          response.socket.destroy();
          return response;
        }
        if (action && control.malformed === action && body.success) {
          return originalJson({ success: true, data: { ...body.data, items: [] } });
        }
        return originalJson(body);
      };
      if (action && control.delay === action) {
        return setTimeout(() => inventoryApp(request, response), 40);
      }
      return inventoryApp(request, response);
    });
    const inventoryServiceUrl = await start(inventoryProxy);
    const orderServiceUrl = await start(createOrderApp({
      productServiceUrl, customerServiceUrl, cartServiceUrl, inventoryServiceUrl,
    }));
    const paymentServiceUrl = await start(createPaymentApp({ orderServiceUrl }));
    const requestOptions = { validateStatus: () => true };
    const post = (url, body = {}) => axios.post(url, body, requestOptions);
    const put = (orderId, status) => axios.put(
      `${orderServiceUrl}/orders/${orderId}`, { status }, requestOptions,
    );
    const stock = async (productId = "prod-001") =>
      (await axios.get(`${inventoryServiceUrl}/inventory/${productId}`)).data.data;
    const order = async (orderId) =>
      (await axios.get(`${orderServiceUrl}/orders/${orderId}`)).data.data;
    const checkout = async (cartId = "cart-001") => post(`${orderServiceUrl}/orders`, {
      customerId: "cust-001", cartId,
    });
    const payment = async (orderId) =>
      (await post(`${paymentServiceUrl}/payments`, { orderId })).data.data;
    const paymentStatus = (paymentId, status) => axios.patch(
      `${paymentServiceUrl}/payments/${paymentId}/status`, { status }, requestOptions,
    );
    const cart = async (id, items) => {
      assert.equal((await post(`${cartServiceUrl}/cart`, {
        id, customerId: "cust-001", items,
      })).status, 201);
    };
    await run({
      control, stock, order, checkout, payment, paymentStatus, cart, put, post,
      inventoryServiceUrl, orderServiceUrl, paymentServiceUrl, requestOptions,
    });
  } finally {
    await Promise.all(servers.map(close));
  }
}

describe("Order, Inventory, Cart, and Payment workflow", () => {
  it("reserves at checkout and commits once after successful payment", async () => {
    await withPlatform(async ({ stock, checkout, payment, paymentStatus, order, put }) => {
      const baseline = await stock();
      const created = await checkout();
      assert.equal(created.status, 201);
      assert.equal(created.data.data.totalAmount, 1198);
      const orderId = created.data.data.id;
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity + 2);
      const pay = await payment(orderId);
      assert.equal((await paymentStatus(pay.id, "PAID")).status, 200);
      assert.equal((await order(orderId)).status, "CONFIRMED");
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity - 2);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
      await paymentStatus(pay.id, "PAID");
      await put(orderId, "CONFIRMED");
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity - 2);
      assert.equal((await put(orderId, "CANCELLED")).status, 409);
      assert.equal((await put(orderId, "PENDING")).status, 409);
    });
  });

  it("releases stock on cancellation, failure, and deletion of pending orders", async () => {
    await withPlatform(async ({ stock, checkout, put, orderServiceUrl, requestOptions }) => {
      const baseline = await stock();
      for (const status of ["CANCELLED", "FAILED"]) {
        const orderId = (await checkout()).data.data.id;
        assert.equal((await put(orderId, status)).status, 200);
        assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
        assert.equal((await stock()).stockQuantity, baseline.stockQuantity);
        assert.equal((await put(orderId, status)).status, 200);
        assert.equal((await put(orderId, "CONFIRMED")).status, 409);
      }
      const orderId = (await checkout()).data.data.id;
      const deleted = await axios.delete(`${orderServiceUrl}/orders/${orderId}`, requestOptions);
      assert.equal(deleted.status, 200);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
    });
  });

  it("releases reservations when payment fails and rejects payment after cancellation", async () => {
    await withPlatform(async ({ stock, checkout, payment, paymentStatus, order, put }) => {
      const baseline = await stock();
      const orderId = (await checkout()).data.data.id;
      const pay = await payment(orderId);
      assert.equal((await paymentStatus(pay.id, "FAILED")).status, 200);
      assert.equal((await order(orderId)).status, "FAILED");
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity);
      const cancelledId = (await checkout()).data.data.id;
      const cancelledPay = await payment(cancelledId);
      await put(cancelledId, "CANCELLED");
      assert.equal((await paymentStatus(cancelledPay.id, "PAID")).status, 409);
      assert.equal((await paymentStatus(cancelledPay.id, "FAILED")).status, 200);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
    });
  });

  it("uses Inventory availability and rejects multi-item shortages without partial reservations", async () => {
    await withPlatform(async ({ stock, cart, checkout, orderServiceUrl }) => {
      await cart("cart-short", [
        { productId: "prod-001", quantity: 1 },
        { productId: "prod-002", quantity: 15 },
      ]);
      const baseline = await stock();
      assert.equal((await checkout("cart-short")).status, 409);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
      assert.equal((await axios.get(`${orderServiceUrl}/orders`)).data.data.length, 10);
      await cart("cart-no-stock", [{ productId: "prod-011", quantity: 1 }]);
      assert.equal((await checkout("cart-no-stock")).status, 422);
    });
  });

  it("prevents simultaneous checkouts from overselling", async () => {
    await withPlatform(async ({ stock, cart, checkout }) => {
      await cart("cart-race", [{ productId: "prod-001", quantity: 12 }]);
      const baseline = await stock();
      const attempts = await Promise.all([checkout("cart-race"), checkout("cart-race")]);
      assert.deepEqual(attempts.map((item) => item.status).sort(), [201, 409]);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity + 12);
    });
  });

  it("preserves pending states on dependency failure and permits retry", async () => {
    await withPlatform(async ({ control, stock, checkout, payment, paymentStatus,
      order, put, orderServiceUrl, paymentServiceUrl, requestOptions }) => {
      control.fail = "reserve";
      assert.equal((await checkout()).status, 503);
      assert.equal((await axios.get(`${orderServiceUrl}/orders`)).data.data.length, 10);
      control.fail = null;
      const baseline = await stock();
      const orderId = (await checkout()).data.data.id;
      const pay = await payment(orderId);
      control.fail = "commit";
      assert.equal((await paymentStatus(pay.id, "PAID")).status, 503);
      assert.equal((await order(orderId)).status, "PENDING");
      assert.equal((await axios.get(`${paymentServiceUrl}/payments/${pay.id}`)).data.data.status, "PENDING");
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity);
      control.fail = "release";
      assert.equal((await paymentStatus(pay.id, "FAILED")).status, 503);
      assert.equal((await put(orderId, "CANCELLED")).status, 503);
      assert.equal((await axios.delete(`${orderServiceUrl}/orders/${orderId}`, requestOptions)).status, 503);
      assert.equal((await order(orderId)).status, "PENDING");
      control.fail = null;
      assert.equal((await paymentStatus(pay.id, "FAILED")).status, 200);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
    });
  });

  it("rejects malformed reservation responses and cleans up reserved stock", async () => {
    await withPlatform(async ({ control, stock, checkout, orderServiceUrl }) => {
      const baseline = await stock();
      control.malformed = "reserve";
      assert.equal((await checkout()).status, 502);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
      assert.equal((await axios.get(`${orderServiceUrl}/orders`)).data.data.length, 10);
    });
  });

  it("retries lost reservation and commit responses without duplicate stock changes", async () => {
    await withPlatform(async ({ control, stock, checkout, payment, paymentStatus, order }) => {
      const baseline = await stock();
      control.drop = "reserve";
      const created = await checkout();
      assert.equal(created.status, 201);
      const pay = await payment(created.data.data.id);
      control.drop = "commit";
      assert.equal((await paymentStatus(pay.id, "PAID")).status, 200);
      assert.equal((await order(created.data.data.id)).status, "CONFIRMED");
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity - 2);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
      const failedId = (await checkout()).data.data.id;
      const failedPay = await payment(failedId);
      control.drop = "release";
      assert.equal((await paymentStatus(failedPay.id, "FAILED")).status, 200);
      assert.equal((await order(failedId)).status, "FAILED");
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity - 2);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
    });
  });

  it("keeps a payment pending after malformed commit output and recovers on retry", async () => {
    await withPlatform(async ({ control, stock, checkout, payment, paymentStatus, order }) => {
      const baseline = await stock();
      const orderId = (await checkout()).data.data.id;
      const pay = await payment(orderId);
      control.malformed = "commit";
      assert.equal((await paymentStatus(pay.id, "PAID")).status, 502);
      assert.equal((await order(orderId)).status, "PENDING");
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity - 2);
      control.malformed = null;
      assert.equal((await paymentStatus(pay.id, "PAID")).status, 200);
      assert.equal((await order(orderId)).status, "CONFIRMED");
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity - 2);
    });
  });

  it("rejects a failed payment for an already confirmed order", async () => {
    await withPlatform(async ({ checkout, payment, paymentStatus, put, order, stock }) => {
      const orderId = (await checkout()).data.data.id;
      const pay = await payment(orderId);
      await put(orderId, "CONFIRMED");
      const committed = await stock();
      assert.equal((await paymentStatus(pay.id, "FAILED")).status, 409);
      assert.equal((await order(orderId)).status, "CONFIRMED");
      assert.equal((await stock()).stockQuantity, committed.stockQuantity);
    });
  });

  it("serializes competing confirmation, cancellation, and deletion requests", async () => {
    await withPlatform(async ({ control, stock, checkout, put, orderServiceUrl, requestOptions }) => {
      const baseline = await stock();
      const orderId = (await checkout()).data.data.id;
      control.delay = "commit";
      const results = await Promise.all([
        put(orderId, "CONFIRMED"), put(orderId, "CANCELLED"),
        axios.delete(`${orderServiceUrl}/orders/${orderId}`, requestOptions),
      ]);
      assert.deepEqual(results.map((item) => item.status), [200, 409, 409]);
      assert.equal((await stock()).stockQuantity, baseline.stockQuantity - 2);
      assert.equal((await stock()).reservedQuantity, baseline.reservedQuantity);
    });
  });

  it("completes pending sample orders using their matching reservations", async () => {
    await withPlatform(async ({ stock, paymentStatus, order }) => {
      const baseline = await stock("prod-002");
      assert.equal((await paymentStatus("pay-002", "PAID")).status, 200);
      assert.equal((await order("ord-002")).status, "CONFIRMED");
      assert.equal((await stock("prod-002")).stockQuantity, baseline.stockQuantity - 1);
      assert.equal((await stock("prod-002")).reservedQuantity, baseline.reservedQuantity - 1);
      assert.equal((await paymentStatus("pay-004", "FAILED")).status, 200);
      assert.equal((await order("ord-004")).status, "FAILED");
      assert.equal((await stock()).reservedQuantity, 3);
    });
  });
});
