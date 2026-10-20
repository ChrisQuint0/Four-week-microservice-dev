const express = require("express");

const app = express();
const port = process.env.PORT || 3002;

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

//Adds new customers
app.post("/customers", (request, response) => {
  const customer = request.body;

  if (!isValidCustomer(customer)) {
    return response.status(400).json({
      success: false,
      message: "Customer must include a non-empty id, name, and valid email",
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
});

//Updates a customer
app.put("/customers", (request, response) => {
  const body = request.body || {};
  if (typeof body.id !== "string" || body.id.trim().length === 0) {
    return response.status(400).json({
      success: false,
      message: "Customer update must include a non-empty id",
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

  const customer = {
    ...customers[customerIndex],
    ...body,
    id,
  };

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

//Deletes a customer
app.delete("/customers", (request, response) => {
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
