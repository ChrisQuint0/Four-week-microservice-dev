const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const express = require("express");
const axios = require("axios");
const { createApp } = require("../server");
const { createApp: createInventoryApp } = require("../../inventory-service/server");

const customer = {
  id: "cust-001",
  name: "Alex Santos",
  email: "alex.santos@example.test",
};

const products = {
  "prod-001": {
    id: "prod-001",
    name: "Wireless Mouse",
    price: 599,
    stockQuantity: 25,
  },
  "prod-002": {
    id: "prod-002",
    name: "USB Keyboard",
    price: 850,
    stockQuantity: 15,
  },
};

const carts = {
  "cart-001": {
    id: "cart-001",
    customerId: "cust-001",
    items: [
      { productId: "prod-001", quantity: 2, unitPrice: 1, subtotal: 2 },
      { productId: "prod-002", quantity: 1, unitPrice: 1, subtotal: 1 },
    ],
  },
  "cart-other-customer": {
    id: "cart-other-customer",
    customerId: "cust-002",
    items: [{ productId: "prod-001", quantity: 1 }],
  },
  "cart-unknown-product": {
    id: "cart-unknown-product",
    customerId: "cust-001",
    items: [{ productId: "prod-missing", quantity: 1 }],
  },
  "cart-insufficient-stock": {
    id: "cart-insufficient-stock",
    customerId: "cust-001",
    items: [{ productId: "prod-001", quantity: 26 }],
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

describe("Order Service integration", () => {
  let customerServer;
  let cartServer;
  let productServer;
  let inventoryServer;
  let orderServer;
  let orderUrl;
  let createdOrderId;

  before(async () => {
    const customerApp = express();
    customerApp.get("/customers/:id", (request, response) => {
      if (request.params.id !== customer.id) {
        return response.status(404).json({ success: false });
      }

      return response.json({ success: true, data: customer });
    });

    const cartApp = express();
    cartApp.get("/cart/:id", (request, response) => {
      const cart = carts[request.params.id];
      if (!cart) {
        return response.status(404).json({ success: false });
      }

      return response.json({ success: true, data: cart });
    });

    const productApp = express();
    productApp.get("/products/:id", (request, response) => {
      const product = products[request.params.id];
      if (!product) {
        return response.status(404).json({ success: false });
      }

      return response.json({ success: true, data: product });
    });

    customerServer = await listen(customerApp);
    cartServer = await listen(cartApp);
    productServer = await listen(productApp);
    inventoryServer = await listen(createInventoryApp({
      productServiceUrl: `http://127.0.0.1:${productServer.address().port}`,
    }));
    orderServer = await listen(
      createApp({
        customerServiceUrl: `http://127.0.0.1:${customerServer.address().port}`,
        cartServiceUrl: `http://127.0.0.1:${cartServer.address().port}`,
        productServiceUrl: `http://127.0.0.1:${productServer.address().port}`,
        inventoryServiceUrl: `http://127.0.0.1:${inventoryServer.address().port}`,
      }),
    );
    orderUrl = `http://127.0.0.1:${orderServer.address().port}`;
  });

  after(async () => {
    await Promise.all([
      close(orderServer),
      close(productServer),
      close(inventoryServer),
      close(cartServer),
      close(customerServer),
    ]);
  });

  it("starts with 10 existing orders", async () => {
    const listed = await axios.get(`${orderUrl}/orders`);
    assert.equal(listed.data.data.length, 10);
    assert.equal(listed.data.data[0].id, "ord-001");
    assert.equal(listed.data.data[0].totalAmount, 1198);

    const expectedCartItems = [
      [{ productId: "prod-001", quantity: 2 }],
      [{ productId: "prod-002", quantity: 1 }],
      [
        { productId: "prod-001", quantity: 1 },
        { productId: "prod-002", quantity: 1 },
      ],
      [{ productId: "prod-001", quantity: 3 }],
      [{ productId: "prod-002", quantity: 2 }],
      [
        { productId: "prod-001", quantity: 1 },
        { productId: "prod-002", quantity: 2 },
      ],
      [{ productId: "prod-001", quantity: 2 }],
      [{ productId: "prod-002", quantity: 1 }],
      [
        { productId: "prod-001", quantity: 1 },
        { productId: "prod-002", quantity: 1 },
      ],
      [{ productId: "prod-001", quantity: 1 }],
    ];

    for (const [index, order] of listed.data.data.entries()) {
      assert.equal(order.id, `ord-${String(index + 1).padStart(3, "0")}`);
      assert.equal(order.customerId, `cust-${String(index + 1).padStart(3, "0")}`);
      assert.equal(order.cartId, `cart-${String(index + 1).padStart(3, "0")}`);
      assert.deepEqual(
        order.items.map(({ productId, quantity }) => ({ productId, quantity })),
        expectedCartItems[index],
      );
    }

    const retrieved = await axios.get(`${orderUrl}/orders/ord-001`);
    assert.equal(retrieved.data.data.customerId, "cust-001");
  });

  it("rejects incomplete order requests", async () => {
    await assert.rejects(
      axios.post(`${orderUrl}/orders`, {}),
      (error) => error.response.status === 400,
    );
  });

  it("rejects carts with unknown customers and unknown carts", async () => {
    await assert.rejects(
      axios.post(`${orderUrl}/orders`, {
        cartId: "cart-other-customer",
      }),
      (error) => error.response.status === 422,
    );

    await assert.rejects(
      axios.post(`${orderUrl}/orders`, {
        cartId: "cart-missing",
      }),
      (error) => error.response.status === 422,
    );
  });

  it("rejects unknown products and insufficient stock", async () => {
    await assert.rejects(
      axios.post(`${orderUrl}/orders`, {
        cartId: "cart-unknown-product",
      }),
      (error) => error.response.status === 422,
    );
    await assert.rejects(
      axios.post(`${orderUrl}/orders`, {
        cartId: "cart-insufficient-stock",
      }),
      (error) => error.response.status === 409,
    );
  });

  it("creates an order with authoritative catalog prices and a pending status", async () => {
    const response = await axios.post(`${orderUrl}/orders`, {
      cartId: "cart-001",
      totalAmount: 1,
      status: "CONFIRMED",
    });
    const order = response.data.data;
    createdOrderId = order.id;

    assert.equal(response.status, 201);
    assert.match(order.id, /^ord-/);
    assert.equal(order.customerId, "cust-001");
    assert.equal(order.cartId, "cart-001");
    assert.equal(order.totalAmount, 2048);
    assert.equal(order.status, "PENDING");
    assert.ok(Number.isFinite(Date.parse(order.createdAt)));
    assert.deepEqual(order.items, [
      {
        productId: "prod-001",
        quantity: 2,
        unitPrice: 599,
        subtotal: 1198,
      },
      {
        productId: "prod-002",
        quantity: 1,
        unitPrice: 850,
        subtotal: 850,
      },
    ]);
  });

  it("lists, retrieves, and permits status-only order updates", async () => {
    const listed = await axios.get(`${orderUrl}/orders`);
    assert.equal(listed.data.data.length, 11);

    const retrieved = await axios.get(
      `${orderUrl}/orders/${createdOrderId}`,
    );
    assert.equal(retrieved.data.data.id, createdOrderId);

    const updated = await axios.put(
      `${orderUrl}/orders`,
      { id: createdOrderId, status: "CONFIRMED" },
    );
    assert.equal(updated.data.data.status, "CONFIRMED");

    await assert.rejects(
      axios.put(`${orderUrl}/orders`, {
        id: createdOrderId,
        status: "PAID",
      }),
      (error) => error.response.status === 400,
    );

    await assert.rejects(
      axios.put(`${orderUrl}/orders`, {
        id: createdOrderId,
        status: "CANCELLED",
        totalAmount: 0,
      }),
      (error) => error.response.status === 400,
    );
  });

  it("deletes test orders and reports missing orders", async () => {
    const deleted = await axios.delete(
      `${orderUrl}/orders`,
      { data: { id: createdOrderId } },
    );
    assert.equal(deleted.data.data.id, createdOrderId);

    await assert.rejects(
      axios.get(`${orderUrl}/orders/${createdOrderId}`),
      (error) => error.response.status === 404,
    );
  });
});
