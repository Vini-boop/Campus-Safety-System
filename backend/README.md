# Campus Safety System - Admin Backend

A secure and scalable backend for the Campus Safety System, built with Node.js, Express, and Firebase.

## Features

- User authentication and authorization with Firebase Auth
- Role-based access control
- RESTful API for managing alerts, users, weather advisories, and more
- Input validation and error handling
- Logging and monitoring
- Environment-based configuration

## Prerequisites

- Node.js 18+
- npm or yarn
- Firebase project with Firestore and Authentication enabled
- Firebase Admin SDK service account key

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the backend directory with the following variables:
   ```env
   PORT=5000
   NODE_ENV=development
   ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
   
   # Firebase Configuration
   # Option 1: Path to service account JSON file
   GOOGLE_APPLICATION_CREDENTIALS=./path/to/serviceAccountKey.json
   
   # Option 2: Service account JSON as string (alternative)
   # FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
   
   FIREBASE_DATABASE_URL=https://your-project-id.firebaseio.com
   
   # Collection names (optional, defaults provided)
   USERS_COLLECTION=users
   ALERTS_COLLECTION=alerts
   WEATHER_COLLECTION=weather_advisories
   MOVEMENTS_COLLECTION=movements
   NOTIFICATIONS_COLLECTION=notifications
   ```

4. Get Firebase Admin SDK credentials:
   - Go to Firebase Console → Project Settings → Service Accounts
   - Click "Generate New Private Key"
   - Save the JSON file securely
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to the path of this file

5. Start the development server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Authentication
- `POST /admin/auth/verify` - Verify Firebase ID token
- `GET /admin/auth/me` - Get current admin user (requires auth)

### Alerts
- `GET /admin/alerts` - Get all alerts (with pagination and filters)
- `GET /admin/alerts/:id` - Get a single alert
- `POST /admin/alerts` - Create a new alert
- `PUT /admin/alerts/:id` - Update an alert
- `DELETE /admin/alerts/:id` - Delete an alert

### Statistics
- `GET /admin/stats` - Get dashboard statistics

### Users
- `GET /admin/users` - Get all users
- `GET /admin/users/:id` - Get a single user

### Weather Advisories
- `GET /admin/weather` - Get weather advisories
- `POST /admin/weather` - Create a weather advisory
- `DELETE /admin/weather/:id` - Delete a weather advisory

### Notifications
- `GET /admin/notifications` - Get notifications
- `POST /admin/notifications` - Create a notification
- `PUT /admin/notifications/:id/read` - Mark notification as read

### Movements
- `GET /admin/movements` - Get movement patterns
- `GET /admin/movements/stats` - Get movement statistics

## Authentication

All protected routes require a Bearer token in the Authorization header:
```
Authorization: Bearer <firebase-id-token>
```

Users must have the `admin` role in Firestore to access admin routes.

## Error Handling

The API returns errors in the following format:
```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error (development only)"
}
```

Success responses:
```json
{
  "success": true,
  "data": { ... }
}
```

## Development

- The server uses ES6 modules
- Hot reload is enabled with `node --watch`
- CORS is configured for development origins
- Error stack traces are shown in development mode

## Production

- Set `NODE_ENV=production`
- Configure proper `ALLOWED_ORIGINS`
- Use environment variables for all sensitive data
- Ensure Firebase credentials are securely stored
