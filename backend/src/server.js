import 'dotenv/config';
import app from './app.js';
import { cleanupExpiredTokens } from './admin/utils/authUtils.js';

const PORT = process.env.PORT || 5000;

const HOST = process.env.HOST || '0.0.0.0';
const server = app.listen(PORT, HOST, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    
    // Start periodic cleanup of expired refresh tokens (every hour)
    setInterval(async () => {
        try {
            console.log('Starting periodic cleanup of expired tokens...');
            await cleanupExpiredTokens();
        } catch (cleanupError) {
            console.error('Error during periodic token cleanup:', cleanupError);
        }
    }, 60 * 60 * 1000); // Every hour
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
    console.error('UNHANDLED REJECTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
    console.error(err.name, err.message);
    process.exit(1);
});