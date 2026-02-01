# Team Setup Instructions

## For Team Members to Get Started

### 1. Clone the Repository
```bash
git clone <REPOSITORY_URL>
cd "Phase -1 Web Application"
```

### 2. Backend Setup
```bash
cd backend
npm install
# Create .env file with your MongoDB connection string
# MONGODB_URI=your_mongodb_connection_string
# JWT_SECRET=your_secret_key
npm run dev
```

### 3. Frontend Setup (in a new terminal)
```bash
cd frontend
npm install
npm run dev
```

### 4. Working with Git

#### Before making changes:
```bash
git pull origin main
```

#### After making changes:
```bash
git add .
git commit -m "Description of your changes"
git push origin main
```

## Project Structure
- **backend/**: Node.js/Express server with MongoDB
- **frontend/**: React + Vite application
- **backend/src/routes/**: API endpoints
- **frontend/src/pages/**: React pages
- **frontend/src/components/**: Reusable React components

## Features
- Multi-robot warehouse management system
- Admin and Operator dashboards
- Task scheduling and robot coordination
- Real-time robot status monitoring
