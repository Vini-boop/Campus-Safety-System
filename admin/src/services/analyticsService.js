/**
 * Analytics Service
 * Data processing and analytics for dashboard reports
 */

import { format, subDays, startOfDay, endOfDay, differenceInMinutes } from 'date-fns';

/**
 * Group reports by date
 * @param {Array} reports - Array of report objects
 * @param {number} days - Number of days to include (default 30)
 * @returns {Array} Array of {date, count}
 */
export const groupReportsByDate = (reports, days = 30) => {
    const dateMap = {};
    const today = new Date();

    // Initialize all dates with 0 count
    for (let i = 0; i < days; i++) {
        const date = format(subDays(today, i), 'yyyy-MM-dd');
        dateMap[date] = 0;
    }

    // Count reports per date
    reports.forEach(report => {
        if (!report.createdAt) return;

        const createdDate = report.createdAt.toDate ? report.createdAt.toDate() : new Date(report.createdAt);
        const dateKey = format(createdDate, 'yyyy-MM-dd');

        if (dateKey in dateMap) {
            dateMap[dateKey]++;
        }
    });

    // Convert to array and sort by date
    return Object.entries(dateMap)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
};

/**
 * Calculate report type distribution
 * Categorizes reports into SOS and Reporting types
 * @param {Array} reports
 * @returns {Array} Array of {name, count, percentage}
 */
export const calculateTypeDistribution = (reports) => {
    const total = reports.length;

    if (total === 0) {
        return [
            { name: 'SOS', count: 0, percentage: 0 },
            { name: 'Reporting', count: 0, percentage: 0 }
        ];
    }

    // Count SOS incidents (emergency, sos types)
    const sosCount = reports.filter(report => {
        const type = (report.type || '').toLowerCase();
        return type.includes('sos') || type.includes('emergency');
    }).length;

    // Count Reporting incidents (all other types)
    const reportingCount = total - sosCount;

    return [
        {
            name: 'SOS',
            count: sosCount,
            percentage: ((sosCount / total) * 100).toFixed(1),
        },
        {
            name: 'Reporting',
            count: reportingCount,
            percentage: ((reportingCount / total) * 100).toFixed(1),
        }
    ].filter(item => item.count > 0); // Only show categories with data
};

/**
 * Calculate status distribution
 * @param {Array} reports
 * @returns {Object}
 */
export const calculateStatusDistribution = (reports) => {
    const statusMap = {
        pending: 0,
        responding: 0,
        resolved: 0,
    };

    reports.forEach(report => {
        const status = report.status || 'pending';
        if (status in statusMap) {
            statusMap[status]++;
        }
    });

    return statusMap;
};

/**
 * Calculate average response time
 * @param {Array} reports - Only resolved reports
 * @returns {string} Formatted time like "5:23"
 */
export const calculateAverageResponseTime = (reports) => {
    const resolvedReports = reports.filter(
        report => report.status === 'resolved' && report.resolvedAt && report.createdAt
    );

    if (resolvedReports.length === 0) {
        return '0:00';
    }

    let totalMinutes = 0;

    resolvedReports.forEach(report => {
        const created = report.createdAt.toDate ? report.createdAt.toDate() : new Date(report.createdAt);
        const resolved = report.resolvedAt.toDate ? report.resolvedAt.toDate() : new Date(report.resolvedAt);

        totalMinutes += differenceInMinutes(resolved, created);
    });

    const avgMinutes = Math.round(totalMinutes / resolvedReports.length);
    const hours = Math.floor(avgMinutes / 60);
    const minutes = avgMinutes % 60;

    if (hours > 0) {
        return `${hours}:${minutes.toString().padStart(2, '0')}`;
    }
    return `${minutes}:00`;
};

/**
 * Calculate trend percentage
 * @param {Array} reports
 * @param {number} days - Period to compare
 * @returns {Object} {percentage, isPositive}
 */
export const calculateTrend = (reports, days = 7) => {
    const now = new Date();
    const periodStart = startOfDay(subDays(now, days));
    const previousPeriodStart = startOfDay(subDays(now, days * 2));
    const previousPeriodEnd = endOfDay(subDays(now, days + 1));

    const currentPeriodCount = reports.filter(report => {
        if (!report.createdAt) return false;
        const date = report.createdAt.toDate ? report.createdAt.toDate() : new Date(report.createdAt);
        return date >= periodStart;
    }).length;

    const previousPeriodCount = reports.filter(report => {
        if (!report.createdAt) return false;
        const date = report.createdAt.toDate ? report.createdAt.toDate() : new Date(report.createdAt);
        return date >= previousPeriodStart && date <= previousPeriodEnd;
    }).length;

    if (previousPeriodCount === 0) {
        return { percentage: 0, isPositive: currentPeriodCount === 0 };
    }

    const percentage = (((currentPeriodCount - previousPeriodCount) / previousPeriodCount) * 100).toFixed(0);
    const isPositive = currentPeriodCount < previousPeriodCount; // Fewer reports is positive

    return { percentage: Math.abs(percentage), isPositive };
};

/**
 * Export data to CSV
 * @param {Array} reports
 * @returns {string} CSV content
 */
export const exportToCSV = (reports) => {
    const headers = ['ID', 'Type', 'Status', 'Reporter', 'Location', 'Description', 'Created At', 'Resolved At'];
    const rows = reports.map(report => [
        report.id || '',
        report.type || '',
        report.status || '',
        report.reporterName || '',
        report.location || '',
        (report.description || '').replace(/"/g, '""'), // Escape quotes
        report.createdAt ? format(report.createdAt.toDate ? report.createdAt.toDate() : new Date(report.createdAt), 'yyyy-MM-dd HH:mm:ss') : '',
        report.resolvedAt ? format(report.resolvedAt.toDate ? report.resolvedAt.toDate() : new Date(report.resolvedAt), 'yyyy-MM-dd HH:mm:ss') : '',
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
};

/**
 * Download CSV file
 * @param {string} csvContent
 * @param {string} filename
 */
export const downloadCSV = (csvContent, filename = 'reports.csv') => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};

export default {
    groupReportsByDate,
    calculateTypeDistribution,
    calculateStatusDistribution,
    calculateAverageResponseTime,
    calculateTrend,
    exportToCSV,
    downloadCSV,
};
