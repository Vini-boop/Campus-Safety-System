import { verifyIdToken, db, COLLECTIONS } from '../services/firebaseAdmin.js';
import { createLog } from '../services/firebaseAdmin.js';
import { verifyToken } from '../utils/authUtils.js';

/**
 * General admin authentication middleware
 * Verifies Firebase JWT and checks if user is an admin (any role)
 */
export const adminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided. Authorization header required.',
            });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const user = await verifyIdToken(idToken);

        // Check if user has an admin role
        const allowedRoles = ['superadmin', 'security', 'medical'];
        if (!allowedRoles.includes(user.role)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin role required.',
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token.',
        });
    }
};

/**
 * Enhanced admin authentication middleware with additional security checks
 * Verifies token and performs additional validation
 */
export const enhancedAdminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided. Authorization header required.',
            });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const user = await verifyIdToken(idToken);

        // Check if user has an admin role
        const allowedRoles = ['superadmin', 'security', 'medical'];
        if (!allowedRoles.includes(user.role)) {
            // Log unauthorized access attempt
            await createLog(user.uid, user.role, 'unauthorized_access_attempt', {
                endpoint: req.path,
                method: req.method,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
            });

            return res.status(403).json({
                success: false,
                error: 'Access denied. Admin role required.',
            });
        }

        // Additional security checks
        // Check if user is active
        const userDoc = await db.collection(COLLECTIONS.USERS).doc(user.uid).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            if (userData.status === 'INACTIVE' || userData.disabled === true) {
                return res.status(403).json({
                    success: false,
                    error: 'Account is deactivated.',
                });
            }
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Enhanced admin auth error:', error);
        
        // Log authentication failure
        try {
            await createLog('unknown', 'unknown', 'auth_failed', {
                endpoint: req.path,
                method: req.method,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                error: error.message,
            });
        } catch (logError) {
            console.error('Failed to log auth failure:', logError);
        }

        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token.',
        });
    }
};

/**
 * Super Admin only middleware
 */
export const superAdminAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided.',
            });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const user = await verifyIdToken(idToken);

        if (user.role !== 'superadmin') {
            // Log unauthorized access attempt
            await createLog(user.uid, user.role, 'unauthorized_access_attempt', {
                endpoint: req.path,
                method: req.method,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
            });

            return res.status(403).json({
                success: false,
                error: 'Access denied. Super Admin role required.',
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Super admin auth error:', error);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token.',
        });
    }
};

/**
 * Security Admin only middleware
 */
export const securityAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided.',
            });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const user = await verifyIdToken(idToken);

        if (user.role !== 'security' && user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Security Admin role required.',
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Security auth error:', error);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token.',
        });
    }
};

/**
 * Medical Admin only middleware
 */
export const medicalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'No token provided.',
            });
        }

        const idToken = authHeader.split('Bearer ')[1];
        const user = await verifyIdToken(idToken);

        if (user.role !== 'medical' && user.role !== 'superadmin') {
            return res.status(403).json({
                success: false,
                error: 'Access denied. Medical Admin role required.',
            });
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Medical auth error:', error);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token.',
        });
    }
};

/**
 * JWT-based authentication middleware (for refresh token scenarios)
 */
export const jwtAuth = (secret, options = {}) => {
    return async (req, res, next) => {
        try {
            const authHeader = req.headers.authorization;
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    success: false,
                    error: 'No token provided. Authorization header required.',
                });
            }

            const token = authHeader.split('Bearer ')[1];
            const decoded = verifyToken(token, secret);

            req.user = decoded;
            next();
        } catch (error) {
            console.error('JWT auth error:', error);
            return res.status(401).json({
                success: false,
                error: 'Invalid or expired token.',
            });
        }
    };
};