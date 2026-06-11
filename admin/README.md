# Campus Safety Admin Dashboard

A modern React admin dashboard for managing the Campus Safety System.

## Features

- Real-time dashboard with statistics
- Alert management
- User management
- Risk zone monitoring
- Security team tracking
- Camera feed monitoring
- Dark mode support
- Responsive design

## Prerequisites

- Node.js 18+
- npm or yarn
- Backend API running (see backend README)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the admin directory:
   ```env
   VITE_API_BASE_URL=http://localhost:5000
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) in your browser

## Authentication

The admin dashboard uses Firebase Authentication. To log in:

1. You need a Firebase ID token from your Firebase project
2. The token is stored in localStorage after successful authentication
3. All API requests include the token in the Authorization header

## Project Structure

```
admin/
├── src/
│   ├── components/     # Reusable UI components
│   ├── context/        # React contexts (Auth, Theme)
│   ├── layouts/        # Layout components (Navbar, Sidebar)
│   ├── pages/          # Page components
│   ├── services/       # API service layer
│   └── App.jsx         # Main app component
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Technologies

- React 19
- React Router 7
- Tailwind CSS
- Recharts (for charts)
- Lucide React (icons)
- Vite (build tool)

## Environment Variables

- `VITE_API_BASE_URL` - Backend API base URL (default: http://localhost:5000)
