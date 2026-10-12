const express = require("express");

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

const products = [
  {
    id: "prod-001",
    name: "Wireless Mouse",
    description: "Wireless optical mouse",
    price: 599.0,
    stockQuantity: 25,
    category: "Accessories",
  },
  {
    id: "prod-002",
    name: "USB Keyboard",
    description: "Wired keyboard",
    price: 850.0,
    stockQuantity: 15,
    category: "Accessories",
  },
  {
    id: "prod-003",
    name: "Bluetooth Headphones",
    description: "Over-ear wireless headphones",
    price: 2499.0,
    stockQuantity: 18,
    category: "Audio",
  },
  {
    id: "prod-004",
    name: "USB-C Charger",
    description: "30W USB-C wall charger",
    price: 1299.0,
    stockQuantity: 32,
    category: "Electronics",
  },
  {
    id: "prod-005",
    name: "Laptop Stand",
    description: "Adjustable aluminum laptop stand",
    price: 1799.0,
    stockQuantity: 12,
    category: "Accessories",
  },
  {
    id: "prod-006",
    name: "Portable SSD",
    description: "1TB portable solid-state drive",
    price: 5499.0,
    stockQuantity: 9,
    category: "Storage",
  },
  {
    id: "prod-007",
    name: "Webcam",
    description: "1080p USB webcam with microphone",
    price: 2199.0,
    stockQuantity: 14,
    category: "Electronics",
  },
  {
    id: "prod-008",
    name: "Wireless Mouse Pad",
    description: "Large non-slip desk mouse pad",
    price: 499.0,
    stockQuantity: 40,
    category: "Accessories",
  },
  {
    id: "prod-009",
    name: "Bluetooth Speaker",
    description: "Compact portable Bluetooth speaker",
    price: 1899.0,
    stockQuantity: 21,
    category: "Audio",
  },
  {
    id: "prod-010",
    name: "HDMI Cable",
    description: "2-meter HDMI 2.1 cable",
    price: 399.0,
    stockQuantity: 50,
    category: "Cables",
  },
];

//Function containing checks if a product is a valid product
function isValidProduct(product) {
  return (
    typeof product.id === "string" &&
    product.id.trim().length > 0 &&
    typeof product.name === "string" &&
    product.name.trim().length > 0 &&
    typeof product.description === "string" &&
    typeof product.category === "string" &&
    Number.isFinite(product.price) &&
    product.price >= 0 &&
    Number.isInteger(product.stockQuantity) &&
    product.stockQuantity >= 0
  );
}

//Check health of the service
app.get("/health", (request, response) => {
  response.json({ success: true, message: "Product service is healthy" });
});

//Get all products
app.get("/products", (request, response) => {
  response.json({
    success: true,
    data: products,
    message: "Products retrieved successfully",
  });
});

//Get specific product
app.get("/products/:id", (request, response) => {
  const product = products.find((item) => item.id === request.params.id);

  if (!product) {
    return response.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  return response.json({
    success: true,
    data: product,
    message: "Product retrieved successfully",
  });
});

//Add new products
app.post("/products", (request, response) => {
  const product = request.body;

  if (!isValidProduct(product)) {
    return response.status(400).json({
      success: false,
      message:
        "Product must include an id, name, description, category, a non-negative price, and a non-negative integer stockQuantity",
    });
  }

  //Ensures there are no duplicate product ids, insertion fails if id already exists
  if (products.some((item) => item.id === product.id)) {
    return response.status(409).json({
      success: false,
      message: "A product with this id already exists",
    });
  }

  products.push(product);
  return response.status(201).json({
    success: true,
    data: product,
    message: "Product created successfully",
  });
});

//Updates a product
app.put("/products/:id", (request, response) => {
  const productIndex = products.findIndex(
    (item) => item.id === request.params.id,
  );

  if (productIndex === -1) {
    return response.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  const product = {
    ...products[productIndex],
    ...request.body,
    id: request.params.id,
  };
  if (!isValidProduct(product)) {
    return response.status(400).json({
      success: false,
      message:
        "Product must include a name, description, category, a non-negative price, and a non-negative integer stockQuantity",
    });
  }

  products[productIndex] = product;
  return response.json({
    success: true,
    data: product,
    message: "Product updated successfully",
  });
});

//Deletes a product
app.delete("/products/:id", (request, response) => {
  const productIndex = products.findIndex(
    (item) => item.id === request.params.id,
  );

  if (productIndex === -1) {
    return response.status(404).json({
      success: false,
      message: "Product not found",
    });
  }

  const [product] = products.splice(productIndex, 1);
  return response.json({
    success: true,
    data: product,
    message: "Product deleted successfully",
  });
});

app.listen(port, () => {
  console.log(`Product service listening on port ${port}`);
});
