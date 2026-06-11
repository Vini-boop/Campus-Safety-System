import rateLimit from 'express-rate-limit';
import { createLog } from '../services/firebaseAdmin.js';

/**
 * Rate limiter for authentication endpoints
 * Prevents brute force attacks on login and registration
 */
export const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: {
        success: false,
        error: 'Too many authentication attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res, next, options) => {
        console.log(`Rate limit hit for IP: ${req.ip} on endpoint: ${req.originalUrl}`);
        
        // Log the rate limit event
        try {
            await createLog(
                req.user?.uid || 'unknown', 
                req.user?.role || 'unknown', 
                'rate_limit_exceeded', 
                {
                    ip: req.ip,
                    endpoint: req.originalUrl,
                    userAgent: req.get('User-Agent'),
                    timestamp: new Date().toISOString(),
                }
            );
        } catch (logError) {
            console.error('Failed to log rate limit event:', logError);
        }
        
        res.status(options.statusCode).send(options.message);
    },
});

/**
 * Specific rate limiter for login attempts
 * More restrictive than general auth rate limiter
 */
export const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // Limit each IP to 3 login attempts per windowMs
    message: {
        success: false,
        error: 'Too many login attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful logins toward limit
    handler: async (req, res, next, options) => {
        console.log(`Login rate limit hit for IP: ${req.ip}`);
        
        // Log the rate limit event
        try {
            await createLog(
                'unknown', 
                'unknown', 
                'login_rate_limit_exceeded', 
                {
                    ip: req.ip,
                    email: req.body?.email || 'unknown',
                    userAgent: req.get('User-Agent'),
                    timestamp: new Date().toISOString(),
                }
            );
        } catch (logError) {
            console.error('Failed to log login rate limit event:', logError);
        }
        
        res.status(options.statusCode).send(options.message);
    },
});

/**
 * Rate limiter for registration attempts
 */
export const registerRateLimit = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 2, // Limit each IP to 2 registration attempts per hour
    message: {
        success: false,
        error: 'Too many registration attempts from this IP, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res, next, options) => {
        console.log(`Registration rate limit hit for IP: ${req.ip}`);
        
        // Log the rate limit event
        try {
            await createLog(
                'unknown', 
                'unknown', 
                'registration_rate_limit_exceeded', 
                {
                    ip: req.ip,
                    email: req.body?.email || 'unknown',
                    userAgent: req.get('User-Agent'),
                    timestamp: new Date().toISOString(),
                }
            );
        } catch (logError) {
            console.error('Failed to log registration rate limit event:', logError);
        }
        
        res.status(options.statusCode).send(options.message);
    },
});

/**
 * General API rate limiter for authenticated users
 */
export const apiRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs for authenticated users
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    handler: async (req, res, next, options) => {
        console.log(`API rate limit hit for IP: ${req.ip}, user: ${req.user?.email}`);
        
        // Log the rate limit event
        try {
            await createLog(
                req.user?.uid || 'unknown', 
                req.user?.role || 'unknown', 
                'api_rate_limit_exceeded', 
                {
                    ip: req.ip,
                    user: req.user?.email || 'unknown',
                    endpoint: req.originalUrl,
                    userAgent: req.get('User-Agent'),
                    timestamp: new Date().toISOString(),
                }
            );
        } catch (logError) {
            console.error('Failed to log API rate limit event:', logError);
        }
        
        res.status(options.statusCode).send({
            success: false,
            error: 'Too many requests, please slow down.',
        });
    },
});

/**
 * Rate limiter for password reset attempts
 */
export const passwordResetRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // Limit each IP to 3 password reset attempts per windowMs
    message: {
        success: false,
        error: 'Too many password reset attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: async (req, res, next, options) => {
        console.log(`Password reset rate limit hit for IP: ${req.ip}`);
        
        // Log the rate limit event
        try {
            await createLog(
                'unknown', 
                'unknown', 
                'password_reset_rate_limit_exceeded', 
                {
                    ip: req.ip,
                    email: req.body?.email || 'unknown',
                    userAgent: req.get('User-Agent'),
                    timestamp: new Date().toISOString(),
                }
            );
        } catch (logError) {
            console.error('Failed to log password reset rate limit event:', logError);
        }
        
        res.status(options.statusCode).send(options.message);
    },
});

/**
 * Rate limiter for Google authentication attempts
 */
export const googleAuthRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 Google auth attempts per windowMs
    message: {
        success: false,
        error: 'Too many Google authentication attempts, please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // Don't count successful Google auth toward limit
    handler: async (req, res, next, options) => {
        console.log(`Google auth rate limit hit for IP: ${req.ip}`);
        
        // Log the rate limit event
        try {
            await createLog(
                'unknown', 
                'unknown', 
                'google_auth_rate_limit_exceeded', 
                {
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    timestamp: new Date().toISOString(),
                }
            );
        } catch (logError) {
            console.error('Failed to log Google auth rate limit event:', logError);
        }
        
        res.status(options.statusCode).send(options.message);
    },
});