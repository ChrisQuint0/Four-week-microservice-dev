const crypto = require("node:crypto");
const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3008;
const iterations = 120000;
function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return {
    salt,
    hash: crypto
      .pbkdf2Sync(password, salt, iterations, 64, "sha512")
      .toString("hex"),
  };
}

function createApp({
  customerServiceUrl = process.env.CUSTOMER_SERVICE_URL ||
    "http://localhost:3002",
} = {}) {
  const app = express();
  const demoCredentials = passwordHash("DemoOnly-123!");
  const users = [
    {
      id: "user-demo-001",
      customerId: "cust-001",
      username: "alex_demo",
      role: "CUSTOMER",
      status: "ACTIVE",
      ...demoCredentials,
    },
  ];
  app.use(express.json());

  app.get("/health", (req, res) =>
    res.json({ success: true, service: "auth-service", status: "UP" }),
  );
  app.post("/register", async (req, res) => {
    const { name, email, username, password, role } = req.body || {};
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      typeof username !== "string" ||
      !username.trim() ||
      typeof password !== "string" ||
      password.length < 8 ||
      !["CUSTOMER", "ADMIN"].includes(role)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Registration requires name, valid email, username, a password of at least 8 characters, and role CUSTOMER or ADMIN",
      });
    }
    const normalizedName = name.trim();
    const normalizedEmail = email.trim();
    const normalizedUsername = username.trim();
    if (
      users.some(
        (user) =>
          user.username.toLowerCase() === normalizedUsername.toLowerCase(),
      )
    ) {
      return res.status(409).json({
        success: false,
        message: "A user with this username already exists",
      });
    }
    try {
      const result = await axios.post(
        `${customerServiceUrl}/internal/customers`,
        { name: normalizedName, email: normalizedEmail },
        { timeout: 5000 },
      );
      const customer = result.data?.data;
      if (
        result.data?.success !== true ||
        typeof customer?.id !== "string" ||
        customer.name !== normalizedName ||
        customer.email !== normalizedEmail
      ) {
        return res.status(502).json({
          success: false,
          message: "Customer service returned an invalid customer record",
        });
      }
      const credentials = passwordHash(password);
      const user = {
        id: `user-${crypto.randomUUID()}`,
        customerId: customer.id,
        username: normalizedUsername,
        role,
        status: "ACTIVE",
        ...credentials,
      };
      users.push(user);
      return res.status(201).json({
        success: true,
        data: {
          id: user.id,
          customerId: user.customerId,
          username: user.username,
          role: user.role,
          status: user.status,
        },
        message: "User and customer registered successfully",
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 400)
          return res.status(400).json({
            success: false,
            message: "Customer data was rejected by Customer Service",
          });
        if (error.response?.status === 409)
          return res.status(409).json({
            success: false,
            message: "Customer could not be created because it already exists",
          });
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
      console.error("Unexpected auth service error:", error);
      return res.status(500).json({
        success: false,
        message: "Registration could not be completed",
      });
    }
  });
  app.post("/login", (req, res) => {
    const { username, password } = req.body || {};
    if (
      typeof username !== "string" ||
      !username.trim() ||
      typeof password !== "string"
    )
      return res.status(400).json({
        success: false,
        message: "Login requires a non-empty username and password",
      });
    const user = users.find(
      (item) => item.username.toLowerCase() === username.trim().toLowerCase(),
    );
    if (!user || user.status !== "ACTIVE")
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    const candidate = Buffer.from(
      passwordHash(password, user.salt).hash,
      "hex",
    );
    const stored = Buffer.from(user.hash, "hex");
    if (
      candidate.length !== stored.length ||
      !crypto.timingSafeEqual(candidate, stored)
    )
      return res
        .status(401)
        .json({ success: false, message: "Invalid username or password" });
    return res.json({
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
  app.put("/users", (req, res) => {
    const body = req.body || {};
    const allowedFields = new Set(["id", "username", "password", "role"]);
    if (
      Object.keys(body).length < 2 ||
      Object.keys(body).some((field) => !allowedFields.has(field)) ||
      typeof body.id !== "string" ||
      !body.id.trim() ||
      (Object.hasOwn(body, "username") &&
        (typeof body.username !== "string" || !body.username.trim())) ||
      (Object.hasOwn(body, "password") &&
        (typeof body.password !== "string" || body.password.length < 8)) ||
      (Object.hasOwn(body, "role") &&
        !["CUSTOMER", "ADMIN"].includes(body.role))
    ) {
      return res.status(400).json({
        success: false,
        message:
          "User update requires an id and one or more valid username, password, or role fields",
      });
    }

    const user = users.find((item) => item.id === body.id.trim());
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    if (Object.hasOwn(body, "username")) {
      const username = body.username.trim();
      if (
        users.some(
          (item) =>
            item.id !== user.id &&
            item.username.toLowerCase() === username.toLowerCase(),
        )
      ) {
        return res.status(409).json({
          success: false,
          message: "A user with this username already exists",
        });
      }
      user.username = username;
    }
    if (Object.hasOwn(body, "password")) {
      Object.assign(user, passwordHash(body.password));
    }
    if (Object.hasOwn(body, "role")) {
      user.role = body.role;
    }

    return res.json({
      success: true,
      data: {
        id: user.id,
        customerId: user.customerId,
        username: user.username,
        role: user.role,
        status: user.status,
      },
      message: "User updated successfully",
    });
  });
  app.delete("/internal/users/customer/:customerId", (req, res) => {
    const customerId = req.params.customerId;
    const remainingUsers = users.filter(
      (user) => user.customerId !== customerId,
    );
    const deletedCount = users.length - remainingUsers.length;
    users.splice(0, users.length, ...remainingUsers);
    return res.json({
      success: true,
      data: { customerId, deletedCount },
      message: "Customer authentication records deleted",
    });
  });
  app.get("/users/:id", (req, res) => {
    const user = users.find((item) => item.id === req.params.id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    return res.json({
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
  app.use((req, res) =>
    res.status(404).json({ success: false, message: "Route not found" }),
  );
  return app;
}

if (require.main === module)
  createApp().listen(port, "0.0.0.0", () =>
    console.log(`Auth Service is listening on port ${port}`),
  );
module.exports = { createApp };
