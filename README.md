# Cat Shop POS System

A complete Point of Sale (POS) and Inventory Management System built for a cat shop using modern web technologies. The system works entirely offline with local SQLite database storage.

## 🚀 Features

### Staff Dashboard (POS Terminal)
- **Sales Processing**: Add products to cart, process payments, and complete sales
- **Product Search**: Search by name, SKU, or barcode
- **Category Filtering**: Filter products by category
- **Multiple Payment Methods**: Cash, Card, Digital Wallet, Credit
- **Returns Processing**: Handle product returns with reason tracking
- **Receipt Generation**: Print receipts after successful sales
- **Real-time Stock Updates**: Automatic stock level updates after sales

### Admin Dashboard
- **Inventory Management**: Add, edit, and manage products
- **Category Management**: Organize products into categories
- **Stock Monitoring**: Track stock levels and low stock alerts
- **Sales Analytics**: View sales reports and performance metrics
- **Dashboard Metrics**: Key performance indicators and business insights
- **Reports & Charts**: Visual analytics with Recharts

### Database & Storage
- **SQLite Database**: Local, offline-first storage
- **Prisma ORM**: Type-safe database operations
- **Automatic Migrations**: Database schema management
- **Seed Data**: Pre-populated with cat shop products

## 🛠 Technology Stack

- **Frontend**: Next.js 14+ (App Router), React 19+, TypeScript
- **UI Library**: Tailwind CSS + shadcn/ui components
- **Database**: SQLite with Prisma ORM
- **Charts**: Recharts for analytics
- **Icons**: Lucide React
- **Validation**: Zod schemas

## 📦 Installation & Setup

1. **Clone and Install Dependencies**
   ```bash
   cd pos
   npm install --legacy-peer-deps
   ```

2. **Database Setup**
   ```bash
   # Generate Prisma client
   npx prisma generate
   
   # Run database migrations
   npx prisma migrate dev
   
   # Seed the database with sample data
   npm run db:seed
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Access the Application**
   - Open http://localhost:3000
   - Choose between Staff Dashboard or Admin Dashboard

## 🏪 Sample Data

The system comes pre-loaded with cat shop products including:

### Categories
- Cat Food (Dry and wet food)
- Cat Toys (Interactive toys and play items)
- Cat Accessories (Collars, carriers, beds)
- Cat Health & Grooming (Brushes, vitamins, nail clippers)
- Litter & Hygiene (Litter boxes, litter, scoops)

### Products
- Premium Dry Cat Food - Chicken
- Grain-Free Wet Cat Food - Salmon
- Kitten Formula Dry Food
- Interactive Feather Wand
- Catnip Mice (Pack of 3)
- Automatic Laser Pointer
- Adjustable Cat Collar - Blue
- Plush Cat Bed - Large
- Cat Carrier - Hard Sided
- Cat Hairbrush - Self-Cleaning
- Cat Vitamins - Hairball Control
- Cat Nail Clippers
- Clumping Cat Litter - 20lb
- Cat Litter Box - Covered
- Litter Scoop - Stainless Steel

## 🔧 API Endpoints

### Products
- `GET /api/products` - List all products
- `POST /api/products` - Create new product
- `GET /api/products/[id]` - Get single product
- `PUT /api/products/[id]` - Update product
- `DELETE /api/products/[id]` - Delete product
- `GET /api/products/search?q=term` - Search products
- `GET /api/products/low-stock` - Get low stock products

### Sales
- `GET /api/sales` - List sales with pagination
- `POST /api/sales` - Create new sale
- `GET /api/sales/[id]` - Get sale details
- `DELETE /api/sales/[id]` - Cancel sale (refund)

### Inventory
- `GET /api/inventory` - Current stock levels
- `POST /api/inventory/adjustment` - Stock adjustment
- `GET /api/inventory/movements` - Stock movement history

### Categories
- `GET /api/categories` - List all categories
- `POST /api/categories` - Create new category
- `PUT /api/categories/[id]` - Update category
- `DELETE /api/categories/[id]` - Delete category

### Dashboard
- `GET /api/dashboard/metrics` - Key metrics and analytics

## 📊 Key Features

### Offline Operation
- Works completely offline with local SQLite database
- No internet connection required for daily operations
- Data persists locally on the device

### Stock Management
- Real-time stock tracking
- Low stock alerts
- Stock movement history
- Automatic stock updates on sales
- Manual stock adjustments

### Sales Processing
- Fast product lookup by SKU or barcode
- Shopping cart management
- Multiple payment methods
- Receipt generation
- Return processing

### Reporting & Analytics
- Sales performance metrics
- Product performance tracking
- Payment method analysis
- Daily sales trends
- Inventory valuation

## 🎯 Usage

### For Staff (POS Terminal)
1. Open Staff Dashboard
2. Search for products by name, SKU, or scan barcode
3. Add products to cart
4. Select payment method
5. Process sale
6. Print receipt

### For Admin (Management)
1. Open Admin Dashboard
2. View key metrics and alerts
3. Manage inventory in Inventory section
4. Add/edit products and categories
5. View reports and analytics
6. Monitor stock levels

## 🔄 Database Operations

### Backup
Simply copy the `pos.db` file to backup your data.

### Reset
Delete the `pos.db` file and run migrations again to reset the database.

### Seed Data
Run `npm run db:seed` to populate with sample cat shop data.

## 📝 Notes

- The system is designed for a single-location cat shop
- All data is stored locally in SQLite
- No user authentication is implemented (as requested)
- The system is optimized for offline operation
- All transactions are atomic with proper error handling

## 🚀 Future Enhancements

- User authentication and role management
- Multi-location support
- Advanced reporting features
- Barcode scanner integration
- Inventory alerts and notifications
- Export functionality for data analysis