# Subscription Tracker - Frontend

A modern React frontend for the Subscription Tracker application.

## Features

- 🔐 User Authentication (Email/Password & Google OAuth)
- 📧 Process Gmail emails to extract subscriptions
- 📊 Dashboard with subscription statistics
- 📋 Subscription list with filtering
- 💰 Monthly spending overview
- 🎨 Modern UI with Tailwind CSS

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool
- **React Router** - Routing
- **Axios** - HTTP client
- **Tailwind CSS** - Styling

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Environment Variables

Create a `.env` file in the Frontend directory (optional):

```env
VITE_API_URL=http://localhost:3000/api
```

## Project Structure

```
Frontend/
├── src/
│   ├── components/      # React components
│   │   ├── Login.jsx
│   │   ├── Register.jsx
│   │   ├── Dashboard.jsx
│   │   ├── SubscriptionList.jsx
│   │   └── ProtectedRoute.jsx
│   ├── contexts/        # React contexts
│   │   └── AuthContext.jsx
│   ├── services/         # API services
│   │   └── api.js
│   ├── App.jsx          # Main app component
│   └── main.jsx         # Entry point
├── package.json
└── vite.config.js
```

## API Endpoints Used

- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `GET /api/auth/google` - Google OAuth login
- `POST /api/subscriptions/process-emails` - Process Gmail emails
- `GET /api/subscriptions` - Get all subscriptions

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

