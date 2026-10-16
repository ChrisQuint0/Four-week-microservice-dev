const crypto = require("node:crypto");
const axios = require("axios");
const express = require("express");

const port = process.env.PORT || 3008;
const iterations = 120000;
function passwordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
  return { salt, hash: crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex") };
}

function createApp({ customerServiceUrl = process.env.CUSTOMER_SERVICE_URL || "http://localhost:3002" } = {}) {
  const app = express();
  const users = [];
  app.use(express.json());

  app.get("/health", (req, res) => res.json({ success: true, service: "auth-service", status: "UP" }));
  app.post("/register", async (req, res) => {
    const { customerId, username, password, role } = req.body || {};
    if (typeof customerId !== "string" || !customerId.trim() || typeof username !== "string" || !username.trim() || typeof password !== "string" || password.length < 8 || !["CUSTOMER", "ADMIN"].includes(role)) {
      return res.status(400).json({ success: false, message: "Registration requires customerId, username, a password of at least 8 characters, and role CUSTOMER or ADMIN" });
    }
    const normalizedUsername = username.trim();
    const normalizedCustomerId = customerId.trim();
    if (users.some((user) => user.username.toLowerCase() === normalizedUsername.toLowerCase())) {
      return res.status(409).json({ success: false, message: "A user with this username already exists" });
    }
    try {
      const result = await axios.get(`${customerServiceUrl}/customers/${encodeURIComponent(normalizedCustomerId)}`, { timeout: 5000 });
      if (result.data?.success !== true || result.data.data?.id !== normalizedCustomerId) {
        return res.status(502).json({ success: false, message: "Customer service returned an invalid customer" });
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 404) return res.status(422).json({ success: false, message: "Customer not found" });
        if (error.response?.status === undefined || error.response?.status === 503) return res.status(503).json({ success: false, message: "Customer service is unavailable" });
        return res.status(502).json({ success: false, message: "Customer service returned an invalid response" });
      }
      console.error("Unexpected auth service error:", error);
      return res.status(500).json({ success: false, message: "Registration could not be completed" });
    }
    const credentials = passwordHash(password);
    const user = { id: `user-${crypto.randomUUID()}`, customerId: normalizedCustomerId, username: normalizedUsername, role, status: "ACTIVE", ...credentials };
    users.push(user);
    return res.status(201).json({ success: true, data: { id: user.id, customerId: user.customerId, username: user.username, role: user.role, status: user.status }, message: "User registered successfully" });
  });
  app.post("/login", (req, res) => {
    const { username, password } = req.body || {};
    if (typeof username !== "string" || !username.trim() || typeof password !== "string") return res.status(400).json({ success: false, message: "Login requires a non-empty username and password" });
    const user = users.find((item) => item.username.toLowerCase() === username.trim().toLowerCase());
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ success: false, message: "Invalid username or password" });
    const candidate = Buffer.from(passwordHash(password, user.salt).hash, "hex");
    const stored = Buffer.from(user.hash, "hex");
    if (candidate.length !== stored.length || !crypto.timingSafeEqual(candidate, stored)) return res.status(401).json({ success: false, message: "Invalid username or password" });
    return res.json({ success: true, data: { userId: user.id, customerId: user.customerId, username: user.username, role: user.role, accessToken: `demo-token-${crypto.randomUUID()}` }, message: "Login successful" });
  });
  app.get("/users/:id", (req, res) => {
    const user = users.find((item) => item.id === req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, data: { id: user.id, customerId: user.customerId, username: user.username, role: user.role, status: user.status }, message: "User retrieved successfully" });
  });
  app.use((req, res) => res.status(404).json({ success: false, message: "Route not found" }));
  return app;
}

if (require.main === module) createApp().listen(port, "0.0.0.0", () => console.log(`Auth Service is listening on port ${port}`));
module.exports = { createApp };
