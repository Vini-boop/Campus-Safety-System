import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { apiRateLimit } from './admin/middleware/rateLimiter.js';
import { errorHandler } from './admin/middleware/errorHandler.js';
import authRoutes from './admin/routes/authRoutes.js';
import userVerificationRoutes from './admin/routes/userVerificationRoutes.js';
import alertRoutes from './admin/routes/alertRoutes.js';
import userRoutes from './admin/routes/userRoutes.js';
import weatherRoutes from './admin/routes/weatherRoutes.js';
import movementRoutes from './admin/routes/movementRoutes.js';
import notificationRoutes from './admin/routes/notificationRoutes.js';
import statsRoutes from './admin/routes/statsRoutes.js';
import reportRoutes from './admin/routes/reportRoutes.js';
import emergencyRoutes from './admin/routes/emergencyRoutes.js';
import securityRoutes from './admin/routes/securityRoutes.js';
import medicalRoutes from './admin/routes/medicalRoutes.js';
import googleAuthRoutes from './admin/routes/googleAuthRoutes.js';

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [
        'http://localhost:8081', 
        'http://localhost:8082', 
        'http://localhost:8083', 
        'http://localhost:8084', 
        'http://localhost:5173',
        'http://10.32.221.203:8083',
        'exp://192.168.', // Expo Go on local network
        '*' // Allow all origins in development
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
app.use(helmet());
app.use(morgan('dev'));

// Apply rate limiting to all routes except health check and auth endpoints
app.use(apiRateLimit);

// Routes
// Public auth routes (registration, etc.)
app.use('/auth', authRoutes);
// Admin auth routes (login, verification, etc.)
app.use('/admin/auth', authRoutes);
// User verification routes
app.use('/admin/auth', userVerificationRoutes);
// Google auth routes
app.use('/admin/auth', googleAuthRoutes);
app.use('/admin/alerts', alertRoutes);
app.use('/admin/users', userRoutes);
app.use('/admin/weather', weatherRoutes);
app.use('/admin/movements', movementRoutes);
app.use('/admin/notifications', notificationRoutes);
app.use('/admin/stats', statsRoutes);
app.use('/admin/reports', reportRoutes);
app.use('/admin/emergency', emergencyRoutes);
app.use('/admin/security', securityRoutes);
app.use('/admin/medical', medicalRoutes);

// Health check endpoint (no rate limit)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Test endpoint to verify backend connectivity
app.get('/test', (req, res) => {
    console.log('✅ Test endpoint accessed');
    res.status(200).json({ 
        message: 'Backend is reachable',
        timestamp: new Date().toISOString(),
        env: process.env.NODE_ENV
    });
});

// Error handling
app.use(errorHandler);

export default app;