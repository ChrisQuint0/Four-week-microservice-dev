const assert = require("node:assert/strict");
const { after, before, describe, it } = require("node:test");
const express = require("express");
const axios = require("axios");
const { createApp } = require("../server");

const customers = {
  "cust-001": {
    id: "cust-001",
    name: "Alex Santos",
    email: "alex.santos@example.test",
  },
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

describe("Shopping Cart Service integration", () => {
  let customerServer;
  let productServer;
  let cartServer;
  let cartUrl;

  before(async () => {
    const customerApp = express();
    customerApp.get("/customers/:id", (request, response) => {
      const customer = customers[request.params.id];
      if (!customer) {
        return response.status(404).json({ success: false });
      }

      return response.json({ success: true, data: customer });
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
    productServer = await listen(productApp);
    cartServer = await listen(
      createApp({
        customerServiceUrl: `http://127.0.0.1:${customerServer.address().port}`,
        productServiceUrl: `http://127.0.0.1:${productServer.address().port}`,
      }),
    );
    cartUrl = `http://127.0.0.1:${cartServer.address().port}`;
  });

  after(async () => {
    await Promise.all([
      close(cartServer),
      close(productServer),
      close(customerServer),
    ]);
  });

  it("starts with 10 carts enriched from Product Catalog", async () => {
    const response = await axios.get(`${cartUrl}/cart`);

    assert.equal(response.data.data.length, 10);
    assert.equal(response.data.data[0].id, "cart-001");
    assert.equal(response.data.data[0].items[0].productName, "Wireless Mouse");
  });

  it("creates a cart with catalog-enriched prices and totals", async () => {
    const response = await axios.post(`${cartUrl}/cart`, {
      customerId: "cust-001",
      items: [
        { productId: "prod-001", quantity: 2, unitPrice: 0 },
        { productId: "prod-002", quantity: 1, subtotal: 0 },
      ],
      totalAmount: 0,
    });

    assert.equal(response.status, 201);
    const createdCartId = response.data.data.id;
    assert.match(
      createdCartId,
      /^cart-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    assert.notEqual(createdCartId, "test-cart-001");
    assert.equal(response.data.data.totalAmount, 2048);
    assert.deepEqual(response.data.data.items, [
      {
        productId: "prod-001",
        quantity: 2,
        productName: "Wireless Mouse",
        unitPrice: 599,
        subtotal: 1198,
      },
      {
        productId: "prod-002",
        quantity: 1,
        productName: "USB Keyboard",
        unitPrice: 850,
        subtotal: 850,
      },
    ]);

    const retrieved = await axios.get(`${cartUrl}/cart/${createdCartId}`);
    assert.equal(retrieved.data.data.updatedAt, response.data.data.updatedAt);
  });

  it("rejects unknown customers and products", async () => {
    await assert.rejects(
      axios.post(`${cartUrl}/cart`, {
        customerId: "cust-missing",
        items: [{ productId: "prod-001", quantity: 1 }],
      }),
      (error) => error.response.status === 422,
    );

    await assert.rejects(
      axios.post(`${cartUrl}/cart`, {
        customerId: "cust-001",
        items: [{ productId: "prod-missing", quantity: 1 }],
      }),
      (error) => error.response.status === 422,
    );
  });

  it("rejects nonpositive and invalid quantities", async () => {
    await assert.rejects(
      axios.post(`${cartUrl}/cart`, {
        customerId: "cust-001",
        items: [{ productId: "prod-001", quantity: 0 }],
      }),
      (error) => error.response.status === 400,
    );

    await assert.rejects(
      axios.post(`${cartUrl}/cart`, {
        id: "client-cart-id",
        customerId: "cust-001",
        items: [{ productId: "prod-001", quantity: 1 }],
      }),
      (error) => error.response.status === 400,
    );
  });

  it("adds items by merging quantities and supports cart updates", async () => {
    const created = await axios.post(`${cartUrl}/cart`, {
      customerId: "cust-001",
      items: [{ productId: "prod-001", quantity: 2 }],
    });
    const cartId = created.data.data.id;
    const added = await axios.post(`${cartUrl}/cart/items`, {
      id: cartId,
      productId: "prod-001",
      quantity: 3,
    });
    assert.equal(added.data.data.items[0].quantity, 5);
    assert.equal(added.data.data.items[0].subtotal, 2995);

    const updated = await axios.put(`${cartUrl}/cart`, {
      id: cartId,
      items: [{ productId: "prod-002", quantity: 2 }],
    });
    assert.equal(updated.data.data.customerId, "cust-001");
    assert.equal(updated.data.data.totalAmount, 1700);
  });

  it("requires a cart id in the request body and returns not found for unknown carts", async () => {
    await assert.rejects(
      axios.post(`${cartUrl}/cart/items`, {
        productId: "prod-001",
        quantity: 1,
      }),
      (error) => error.response.status === 400,
    );

    await assert.rejects(
      axios.post(`${cartUrl}/cart/items`, {
        id: "missing-cart",
        productId: "prod-001",
        quantity: 1,
      }),
      (error) => error.response.status === 404,
    );
  });

  it("deletes carts and returns not found for missing carts", async () => {
    const created = await axios.post(`${cartUrl}/cart`, {
      customerId: "cust-001",
      items: [{ productId: "prod-001", quantity: 1 }],
    });
    const cartId = created.data.data.id;
    const deleted = await axios.delete(`${cartUrl}/cart`, {
      data: { id: cartId },
    });
    assert.equal(deleted.data.data.id, cartId);

    await assert.rejects(
      axios.get(`${cartUrl}/cart/${cartId}`),
      (error) => error.response.status === 404,
    );
  });
});
