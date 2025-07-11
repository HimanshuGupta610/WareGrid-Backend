const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path'); 
const cron = require('node-cron');
const app = express();
const jwt = require('jsonwebtoken');
const { logActivity } = require('./utils/logger');
const multer = require('multer');
const csv = require('csv-parser');
const upload = multer({ dest: 'uploads/' });


const PORT = 5000;
const SECRET_KEY = 'your_super_secret_key';

app.use(express.json());
app.use(cors());

 // store securely in .env

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const users = JSON.parse(fs.readFileSync('./users.json'));

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  // ✅ Include `role` in JWT payload
  const token = jwt.sign(
    { username: user.username, role: user.role },
    SECRET_KEY,
    { expiresIn: '1h' }
  );

  res.json({ token });
});

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'Missing token' });

  const token = authHeader.split(' ')[1]; // Bearer <token>
  jwt.verify(token, SECRET_KEY, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
};

// Use it on protected routes
app.get('/api/protected', verifyToken, (req, res) => {
  res.json({ message: `Hello ${req.user.username}, you're authorized.` });
});



// Load inventory data
const inventoryData = JSON.parse(fs.readFileSync('./inventory.json'));



// Route: Get full inventory
app.get('/api/inventory', (req, res) => {
  const filePath = path.join(__dirname, 'inventory.json');
  const data = JSON.parse(fs.readFileSync(filePath));
  res.json(data); // ✅ Always reads latest version
});

// Route: Get inventory by warehouse
app.get('/api/warehouse/:id',  (req, res) => {
  const warehouseId = req.params.id;
  const filePath = path.join(__dirname, 'inventory.json');
  const data = JSON.parse(fs.readFileSync(filePath));
  const filtered = data.filter(item => item.warehouseId === warehouseId);
  res.json(filtered);
});

// Route: Get low stock alerts
app.get('/api/alerts',  (req, res) => {
  const filePath = path.join(__dirname, 'inventory.json');
  const data = JSON.parse(fs.readFileSync(filePath));
  const lowStockItems = data.filter(item => item.currentStock < item.minThreshold);
  res.json(lowStockItems);
});

app.post('/api/upload-products', verifyToken, upload.single('file'), (req, res) => {
  const filePath = req.file.path;
  const inventoryPath = path.join(__dirname, 'inventory.json');

  const products = [];
  const today = new Date().toISOString().split('T')[0];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      const newProduct = {
        productId: row.productId,
        productName: row.productName,
        category: row.category,
        warehouseId: row.warehouseId,
        warehouseLocation: row.warehouseLocation,
        currentStock: parseInt(row.currentStock),
        minThreshold: parseInt(row.minThreshold),
        maxCapacity: parseInt(row.maxCapacity),
        expectedDemand: parseInt(row.expectedDemand),
        history: [{ date: today, stock: parseInt(row.currentStock) }],
      };
      products.push(newProduct);
    })
    .on('end', () => {
      const data = JSON.parse(fs.readFileSync(inventoryPath));
      const updated = [...data, ...products];
      fs.writeFileSync(inventoryPath, JSON.stringify(updated, null, 2));
      
      const username = req.user?.username || 'unknown';

      logActivity({
        username,
        action: 'bulk_upload_products',
        count: products.length,
        timestamp: new Date().toISOString()
        
      });
      res.json({ success: true, added: products.length });
    });
});
app.post('/api/auto-update-history', (req, res) => {
  const filePath = path.join(__dirname, 'inventory.json');

  try {
    const data = JSON.parse(fs.readFileSync(filePath));
    const today = new Date().toISOString().split('T')[0];

    const updated = data.map(item => {
      let history = Array.isArray(item.history) ? [...item.history] : [];

      const hasToday = history.some(h => h.date === today);
      if (!hasToday) {
        const lastStock = history.length > 0 ? history[history.length - 1].stock : item.currentStock;

        history.push({ date: today, stock: lastStock });

        // Keep only last 7 days
        history = history.filter(h => {
          const d = new Date(h.date);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - 7);
          return d >= cutoff;
        });
      }

      return { ...item, history };
    });

    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    res.json({ success: true, message: '✅ History auto-filled for today.' });
  } catch (err) {
    console.error('❌ Failed to auto-update history:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/update-stock', verifyToken, (req, res) => {
  const { productId, warehouseId, currentStock } = req.body;

  if (!productId || !warehouseId || currentStock === undefined) {
    return res.status(400).json({ success: false, error: "Missing required fields." });
  }

  const filePath = path.join(__dirname, 'inventory.json');
  const logPath = path.join(__dirname, 'activity-log.json');
  const today = new Date().toISOString().split('T')[0];

  try {
    let data = JSON.parse(fs.readFileSync(filePath));

    const updated = data.map(item => {
      if (item.productId === productId && item.warehouseId === warehouseId) {
        let history = Array.isArray(item.history) ? [...item.history] : [];

        history = history.filter(h => h.date !== today);
        history.push({ date: today, stock: currentStock });

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        history = history.filter(h => new Date(h.date) >= cutoff);

        return { ...item, currentStock, history };
      }
      return item;
    });

    // ✅ Write updated inventory
    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));

    // ✅ Append activity log
    const logEntry = {
      username: req.user?.username || "unknown",
      action: "edit_stock",
      productId,
      warehouseId,
      newStock: currentStock,
      timestamp: new Date().toISOString()
    };

    let logs = [];
    if (fs.existsSync(logPath)) {
      logs = JSON.parse(fs.readFileSync(logPath));
    }
    logs.push(logEntry);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error updating inventory.json:", err.stack || err);
    res.status(500).json({ success: false, error: "Failed to update inventory." });
  }
});




app.post('/api/add-product', verifyToken, (req, res) => {
  const {
    productName,
    category,
    warehouseId,
    warehouseLocation,
    currentStock,
    minThreshold,
    maxCapacity,
    expectedDemand
  } = req.body;

  const filePath = path.join(__dirname, 'inventory.json');

  try {
    const data = JSON.parse(fs.readFileSync(filePath));

    // ✅ Auto-generate product ID
    const productId = 'P' + String(data.length + 1).padStart(3, '0');

    // ✅ Today's date in YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];

    // ✅ New product object
    const newProduct = {
      productId,
      productName,
      category,
      warehouseId,
      warehouseLocation,
      currentStock,
      minThreshold,
      maxCapacity,
      expectedDemand,
      history: [
        {
          date: today,
          stock: currentStock
        }
      ]
    };

    // ✅ Add and write to inventory.json
    data.push(newProduct);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    logActivity({
      username: req.user?.username || 'unknown',
      action: 'Add Product',
      productId,
      warehouseId,
    });


    res.json({ success: true, added: newProduct });
  } catch (err) {
    console.error("❌ Failed to add new product:", err);
    res.status(500).json({ success: false, error: "Failed to add product." });
  }
});

app.get('/api/warehouses', (req, res) => {
  const warehousePath = path.join(__dirname, 'warehouses.json');
  try {
    const data = JSON.parse(fs.readFileSync(warehousePath));
    res.json(data);
  } catch (err) {
    console.error("❌ Failed to read warehouses:", err);
    res.status(500).json({ error: "Unable to load warehouses" });
  }
});

app.post('/api/add-warehouse', verifyToken, (req, res) => {
  const { id, location } = req.body;
  const filePath = path.join(__dirname, 'warehouses.json');

  try {
    const warehouses = JSON.parse(fs.readFileSync(filePath));

    // Check for duplicates
    if (warehouses.some(w => w.id === id)) {
      return res.status(400).json({ success: false, error: "Warehouse ID already exists." });
    }

    const newWarehouse = { id, location };
    warehouses.push(newWarehouse);

    fs.writeFileSync(filePath, JSON.stringify(warehouses, null, 2));
    logActivity({
      username: req.user?.username || 'unknown',
      action: 'Add Warehouse',
      warehouseId: id,
      location
    });

    res.json({ success: true, added: newWarehouse });
  } catch (err) {
    console.error("❌ Failed to add warehouse:", err);
    res.status(500).json({ success: false, error: "Failed to add warehouse." });
  }
});
  app.post('/api/activity-log', verifyToken, (req, res) => {
    const { username, action, filters } = req.body;

    logActivity({
      username: username || 'unknown',
      action: action || 'unknown',
      filtersUsed: filters || {}
    });

    res.json({ success: true });
  });

  app.post('/api/log-export', verifyToken, (req, res) => {
  const logPath = path.join(__dirname, 'activity-log.json');

  const logEntry = {
    username: req.user?.username || 'unknown',
    action: 'export_csv',
    timestamp: new Date().toISOString()
    
  };

  try {
    let logs = [];
    if (fs.existsSync(logPath)) {
      logs = JSON.parse(fs.readFileSync(logPath));
    }
    logs.push(logEntry);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error logging CSV export:', err.stack || err);
    res.status(500).json({ success: false, error: 'Failed to log export.' });
  }
});
app.post('/api/transfer-stock', verifyToken, (req, res) => {
  const { productId, fromWarehouseId, toWarehouseId, quantity } = req.body;
  const filePath = path.join(__dirname, 'inventory.json');
  const warehousePath = path.join(__dirname, 'warehouses.json');
  const today = new Date().toISOString().split('T')[0];
  const username = req.user.username;

  try {
    let data = JSON.parse(fs.readFileSync(filePath));
    const warehouses = JSON.parse(fs.readFileSync(warehousePath));
    const toWarehouseLocation = warehouses.find(w => w.id === toWarehouseId)?.location || 'Unknown';

    const fromIndex = data.findIndex(
      item => item.productId === productId && item.warehouseId === fromWarehouseId
    );

    const toIndex = data.findIndex(
      item => item.productId === productId && item.warehouseId === toWarehouseId
    );

    if (fromIndex === -1) {
      return res.status(400).json({ error: 'Source product not found' });
    }

    if (data[fromIndex].currentStock < quantity) {
      return res.status(400).json({ error: 'Insufficient stock in source' });
    }

    // Deduct from source
    data[fromIndex].currentStock -= quantity;
    data[fromIndex].history = (data[fromIndex].history || []).filter(h => h.date !== today);
    data[fromIndex].history.push({ date: today, stock: data[fromIndex].currentStock });

    // Limit to 7 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    data[fromIndex].history = data[fromIndex].history.filter(h => new Date(h.date) >= cutoff);

    // Add to destination
    if (toIndex === -1) {
      const newProduct = {
        ...data[fromIndex],
        warehouseId: toWarehouseId,
        warehouseLocation: toWarehouseLocation,
        currentStock: quantity,
        history: [{ date: today, stock: quantity }],
      };
      data.push(newProduct);
    } else {
      data[toIndex].currentStock += quantity;
      data[toIndex].history = (data[toIndex].history || []).filter(h => h.date !== today);
      data[toIndex].history.push({ date: today, stock: data[toIndex].currentStock });
      data[toIndex].history = data[toIndex].history.filter(h => new Date(h.date) >= cutoff);
    }

    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

    // ✅ Log activity
    const logPath = path.join(__dirname, 'activity-log.json');
    const logs = fs.existsSync(logPath)
      ? JSON.parse(fs.readFileSync(logPath))
      : [];

    logs.push({
      username,
      action: 'Transfer Stock',
      productId,
      fromWarehouseId,
      toWarehouseId,
      quantity,
      timestamp: new Date().toISOString()
    });

    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Transfer failed:', err);
    res.status(500).json({ error: 'Failed to transfer stock.' });
  }
});




  app.get('/api/activity-log',verifyToken, (req, res) => {
  const logPath = path.join(__dirname, 'activity-log.json');
  try {
    const logs = JSON.parse(fs.readFileSync(logPath));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load logs' });
  }
});
app.delete('/api/delete-product', verifyToken, (req, res) => {
  const { productId, warehouseId } = req.body;
  const filePath = path.join(__dirname, 'inventory.json');
  

  try {
    const data = JSON.parse(fs.readFileSync(filePath));

    const updated = data.filter(
      item => !(item.productId === productId && item.warehouseId === warehouseId)
    );

    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    logActivity({
      username: req.user?.username || 'unknown',
      action: 'Delete Product',
      productId,
      warehouseId
    });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Failed to delete product:', err);
    res.status(500).json({ success: false, error: 'Error deleting product.' });
  }
});
cron.schedule('0 0 * * *', () => {
  const filePath = path.join(__dirname, 'inventory.json');
  const today = new Date().toLocaleDateString('en-CA');

  try {
    const data = JSON.parse(fs.readFileSync(filePath));

    const updated = data.map(item => {
      let history = Array.isArray(item.history) ? [...item.history] : [];

      const hasToday = history.some(h => h.date === today);
      if (!hasToday) {
        const lastStock = history.length > 0
          ? history[history.length - 1].stock
          : item.currentStock;

        history.push({ date: today, stock: lastStock });

        // Keep last 7 days
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 7);
        history = history.filter(h => new Date(h.date) >= cutoff);
      }

      return { ...item, history };
    });

    fs.writeFileSync(filePath, JSON.stringify(updated, null, 2));
    console.log('✅ Daily history auto-update completed.');
  } catch (err) {
    console.error('❌ Error in daily history update:', err);
  }
});
const runDailyBackup = () => {
  const today = new Date().toISOString().split('T')[0];

  const inventorySrc = path.join(__dirname, 'inventory.json');
  const warehouseSrc = path.join(__dirname, 'warehouses.json');

  const backupDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir);
  }

  const inventoryDest = path.join(backupDir, `inventory-${today}.json`);
  const warehouseDest = path.join(backupDir, `warehouses-${today}.json`);

  try {
    // ✅ Copy files for backup
    fs.copyFileSync(inventorySrc, inventoryDest);
    fs.copyFileSync(warehouseSrc, warehouseDest);
    console.log(`✅ Backup completed for ${today}`);

    // 🧹 Cleanup: Delete backups older than 7 days
    const files = fs.readdirSync(backupDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7);

    files.forEach(file => {
      const match = file.match(/(\d{4}-\d{2}-\d{2})/);
      if (match) {
        const fileDate = new Date(match[1]);
        if (fileDate < cutoffDate) {
          const fullPath = path.join(backupDir, file);
          fs.unlinkSync(fullPath);
          console.log(`🗑 Deleted old backup: ${file}`);
        }
      }
    });
  } catch (err) {
    console.error('❌ Backup failed:', err.message);
  }
};
cron.schedule('0 0 * * *', runDailyBackup);






const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${PORT}`);
});

