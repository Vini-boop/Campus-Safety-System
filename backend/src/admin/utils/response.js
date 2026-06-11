import { StatusCodes } from 'http-status-codes';

export const success = (res, data, statusCode = StatusCodes.OK) => {
    res.status(statusCode).json({
        success: true,
        data
    });
};

export const error = (res, message, statusCode = StatusCodes.INTERNAL_SERVER_ERROR, error = null) => {
    res.status(statusCode).json({
        success: false,
        message,
        error: process.env.NODE_ENV === 'development' ? error : undefined
    });
};