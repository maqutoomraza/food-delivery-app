const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const ExcelJS = require('exceljs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;
const DB_FILE = './db.json';
const JWT_SECRET = 'your-super-secret-key-change-this'; // Change this in production

// --- Multer Configuration ---
const uploadDir = 'public/uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// --- Middleware & Helpers ---
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const readDb = () => JSON.parse(fs.readFileSync(DB_FILE));
const writeDb = (data) => fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));

// --- Authentication Middleware ---
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
  if (token == null) return res.sendStatus(401); // Unauthorized

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // Forbidden
    req.user = user;
    next();
  });
};

// --- Authorization Middleware (Admin Only) ---
const authorizeAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).send('Access denied: Admins only.');
  }
  next();
};

// --- LOGIN Route (Supports admin + manager plain text passwords for testing) ---
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDb();
  const user = db.users.find((u) => u.username === username);

  if (!user) {
    return res.status(400).send('Cannot find user');
  }

  // ✅ Temporary plain text checks for testing
  if (
    (user.username === 'admin' && password === 'admin123') ||
    (user.username === 'manager' && password === 'manager123')
  ) {
    const userPayload = { username: user.username, role: user.role };
    const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '1h' });
    return res.json({ accessToken: accessToken, role: user.role });
  }

  // ✅ Fallback to real bcrypt hash check
  if (bcrypt.compareSync(password, user.password)) {
    const userPayload = { username: user.username, role: user.role };
    const accessToken = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '1h' });
    return res.json({ accessToken: accessToken, role: user.role });
  }

  res.status(401).send('Invalid credentials');
});

// --- PRODUCT ROUTES ---
// Public: Get all products
app.get('/api/products', (req, res) => res.json(readDb().products));

// Admin Only: Add new product
app.post('/api/products', authenticateToken, authorizeAdmin, upload.single('image'), (req, res) => {
  const db = readDb();
  const { name, price, stock, category } = req.body;
  const parsedPrice = parseFloat(price);
  const parsedStock = parseInt(stock, 10);
  if (!name || !req.file || !category || isNaN(parsedPrice) || isNaN(parsedStock) || parsedPrice < 0 || parsedStock < 0) {
    return res.status(400).send('Invalid or missing product details, including category.');
  }
  const product = {
    name,
    price: parsedPrice,
    stock: parsedStock,
    category,
    id: `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
    image: `/uploads/${req.file.filename}`
  };
  db.products.push(product);
  writeDb(db);
  res.status(201).json(product);
});

// Admin Only: Update product
app.put('/api/products/:id', authenticateToken, authorizeAdmin, upload.single('image'), (req, res) => {
  const db = readDb();
  const productIndex = db.products.findIndex((p) => p.id === req.params.id);
  if (productIndex === -1) return res.status(404).send('Product not found.');

  const { name, price, stock, category } = req.body;
  const parsedPrice = parseFloat(price);
  const parsedStock = parseInt(stock, 10);
  if (!name || !category || isNaN(parsedPrice) || isNaN(parsedStock)) {
    return res.status(400).send('Invalid product details.');
  }

  const updatedProduct = db.products[productIndex];
  updatedProduct.name = name;
  updatedProduct.price = parsedPrice;
  updatedProduct.stock = parsedStock;
  updatedProduct.category = category;

  if (req.file) {
    const oldImagePath = path.join(__dirname, 'public', updatedProduct.image);
    if (fs.existsSync(oldImagePath) && updatedProduct.image.includes('/uploads/')) fs.unlinkSync(oldImagePath);
    updatedProduct.image = `/uploads/${req.file.filename}`;
  }

  db.products[productIndex] = updatedProduct;
  writeDb(db);
  res.json(updatedProduct);
});

// Admin Only: Delete product
app.delete('/api/products/:id', authenticateToken, authorizeAdmin, (req, res) => {
  const db = readDb();
  const productIndex = db.products.findIndex((p) => p.id === req.params.id);
  if (productIndex === -1) return res.status(404).send('Product not found.');

  const productToDelete = db.products[productIndex];
  const imagePath = path.join(__dirname, 'public', productToDelete.image);
  if (fs.existsSync(imagePath) && productToDelete.image.includes('/uploads/')) fs.unlinkSync(imagePath);

  db.products.splice(productIndex, 1);
  writeDb(db);
  res.status(204).send();
});

// --- ORDER ROUTE (Public) ---
app.post('/api/orders', (req, res) => {
  const order = req.body;
  if (order.paymentMethod === 'Paid' || order.paymentMethod === 'COD') {
    const db = readDb();
    order.cart.forEach((cartItem) => {
      const product = db.products.find((p) => p.id === cartItem.id);
      if (product) product.stock = Math.max(0, product.stock - cartItem.quantity);
    });
    writeDb(db);
  }
  res.status(200).json({ message: 'Order processed successfully' });
});

// --- EXPORT TO EXCEL (Protected - any user) ---
app.post('/api/export-excel', authenticateToken, async (req, res) => {
  const { productIds } = req.body;
  if (!productIds || productIds.length === 0) return res.status(400).send('No products selected.');

  const db = readDb();
  const selectedProducts = db.products.filter((p) => productIds.includes(p.id));

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Products');
  worksheet.columns = [
    { header: 'ID', key: 'id', width: 30 },
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Price', key: 'price', width: 10, style: { numFmt: '"RS"#,##0.00' } },
    { header: 'Stock', key: 'stock', width: 10 }
  ];
  worksheet.addRows(selectedProducts);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename=' + 'products.xlsx');
  await workbook.xlsx.write(res);
  res.end();
});

// --- START SERVER ---
app.listen(PORT, () => console.log(`✅ Server is running at http://localhost:${PORT}`));
