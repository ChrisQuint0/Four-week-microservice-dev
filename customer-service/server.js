const express = require("express");
const axios = require("axios");

const app = express();
const port = process.env.PORT || 3002;
const authServiceUrl = process.env.AUTH_SERVICE_URL || "http://localhost:3008";
const requestTimeout = 5000;

app.use(express.json());

const customers = [
  {
    id: "cust-001",
    name: "Alex Santos",
    email: "alex.santos@example.test",
  },
  {
    id: "cust-002",
    name: "Jamie Reyes",
    email: "jamie.reyes@example.test",
  },
  {
    id: "cust-003",
    name: "Morgan Cruz",
    email: "morgan.cruz@example.test",
  },
  {
    id: "cust-004",
    name: "Taylor Lim",
    email: "taylor.lim@example.test",
  },
  {
    id: "cust-005",
    name: "Riley Garcia",
    email: "riley.garcia@example.test",
  },
  {
    id: "cust-006",
    name: "Casey Mendoza",
    email: "casey.mendoza@example.test",
  },
  {
    id: "cust-007",
    name: "Jordan Flores",
    email: "jordan.flores@example.test",
  },
  {
    id: "cust-008",
    name: "Avery Castillo",
    email: "avery.castillo@example.test",
  },
  {
    id: "cust-009",
    name: "Cameron Bautista",
    email: "cameron.bautista@example.test",
  },
  {
    id: "cust-010",
    name: "Quinn Navarro",
    email: "quinn.navarro@example.test",
  },
];

//Function containing checks if customer is valid
function isValidCustomer(customer) {
  return (
    customer !== null &&
    typeof customer === "object" &&
    typeof customer.id === "string" &&
    customer.id.trim().length > 0 &&
    typeof customer.name === "string" &&
    customer.name.trim().length > 0 &&
    typeof customer.email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)
  );
}

function nextCustomerId() {
  const highestId = customers.reduce((highest, customer) => {
    const match = /^cust-(\d+)$/.exec(customer.id);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);

  return `cust-${String(highestId + 1).padStart(3, "0")}`;
}

//Checks service health
app.get("/health", (request, response) => {
  response.json({ success: true, message: "Customer service is healthy" });
});

//Gets all the customers
app.get("/customers", (request, response) => {
  response.json({
    success: true,
    data: customers,
    message: "Customers retrieved successfully",
  });
});

//Gets specific customer with their id
app.get("/customers/:id", (request, response) => {
  const customer = customers.find((item) => item.id === request.params.id);

  if (!customer) {
    return response.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }

  return response.json({
    success: true,
    data: customer,
    message: "Customer retrieved successfully",
  });
});

function createCustomer(request, response) {
  const body = request.body || {};
  if (
    Object.hasOwn(body, "id") &&
    (typeof body.id !== "string" || body.id.trim().length === 0)
  ) {
    return response.status(400).json({
      success: false,
      message: "Customer id must be a non-empty string when provided",
    });
  }

  const customer = {
    id: body.id ? body.id.trim() : nextCustomerId(),
    name: body.name,
    email: body.email,
  };

  if (!isValidCustomer(customer)) {
    return response.status(400).json({
      success: false,
      message: "Customer must include a non-empty name and valid email",
    });
  }

  if (customers.some((item) => item.id === customer.id)) {
    return response.status(409).json({
      success: false,
      message: "A customer with this id already exists",
    });
  }

  customers.push(customer);
  return response.status(201).json({
    success: true,
    data: customer,
    message: "Customer created successfully",
  });
}

// Customer records are created by Auth Service during registration.
app.post("/internal/customers", createCustomer);

app.post("/customers", (request, response) => {
  return response.status(405).json({
    success: false,
    message: "Customers must be created through Authentication Service",
  });
});

//Updates a customer
app.put("/customers", (request, response) => {
  const body = request.body || {};
  const allowedFields = new Set(["id", "name", "email"]);
  if (
    typeof body.id !== "string" ||
    body.id.trim().length === 0 ||
    Object.keys(body).some((field) => !allowedFields.has(field)) ||
    (!Object.hasOwn(body, "name") && !Object.hasOwn(body, "email"))
  ) {
    return response.status(400).json({
      success: false,
      message: "Customer update must include only id, name, or email fields",
    });
  }

  const id = body.id.trim();
  const customerIndex = customers.findIndex((item) => item.id === id);

  if (customerIndex === -1) {
    return response.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }

  const customer = { ...customers[customerIndex] };
  if (Object.hasOwn(body, "name")) customer.name = body.name;
  if (Object.hasOwn(body, "email")) customer.email = body.email;

  if (!isValidCustomer(customer)) {
    return response.status(400).json({
      success: false,
      message: "Customer must include a non-empty name and valid email",
    });
  }

  customers[customerIndex] = customer;
  return response.json({
    success: true,
    data: customer,
    message: "Customer updated successfully",
  });
});

// Deletes a customer and its linked authentication records.
app.delete("/customers", async (request, response) => {
  const body = request.body || {};
  if (
    Object.keys(body).length !== 1 ||
    typeof body.id !== "string" ||
    body.id.trim().length === 0
  ) {
    return response.status(400).json({
      success: false,
      message: "Customer deletion must include only a non-empty id",
    });
  }

  const customerIndex = customers.findIndex(
    (item) => item.id === body.id.trim(),
  );

  if (customerIndex === -1) {
    return response.status(404).json({
      success: false,
      message: "Customer not found",
    });
  }

  try {
    const authResponse = await axios.delete(
      `${authServiceUrl}/internal/users/customer/${encodeURIComponent(body.id.trim())}`,
      { timeout: requestTimeout },
    );
    if (authResponse.data?.success !== true) {
      return response.status(502).json({
        success: false,
        message: "Authentication Service returned an invalid response",
      });
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      return response
        .status(error.response?.status === undefined ? 503 : 502)
        .json({
          success: false,
          message: "Authentication Service is unavailable",
        });
    }
    console.error("Unexpected authentication cascade error:", error);
    return response.status(500).json({
      success: false,
      message: "Customer deletion could not be completed",
    });
  }

  const [customer] = customers.splice(customerIndex, 1);
  return response.json({
    success: true,
    data: customer,
    message: "Customer deleted successfully",
  });
});

app.listen(port, () => {
  console.log(`Customer Service is listening on port ${port}`);
});
