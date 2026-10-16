const crypto = require("node:crypto");
const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3008;
const requestTimeout = 5000;
const passwordIterations = 120000;
const passwordKeyLength = 64;
const roles = new Set(["CUSTOMER", "ADMIN"]);

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(
    password,
    salt,
    passwordIterations,
    passwordKeyLength,
    "sha512",
  ).toString("hex");
  return { salt, hash };
}

function createApp({
  customerServiceUrl =
    process.env.CUSTOMER_SERVICE_URL || "http://localhost:3002",
} = {}) {
  const app = express();
  const users = [];
  app.use(express.json());

  async function validateCustomer(customerId) {
    try {
      const result = await axios.get(
        `${customerServiceUrl}/customers/${encodeURIComponent(customerId)}`,
        { timeout: requestTimeout },
      );
      if (
        result.data?.success !== true ||
        result.data.data?.id !== customerId
      ) {
        return { error: "invalid" };
      }
      return { customer: result.data.data };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 404) return { error: "missing" };
        if (status === undefined || status === 503) return { error: "unavailable" };
        return { error: "invalid" };
      }
      throw error;
    }
  }

  app.get("/health", (request, response) => {
    response.json({ success: true, service: "auth-service", status: "UP" });
  });

  app.post("/register", async (request, response) => {
    const { customerId, username, password, role } = request.body || {};
    if (
      typeof customerId !== "string" || !customerId.trim() ||
      typeof username !== "string" || !username.trim() ||
      typeof password !== "string" || password.length < 8 ||
      typeof role !== "string" || !roles.has(role)
    ) {
      return response.status(400).json({
        success: false,
        message: "Registration requires customerId, username, a password of at least 8 characters, and role CUSTOMER or ADMIN",
      });
    }
    const normalizedCustomerId = customerId.trim();
    const normalizedUsername = username.trim();
    if (users.some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase())) {
      return response.status(409).json({
        success: false,
        message: "A user with this username already exists",
      });
    }
    let result;
    try {
      result = await validateCustomer(normalizedCustomerId);
    } catch (error) {
      console.error("Unexpected error in auth service:", error);
      return response.status(500).json({
        success: false,
        message: "Registration could not be completed",
      });
    }
    if (result.error === "missing") {
      return response.status(422).json({ success: false, message: "Customer not found" });
    }
    if (result.error === "unavailable") {
      return response.status(503).json({ success: false, message: "Customer service is unavailable" });
    }
    if (result.error) {
      return response.status(502).json({ success: false, message: "Customer service returned an invalid response" });
    }

    const credentials = hashPassword(password);
    const user = {
      id: `user-${crypto.randomUUID()}`,
      customerId: normalizedCustomerId,
      username: normalizedUsername,
      role,
      status: "ACTIVE",
      ...credentials,
    };
    users.push(user);
    return response.status(201).json({
      success: true,
      data: {
        id: user.id,
        customerId: user.customerId,
        username: user.username,
        role: user.role,
        status: user.status,
      },
      message: "User registered successfully",
    });
  });

  app.post("/login", (request, response) => {
    const { username, password } = request.body || {};
    if (typeof username !== "string" || !username.trim() || typeof password !== "string") {
      return response.status(400).json({
        success: false,
        message: "Login requires a non-empty username and password",
      });
    }
    const user = users.find(
      (item) => item.username.toLowerCase() === username.trim().toLowerCase(),
    );
    if (!user || user.status !== "ACTIVE") {
      return response.status(401).json({ success: false, message: "Invalid username or password" });
    }
    const candidate = hashPassword(password, user.salt).hash;
    const candidateBuffer = Buffer.from(candidate, "hex");
    const storedBuffer = Buffer.from(user.hash, "hex");
    if (
      candidateBuffer.length !== storedBuffer.length ||
      !crypto.timingSafeEqual(candidateBuffer, storedBuffer)
    ) {
      return response.status(401).json({ success: false, message: "Invalid username or password" });
    }
    return response.json({
      success: true,
      data: {
        userId: user.id,
        customerId: user.customerId,
        username: user.username,
        role: user.role,
        accessToken: `demo-token-${crypto.randomUUID()}`,
      },
      message: "Login successful",
    });
  });

  app.get("/users/:id", (request, response) => {
    const user = users.find((item) => item.id === request.params.id);
    if (!user) {
      return response.status(404).json({ success: false, message: "User not found" });
    }
    return response.json({
      success: true,
      data: {
        id: user.id,
        customerId: user.customerId,
        username: user.username,
        role: user.role,
        status: user.status,
      },
      message: "User retrieved successfully",
    });
  });

  app.use((request, response) => {
    response.status(404).json({ success: false, message: "Route not found" });
  });
  return app;
}

if (require.main === module) {
  createApp().listen(port, "0.0.0.0", () => {
    console.log(`Auth Service is listening on port ${port}`);
  });
}

module.exports = { createApp };
