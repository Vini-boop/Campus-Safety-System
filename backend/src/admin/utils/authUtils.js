import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../services/firebaseAdmin.js';

/**
 * Hash a password using bcrypt
 * @param {string} password - Plain text password
 * @param {number} saltRounds - Number of salt rounds (default: 12)
 * @returns {Promise<string>} - Hashed password
 */
export const hashPassword = async (password, saltRounds = 12) => {
    try {
        const salt = await bcrypt.genSalt(saltRounds);
        return await bcrypt.hash(password, salt);
    } catch (error) {
        throw new Error(`Password hashing failed: ${error.message}`);
    }
};

/**
 * Compare plain text password with hashed password
 * @param {string} plainPassword - Plain text password
 * @param {string} hashedPassword - Hashed password
 * @returns {Promise<boolean>} - True if passwords match
 */
export const comparePassword = async (plainPassword, hashedPassword) => {
    try {
        return await bcrypt.compare(plainPassword, hashedPassword);
    } catch (error) {
        throw new Error(`Password comparison failed: ${error.message}`);
    }
};

/**
 * Generate JWT access token
 * @param {Object} payload - Data to include in the token
 * @param {string} secret - JWT secret
 * @param {string} expiresIn - Expiration time (e.g., '15m', '1h')
 * @returns {string} - Generated JWT token
 */
export const generateAccessToken = (payload, secret, expiresIn = '15m') => {
    return jwt.sign(payload, secret, { 
        expiresIn,
        issuer: 'campus-safety-api',
        audience: 'campus-safety-users'
    });
};

/**
 * Generate JWT refresh token
 * @param {Object} payload - Data to include in the token
 * @param {string} secret - JWT secret
 * @param {string} expiresIn - Expiration time (e.g., '7d', '30d')
 * @returns {string} - Generated JWT token
 */
export const generateRefreshToken = (payload, secret, expiresIn = '7d') => {
    return jwt.sign(payload, secret, { 
        expiresIn,
        issuer: 'campus-safety-api',
        audience: 'campus-safety-users',
        subject: 'refresh-token'
    });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @param {string} secret - JWT secret
 * @returns {Object} - Decoded token payload
 */
export const verifyToken = (token, secret) => {
    try {
        return jwt.verify(token, secret);
    } catch (error) {
        throw new Error(`Token verification failed: ${error.message}`);
    }
};

/**
 * Store refresh token in database for user
 * @param {string} userId - User ID
 * @param {string} refreshToken - Refresh token to store
 * @param {Date} expiryDate - Expiry date for the token
 */
export const storeRefreshToken = async (userId, refreshToken, expiryDate) => {
    try {
        // Store refresh token in a dedicated collection
        await db.collection('refresh_tokens').doc(refreshToken).set({
            userId,
            token: refreshToken,
            expiresAt: expiryDate,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        throw new Error(`Failed to store refresh token: ${error.message}`);
    }
};

/**
 * Validate if refresh token exists and is not expired
 * @param {string} refreshToken - Refresh token to validate
 * @returns {Object|null} - Token data if valid, null otherwise
 */
export const validateRefreshToken = async (refreshToken) => {
    try {
        const tokenDoc = await db.collection('refresh_tokens').doc(refreshToken).get();
        
        if (!tokenDoc.exists) {
            return null;
        }
        
        const tokenData = tokenDoc.data();
        const now = new Date();
        
        // Check if token is expired
        if (new Date(tokenData.expiresAt) <= now) {
            // Clean up expired token
            await db.collection('refresh_tokens').doc(refreshToken).delete();
            return null;
        }
        
        return tokenData;
    } catch (error) {
        throw new Error(`Failed to validate refresh token: ${error.message}`);
    }
};

/**
 * Revoke refresh token
 * @param {string} refreshToken - Refresh token to revoke
 */
export const revokeRefreshToken = async (refreshToken) => {
    try {
        await db.collection('refresh_tokens').doc(refreshToken).delete();
    } catch (error) {
        throw new Error(`Failed to revoke refresh token: ${error.message}`);
    }
};

/**
 * Clean up expired refresh tokens (should be run periodically)
 */
export const cleanupExpiredTokens = async () => {
    try {
        const now = new Date();
        const expiredTokensQuery = await db.collection('refresh_tokens')
            .where('expiresAt', '<=', now)
            .get();
            
        const batch = db.batch();
        expiredTokensQuery.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        if (!expiredTokensQuery.empty) {
            await batch.commit();
            console.log(`Cleaned up ${expiredTokensQuery.size} expired refresh tokens`);
        }
    } catch (error) {
        console.error('Failed to clean up expired tokens:', error);
    }
};