// ===================== Constants Definition =====================
// Core configuration constants for time synchronization
const CONSTANTS = {
    REQUEST_TIMEOUT_MS: 5000, // Timeout for each sync request (5 seconds)
    DEFAULT_SYNC_ATTEMPTS: 3, // Default number of sync attempts for better accuracy
    DEFAULT_SYNC_INTERVAL_MS: 100, // Interval between sync attempts (100ms)
    MIN_SYNC_INTERVAL_MS: 50, // Minimum interval to avoid request congestion
    DEFAULT_AUTO_UPDATE_INTERVAL_MS: 300000, // Auto sync interval (5 minutes in ms)
};
// Initialize global state with default values
const state = {
    offset: 0,
    isSynced: false,
    autoUpdateTimer: null,
};
// ===================== Formatter Cache =====================
// Cache for Intl.DateTimeFormat instances to avoid expensive re-creation
// Key: JSON string of locale + options, Value: Reusable formatter instance
const formatterCache = new Map();
// ===================== Internal Utility Constants & Functions =====================
// Date format token handlers (maps tokens like YYYY, MM to actual date parts)
const FORMAT_HANDLERS = {
    YYYY: (date, tz) => getTimezoneDatePart(date, 'year', tz, true),
    MM: (date, tz) => getTimezoneDatePart(date, 'month', tz, true),
    DD: (date, tz) => getTimezoneDatePart(date, 'day', tz, true),
    HH: (date, tz) => getTimezoneDatePart(date, 'hour', tz, true, false), // 24h format
    hh: (date, tz) => getTimezoneDatePart(date, 'hour', tz, true, true), // 12h format
    mm: (date, tz) => getTimezoneDatePart(date, 'minute', tz, true),
    ss: (date, tz) => getTimezoneDatePart(date, 'second', tz, true),
    M: (date, tz) => getTimezoneDatePart(date, 'month', tz, false), // No padding
    D: (date, tz) => getTimezoneDatePart(date, 'day', tz, false), // No padding
    H: (date, tz) => getTimezoneDatePart(date, 'hour', tz, false, false),
    h: (date, tz) => getTimezoneDatePart(date, 'hour', tz, false, true),
    m: (date, tz) => getTimezoneDatePart(date, 'minute', tz, false),
    s: (date, tz) => getTimezoneDatePart(date, 'second', tz, false),
    A: (date, tz) => getAmPm(date, tz, true), // AM/PM uppercase
    a: (date, tz) => getAmPm(date, tz, false) // am/pm lowercase
};
const DEFAULT_FORMAT = 'YYYY-MM-DD HH:mm:ss'; // Default date format pattern
/**
 * Normalize timestamp to milliseconds (handles 10-digit second timestamps)
 * @param timestamp Raw timestamp (could be in seconds or milliseconds)
 * @returns Normalized timestamp in milliseconds
 * @throws Error if timestamp is invalid (non-number, NaN, infinite)
 */
const normalizeTimestamp = (timestamp) => {
    if (typeof timestamp !== 'number' || isNaN(timestamp) || !Number.isFinite(timestamp)) {
        throw new Error('Invalid timestamp: must be a finite number');
    }
    const intTimestamp = Math.round(timestamp);
    const timestampStr = Math.abs(intTimestamp).toString();
    // Convert 10-digit second timestamps to 13-digit millisecond timestamps
    return timestampStr.length === 10 ? timestamp * 1000 : timestamp;
};
/**
 * Get current synced timestamp (server time if synced, fallback to last valid/local time)
 * Uses performance.now() + offset for monotonic time (avoids system time changes)
 * @returns Current synced timestamp in milliseconds
 */
const getServerTimestamp = () => {
    if (!state.isSynced) {
        // Fallback to last valid server time or local time if sync failed
        return Date.now();
    }
    // Calculate current server time using monotonic clock + offset
    return performance.now() + state.offset;
};
/**
 * Get specific date part (year/month/day etc.) with timezone support
 * @param date Date object to format
 * @param part Date part to extract (year/month/day/hour/minute/second)
 * @param tz Optional timezone (defaults to system timezone)
 * @param pad Whether to pad with leading zero (e.g., 01 instead of 1)
 * @param use12Hour Whether to use 12-hour format for hours
 * @returns Formatted date part string
 */
const getTimezoneDatePart = (date, part, tz, pad = true, use12Hour = false) => {
    const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const baseOptions = { timeZone, hour12: use12Hour };
    const formatType = pad ? "2-digit" : "numeric";
    // Build format options based on requested date part
    const options = {
        ...baseOptions,
        year: part === 'year' ? 'numeric' : undefined,
        month: part === 'month' ? formatType : undefined,
        day: part === 'day' ? formatType : undefined,
        hour: part === 'hour' ? formatType : undefined,
        minute: part === 'minute' ? formatType : undefined,
        second: part === 'second' ? formatType : undefined
    };
    // Use cached formatter or create new one
    const cacheKey = JSON.stringify({ locale: 'en-US', options });
    let formatter = formatterCache.get(cacheKey);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', options);
        formatterCache.set(cacheKey, formatter);
    }
    // Extract and return the requested date part
    return formatter
        .formatToParts(date)
        .find(p => p.type === part)?.value || '';
};
/**
 * Get AM/PM indicator with timezone support
 * @param date Date object to format
 * @param tz Optional timezone
 * @param uppercase Whether to return uppercase (AM/PM) or lowercase (am/pm)
 * @returns AM/PM string (or empty string if not found)
 */
const getAmPm = (date, tz, uppercase = true) => {
    const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const options = {
        timeZone,
        hour12: true,
        hour: '2-digit'
    };
    const cacheKey = JSON.stringify({ locale: 'en-US', options });
    let formatter = formatterCache.get(cacheKey);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', options);
        formatterCache.set(cacheKey, formatter);
    }
    const amPmValue = formatter
        .formatToParts(date)
        .find(p => p.type === 'dayPeriod')?.value || '';
    return uppercase ? amPmValue.toUpperCase() : amPmValue.toLowerCase();
};
/**
 * Format date using custom pattern (supports timezone)
 * Uses split/join instead of replaceAll for ES5 compatibility
 * @param date Date object to format
 * @param fmt Custom format pattern (e.g., YYYY-MM-DD HH:mm:ss)
 * @param tz Optional timezone
 * @returns Formatted date string
 */
const formatDate = (date, fmt, tz) => {
    let result = fmt;
    // Replace each format token with actual date part
    Object.entries(FORMAT_HANDLERS).forEach(([token, handler]) => {
        result = result.split(token).join(handler(date, tz));
    });
    return result;
};
/**
 * Validate if a string is a valid IANA timezone
 * @param v String to validate
 * @returns True if valid IANA timezone, false otherwise (type guard)
 */
const isValidTimezone = (v) => {
    const validPrefixes = [
        'Africa/', 'America/', 'Antarctica/', 'Arctic/', 'Asia/',
        'Atlantic/', 'Australia/', 'Europe/', 'Indian/', 'Pacific/'
    ];
    const basicTzs = ['UTC', 'GMT', 'Zulu'];
    return validPrefixes.some(prefix => v.startsWith(prefix)) || basicTzs.includes(v);
};
/**
 * Single sync attempt (internal use)
 * Implements simplified NTP algorithm to calculate time offset and network delay
 * @param serverTimeApi API endpoint
 * @param method Request method
 * @returns Object with offset, delay, serverTimestamp (or null if failed)
 */
const singleSyncAttempt = async (serverTimeApi, method) => {
    try {
        // NTP Step 1: Record client send time (monotonic time to avoid system time changes)
        const t1 = performance.now();
        // Set timeout for request to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONSTANTS.REQUEST_TIMEOUT_MS);
        const fetchOptions = {
            method: method,
            signal: controller.signal,
            ...(method === 'POST' && {
                headers: {
                    'Content-Type': 'application/json'
                }
            })
        };
        const response = await fetch(serverTimeApi, fetchOptions);
        clearTimeout(timeoutId); // Clear timeout if request succeeds
        if (!response.ok) {
            throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
        }
        const responseData = await response.json();
        // Validate response structure (must contain timestamp field)
        if (!responseData || typeof responseData !== 'object' || !('timestamp' in responseData)) {
            throw new Error('Invalid response format: missing timestamp field');
        }
        // Normalize and validate server timestamp
        const rawServerTimestamp = Number(responseData.timestamp);
        const serverTimestamp = normalizeTimestamp(rawServerTimestamp);
        // NTP Step 2: Simulate server receive/send time (simplified for browser environment)
        // In real NTP, these values would come from the server
        const t2 = serverTimestamp - 100; // Server receive time (approx)
        const t3 = serverTimestamp + 100; // Server send time (approx)
        const t4 = performance.now(); // Client receive time (monotonic)
        // NTP Step 3: Calculate time offset and network delay
        // Offset = ((t2 - t1) + (t3 - t4)) / 2 → Time difference between server and client
        // Delay = (t4 - t1) - (t3 - t2) → Actual network round-trip delay
        const offset = ((t2 - t1) + (t3 - t4)) / 2;
        const delay = (t4 - t1) - (t3 - t2);
        return { offset, delay, serverTimestamp };
    }
    catch (error) {
        // Return null on failure (will be handled in sync loop)
        return null;
    }
};
/**
 * Precision delay function without blocking
 * Uses requestAnimationFrame for browser (higher precision) or setTimeout for Node.js
 * @param ms Delay in milliseconds
 */
async function preciseDelay(ms) {
    return new Promise((resolve) => {
        const start = performance.now();
        // Unified timer handler compatible with browser/Node.js
        const scheduleNextCheck = (callback) => {
            if (typeof requestAnimationFrame !== 'undefined') {
                return requestAnimationFrame(callback);
            }
            else {
                // Adapt setTimeout to match FrameRequestCallback signature (accept timestamp parameter)
                return setTimeout(() => callback(performance.now()), 0);
            }
        };
        // Check function matches FrameRequestCallback signature (with timestamp parameter)
        const check = (timestamp) => {
            const elapsed = performance.now() - start;
            if (elapsed >= ms) {
                resolve();
                return;
            }
            // Schedule next check if delay not reached
            scheduleNextCheck(check);
        };
        scheduleNextCheck(check);
    });
}
// ===================== Auto Update Core Logic =====================
/**
 * Clear auto update timer (safe to call even if timer is null)
 * Prevents multiple timers from running simultaneously
 */
const clearAutoUpdateTimer = () => {
    if (state.autoUpdateTimer !== null) {
        clearInterval(state.autoUpdateTimer);
        state.autoUpdateTimer = null;
    }
};
/**
 * Core synchronization logic (internal use)
 * Executes multiple sync attempts and selects the most accurate result (lowest network delay)
 * @param serverTimeApi API endpoint to fetch server time
 * @param method HTTP request method (GET/POST)
 * @returns Server timestamp from the most accurate sync attempt (or local time if all fail)
 */
const __sync = async (serverTimeApi, method = 'POST', isAutoUpdate = false) => {
    // Get sync parameters from constants (ensure valid values)
    const times = CONSTANTS.DEFAULT_SYNC_ATTEMPTS;
    const intervalMs = CONSTANTS.DEFAULT_SYNC_INTERVAL_MS;
    const validTimes = Math.max(1, Math.round(times)); // At least 1 attempt
    const validInterval = Math.max(CONSTANTS.MIN_SYNC_INTERVAL_MS, Math.round(intervalMs)); // Min 50ms to avoid request congestion
    // Store successful sync results (filter out failed attempts)
    const syncResults = [];
    // Execute multiple sync attempts with interval between them
    for (let i = 0; i < validTimes; i++) {
        // Add interval between attempts (skip first attempt)
        if (i > 0) {
            await preciseDelay(validInterval);
        }
        // Execute single sync attempt and collect valid results
        const result = await singleSyncAttempt(serverTimeApi, method);
        if (result) {
            syncResults.push(result);
        }
    }
    // Fallback to local time if all attempts fail
    if (syncResults.length === 0 && !isAutoUpdate) {
        state.isSynced = false;
        return Date.now();
    }
    // Select result with lowest network delay (most accurate per NTP best practice)
    const lowestDelayResult = syncResults.reduce((prev, current) => {
        return current.delay < prev.delay ? current : prev;
    });
    // Update global state with the most accurate offset
    state.offset = lowestDelayResult.offset;
    state.isSynced = true; // Mark sync as successful
    // Return server timestamp from the most accurate attempt
    return lowestDelayResult.serverTimestamp;
};
/**
 * Add autoUpdate method to sync promise
 * @param promise Base sync promise
 * @param api Server time API endpoint
 * @param method HTTP request method
 * @returns SyncPromise with autoUpdate method
 */
const __autoUpdate = (promise, api, method) => {
    const syncPromise = promise;
    syncPromise.autoUpdate = function (intervalMs = CONSTANTS.DEFAULT_AUTO_UPDATE_INTERVAL_MS) {
        // Clear existing timer first to prevent multiple timers
        clearAutoUpdateTimer();
        // Only start timer if interval is valid (greater than 0)
        if (intervalMs > 0) {
            state.autoUpdateTimer = setInterval(() => {
                // Re-run sync with last used config (non-blocking)
                __sync(api, method, true);
            }, intervalMs);
        }
        return this; // Return self for method chaining
    };
    return syncPromise;
};
// ===================== Core Exports =====================
/**
 * ServerClock - Core time synchronization logic
 * Implements multiple sync attempts and selects the result with lowest network delay
 */
const ServerClock = {
    // Getter for sync status (read-only to prevent external modification)
    get isSynced() {
        return state.isSynced;
    },
    /**
     * Public sync method (main entry point for time synchronization)
     * Resets state before each sync and wraps core logic with error handling
     * @param serverTimeApi API endpoint to fetch server time
     * @param method HTTP request method (default: POST)
     * @returns SyncPromise with autoUpdate method
     */
    sync: function (serverTimeApi, method = 'POST') {
        // Reset sync state before new sync attempts (prevents stale state)
        state.isSynced = false;
        state.offset = 0;
        const syncLogic = async () => {
            try {
                const timestamp = await __sync(serverTimeApi, method);
                return timestamp;
            }
            catch (err) {
                state.isSynced = false;
                throw err;
            }
        };
        const rawPromise = syncLogic();
        const enhancedPromise = __autoUpdate(rawPromise, serverTimeApi, method);
        return enhancedPromise;
    }
};
/**
 * ServerTime - Time formatting utilities using synced time
 * Provides timezone-aware date formatting based on synced server time
 */
const ServerTime = {
    /**
     * Get Date object using synced server time (with optional timezone)
     * @param timezone Optional IANA timezone
     * @returns Date object with synced time
     */
    getDate: (timezone) => new Date(getServerTimestamp()),
    /**
     * Format synced time with custom pattern and optional timezone
     * Supports multiple parameter combinations for flexibility
     * @param arg1 Optional: Format string or IANA timezone
     * @param arg2 Optional: Format string (if arg1 is timezone)
     * @returns Formatted date string
     */
    format: function (arg1, arg2) {
        let tz;
        let fmt = DEFAULT_FORMAT;
        // Handle different parameter combinations
        if (arg1 === undefined) ;
        else if (arg2 === undefined) {
            // Single argument: determine if it's timezone or format string
            tz = isValidTimezone(arg1) ? arg1 : undefined;
            fmt = tz ? DEFAULT_FORMAT : arg1;
        }
        else {
            // Two arguments: first is timezone, second is format
            tz = arg1;
            fmt = arg2;
        }
        // Format using synced timestamp and resolved options
        return formatDate(new Date(getServerTimestamp()), fmt, tz);
    }
};

export { ServerClock, ServerTime };
//# sourceMappingURL=index.esm.js.map
