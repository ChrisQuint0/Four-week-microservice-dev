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

describe("Authentication Service", () => {
  let customerServer;
  let authServer;
  let authUrl;
  let customerSequence = 0;

  before(async () => {
    const customerApp = express();
    customerApp.use(express.json());
    customerApp.post("/internal/customers", (request, response) => {
      customerSequence += 1;
      const customer = {
        id: `cust-test-${customerSequence}`,
        name: request.body.name,
        email: request.body.email,
      };
      return response.status(201).json({ success: true, data: customer });
    });

    customerServer = await listen(customerApp);
    authServer = await listen(
      createApp({
        customerServiceUrl: `http://127.0.0.1:${customerServer.address().port}`,
      }),
    );
    authUrl = `http://127.0.0.1:${authServer.address().port}`;
  });

  after(async () => {
    await Promise.all([close(authServer), close(customerServer)]);
  });

  it("updates username, password, and role without exposing credentials", async () => {
    const updated = await axios.put(`${authUrl}/users`, {
      id: "user-demo-001",
      username: "alex_updated",
      password: "UpdatedPass-789!",
      role: "ADMIN",
    });

    assert.equal(updated.status, 200);
    assert.deepEqual(updated.data.data, {
      id: "user-demo-001",
      customerId: "cust-001",
      username: "alex_updated",
      role: "ADMIN",
      status: "ACTIVE",
    });
    assert.equal(Object.hasOwn(updated.data.data, "hash"), false);
    assert.equal(Object.hasOwn(updated.data.data, "salt"), false);

    const oldLogin = await axios.post(
      `${authUrl}/login`,
      { username: "alex_demo", password: "DemoOnly-123!" },
      { validateStatus: () => true },
    );
    assert.equal(oldLogin.status, 401);

    const newLogin = await axios.post(`${authUrl}/login`, {
      username: "alex_updated",
      password: "UpdatedPass-789!",
    });
    assert.equal(newLogin.status, 200);
    assert.equal(newLogin.data.data.role, "ADMIN");

    const profile = await axios.get(`${authUrl}/users/user-demo-001`);
    assert.equal(profile.data.data.username, "alex_updated");
    assert.equal(profile.data.data.role, "ADMIN");
    assert.equal(Object.hasOwn(profile.data.data, "hash"), false);
  });

  it("validates user updates and prevents duplicate usernames", async () => {
    const registered = await axios.post(`${authUrl}/register`, {
      name: "Jamie Demo",
      email: "jamie@example.test",
      username: "jamie_demo",
      password: "DemoOnly-456!",
      role: "CUSTOMER",
    });
    const userId = registered.data.data.id;

    const duplicate = await axios.put(`${authUrl}/users`, {
      id: userId,
      username: "alex_updated",
    }, { validateStatus: () => true });
    assert.equal(duplicate.status, 409);

    const invalid = await axios.put(`${authUrl}/users`, {
      id: userId,
      password: "short",
      role: "SUPERUSER",
    }, { validateStatus: () => true });
    assert.equal(invalid.status, 400);

    const missingUser = await axios.put(`${authUrl}/users`, {
      id: "user-missing",
      role: "ADMIN",
    }, { validateStatus: () => true });
    assert.equal(missingUser.status, 404);

    const noChanges = await axios.put(`${authUrl}/users`, {
      id: userId,
    }, { validateStatus: () => true });
    assert.equal(noChanges.status, 400);
  });
});
