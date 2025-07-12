
# 📦 WareGrid

**WareGrid** is a full-stack inventory management and analytics dashboard that helps monitor product stock across multiple warehouses, visualize stock trends, and receive alerts for low or fast-dropping stock.

## 🚀 Features

- ✅ Login system with JWT Authentication (Admin & User roles)
- 📦 Product and Warehouse CRUD (Add, Delete, Edit Stock)
- 📈 Charts: Inventory Bar Graph, Daily Trends Line Graph, Forecast
- 🧠 Trend Alerts for rapidly depleting products
- 🧮 Warehouse Utilization Pie Chart with summaries
- 🧾 Activity Logs with filters (Admin only)
- 🔁 Stock Transfer between Warehouses
- 📤 Bulk Upload via CSV (Products for all, Warehouses for Admin)
- 📲 Responsive Design (Mobile Friendly)
- ☁️ Daily Auto Backup & Auto Stock History Update
- 🔐 Protected routes for admins/users
- 🌐 Deployed using Render (backend) & Vercel (frontend)

---

## 🛠 Tech Stack

**Frontend:**
- React.js, Tailwind CSS
- Chart.js for graphs
- Axios for API requests

**Backend:**
- Node.js, Express.js
- JSON files for storage (Inventory, Warehouses, Logs, Users)
- JWT for Authentication
- Multer + CSV Parser for uploads
- Node-cron for automation

---

## 🔐 Admin Credentials

> 🧑‍💼 **Username:** `admin`  
> 🔐 **Password:** `admin123` *(default)*

## 🔐 Viewer Credentials

> 🧑‍💼 **Username:** `viewer`  
> 🔐 **Password:** `viewer123` 

---

## 🗂 Folder Structure

### Frontend (React)
```
src/
├── assets/
├── components/
│   ├── InventoryTable.js
│   ├── InventoryChart.js
│   ├── DailyTrendChart.js
│   ├── WarehouseUtilizationChart.js
│   ├── TrendAlerts.js
│   ├── ActivityLog.js
│   ├── TransferStockForm.js
│   └── BulkUploadProduct.js / AddNewProductForm.js / AddWarehouseForm.js
├── pages/
│   ├── Login.js
│   ├── Dashboard.js
│   └── InventoryPage.js
├── utils/
│   └── auth.js
```

### Backend (Node.js)
```
inventory-heatmap-backend/
├── index.js
├── inventory.json
├── warehouses.json
├── activity-log.json
├── users.json
├── backups/
├── uploads/
├── utils/
│   └── logger.js
```

---

## ☁️ Deployment Instructions

### Backend (Render):
- Set build command to: `npm install`
- Start command: `node index.js`
- Add Environment Variables:
  - `PORT = 10000` *(or leave blank)*
  - `SECRET_KEY = your_secret_key`

### Frontend (Vercel):
- Set Environment Variable:  
  - `REACT_APP_API_BASE = https://your-backend.onrender.com`
- Output directory: `build`
- Build command: `npm run build`

---

## 🔮 Future Enhancements

- Switch to MongoDB for persistent database
- Add user management panel
- Role-based access control
- Product expiry tracking
- Email alerts for stock thresholds
- Export charts as PDF

---

## 📩 Contact
For queries or contributions, feel free to reach out via GitHub or email.
