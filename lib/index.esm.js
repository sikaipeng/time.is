// Initialize sync state (offset = 0 means no time difference initially)
const state = {
    offset: 0,
    isSynced: false
};
// ===================== Internal Utility Constants & Functions =====================
/**
 * Date format handlers (immutable object)
 * Maps format tokens to timezone-aware date value getters
 */
const FORMAT_HANDLERS = {
    // Padded
    YYYY: (date, tz) => getTimezoneDatePart(date, 'year', tz, true),
    MM: (date, tz) => getTimezoneDatePart(date, 'month', tz, true),
    DD: (date, tz) => getTimezoneDatePart(date, 'day', tz, true),
    HH: (date, tz) => getTimezoneDatePart(date, 'hour', tz, true, false), // 24h padded
    hh: (date, tz) => getTimezoneDatePart(date, 'hour', tz, true, true), // 12h padded
    mm: (date, tz) => getTimezoneDatePart(date, 'minute', tz, true),
    ss: (date, tz) => getTimezoneDatePart(date, 'second', tz, true),
    // non-padded
    M: (date, tz) => getTimezoneDatePart(date, 'month', tz, false),
    D: (date, tz) => getTimezoneDatePart(date, 'day', tz, false),
    H: (date, tz) => getTimezoneDatePart(date, 'hour', tz, false, false), // 24h non-padded
    h: (date, tz) => getTimezoneDatePart(date, 'hour', tz, false, true), // 12h non-padded
    m: (date, tz) => getTimezoneDatePart(date, 'minute', tz, false),
    s: (date, tz) => getTimezoneDatePart(date, 'second', tz, false),
    // AM/PM
    A: (date, tz) => getAmPm(date, tz, true),
    a: (date, tz) => getAmPm(date, tz, false)
};
// Default date format string (used when no format is specified)
const DEFAULT_FORMAT = 'YYYY-MM-DD HH:mm:ss';
/**
 * Auto detect timestamp unit (seconds/milliseconds) and normalize to milliseconds
 * Core logic:
 * - 10 digits → Seconds (convert to ms by ×1000)
 * - 13 digits → Milliseconds (return directly)
 * @param timestamp Raw timestamp from server (seconds or milliseconds)
 * @returns Normalized timestamp in milliseconds
 */
const normalizeTimestamp = (timestamp) => {
    const intTimestamp = Math.round(timestamp);
    const timestampStr = Math.abs(intTimestamp).toString();
    const length = timestampStr.length;
    if (length === 10)
        return timestamp * 1000;
    return intTimestamp;
};
/**
 * Get current timestamp with sync fallback logic
 * Use performance.now() as monotonic time source, not affected by system time changes
 * @returns Server timestamp (UTC milliseconds) if synced, local timestamp if failed
 */
const getServerTimestamp = () => {
    // Return system time directly if not synced
    if (!state.isSynced)
        return Date.now();
    return performance.now() + state.offset;
};
/**
 * Get timezone-aware date part from UTC timestamp
 * @param date UTC-based Date object (required)
 * @param part Date part to retrieve (year/month/day/hour/minute/second)
 * @param tz Optional IANA timezone (system timezone if not provided)
 * @param pad Optional: Add leading zero (true = padded, false = non-padded)
 * @param use12Hour Optional: Use 12-hour format (only applies to 'hour' part)
 * @returns Formatted string for the target timezone
 */
const getTimezoneDatePart = (date, part, tz, pad = true, use12Hour = false) => {
    // Use system timezone if not specified
    const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const baseOptions = {
        timeZone,
        hour12: use12Hour
    };
    // Add part-specific options (type-safe for each part)
    const options = {
        ...baseOptions,
        // For year: always use 'numeric' (4-digit)
        ...(part === 'year' && { year: 'numeric' }),
        // For other parts: use '2-digit' for padded, 'numeric' for non-padded
        ...(part === 'month' && { month: pad ? '2-digit' : 'numeric' }),
        ...(part === 'day' && { day: pad ? '2-digit' : 'numeric' }),
        ...(part === 'hour' && { hour: pad ? '2-digit' : 'numeric' }),
        ...(part === 'minute' && { minute: pad ? '2-digit' : 'numeric' }),
        ...(part === 'second' && { second: pad ? '2-digit' : 'numeric' })
    };
    // Get raw part value from Intl API (timezone-aware)
    let partValue = new Intl.DateTimeFormat('en-US', options)
        .formatToParts(date)
        .find(p => p.type === part)?.value || '';
    return partValue;
};
/**
 * Get AM/PM indicator for 12-hour format (timezone-aware)
 * @param date UTC-based Date object
 * @param tz Optional IANA timezone
 * @param uppercase Optional: Return uppercase (AM/PM) or lowercase (am/pm)
 * @returns AM/PM string (e.g., "AM", "pm")
 */
const getAmPm = (date, tz, uppercase = true) => {
    const timeZone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Extract dayPeriod (am/pm) from Intl API
    const amPmValue = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: true,
        hour: '2-digit'
    })
        .formatToParts(date)
        .find(p => p.type === 'dayPeriod')?.value || '';
    // Return uppercase/lowercase as requested
    return uppercase ? amPmValue.toUpperCase() : amPmValue.toLowerCase();
};
/**
 * Format Date object to specified string format with timezone support
 * @param date UTC-based Date object
 * @param fmt Target format string
 * @param tz Optional IANA timezone
 * @returns Timezone-aware formatted date string
 */
const formatDate = (date, fmt, tz) => {
    return Object.entries(FORMAT_HANDLERS).reduce((result, [token, handler]) => {
        return result.replace(token, handler(date, tz));
    }, fmt);
};
/**
 * Validate if a string is a valid IANA timezone
 * @param v String to validate
 * @returns Boolean indicating if the string is a valid IANA timezone
 */
const isValidTimezone = (v) => {
    const validTimezonePrefixes = [
        'Africa/', 'America/', 'Antarctica/', 'Arctic/', 'Asia/',
        'Atlantic/', 'Australia/', 'Europe/', 'Indian/', 'Pacific/'
    ];
    const basicValidTimezones = ['UTC', 'GMT', 'Zulu'];
    return validTimezonePrefixes.some(prefix => v.startsWith(prefix))
        || basicValidTimezones.includes(v);
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
        // Set 5s timeout for request to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
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
        if (!responseData || typeof responseData !== 'object' || !('timestamp' in responseData)) {
            throw new Error('Invalid response format: missing timestamp field');
        }
        const rawServerTimestamp = Number(responseData.timestamp);
        if (isNaN(rawServerTimestamp) || !Number.isFinite(rawServerTimestamp)) {
            throw new Error('Timestamp is not a valid number');
        }
        const serverTimestamp = normalizeTimestamp(rawServerTimestamp);
        // NTP Step 2: Simulate server receive/send time (simplified for browser environment)
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
// ===================== Core Exports =====================
/**
 * ServerClock - Core time synchronization logic
 * Implements multiple sync attempts and selects the result with lowest network delay
 */
const ServerClock = {
    // Read-only sync status (mapped to internal state)
    get isSynced() {
        return state.isSynced;
    },
    /**
     * Main sync method (multiple attempts with lowest delay selection)
     * @param serverTimeApi API endpoint to fetch server timestamp
     * @param method Request method (default: POST)
     * @returns Promise with server timestamp (local time if all attempts fail)
     */
    sync: async (serverTimeApi, method = 'POST') => {
        // Hardcoded default parameters (3 attempts, 100ms interval)
        const times = 3;
        const intervalMs = 100;
        const validTimes = Math.max(1, Math.round(times)); // At least 1 attempt
        const validInterval = Math.max(50, Math.round(intervalMs)); // Min 50ms to avoid request congestion
        // Reset sync state before new sync attempts
        state.isSynced = false;
        state.offset = 0;
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
        if (syncResults.length === 0) {
            return Date.now();
        }
        // Select result with lowest network delay (most accurate per NTP best practice)
        const lowestDelayResult = syncResults.reduce((prev, current) => {
            return current.delay < prev.delay ? current : prev;
        });
        // Update global state with the most accurate offset
        state.offset = lowestDelayResult.offset;
        state.isSynced = true;
        // Return server timestamp from the most accurate attempt
        return lowestDelayResult.serverTimestamp;
    }
};
/**
 * Get timezone-aware Date object (returns UTC Date with correct timezone context)
 * @param timezone Optional IANA timezone
 * @returns Date object (UTC timestamp with timezone metadata)
 */
const getDateFunction = (timezone) => {
    const utcTimestamp = getServerTimestamp();
    return new Date(utcTimestamp);
};
/**
 * Format function implementation with overload support (timezone-aware)
 * Handles all 4 calling patterns defined in ServerTimeFormatFn
 */
const formatFunction = function (arg1, arg2) {
    let targetTimezone;
    let targetFormat = DEFAULT_FORMAT;
    if (arg1 === undefined) {
        // Pattern 1: No parameters (default format + system timezone)
        targetTimezone = undefined;
    }
    else if (arg2 === undefined) {
        // Pattern 2 or 3: Single parameter (format string or timezone)
        targetTimezone = isValidTimezone(arg1) ? arg1 : undefined;
        targetFormat = targetTimezone ? DEFAULT_FORMAT : arg1;
    }
    else {
        // Pattern 4: Two parameters (timezone + format string)
        targetTimezone = arg1;
        targetFormat = arg2;
    }
    // Get UTC timestamp and format with target timezone
    const utcDate = new Date(getServerTimestamp());
    return formatDate(utcDate, targetFormat, targetTimezone);
};
/**
 * ServerTime - Core time formatting and timezone conversion logic
 * Provides getDate (Date object) and format (formatted string) methods
*/
const ServerTime = {
    getDate: getDateFunction,
    format: formatFunction
};

export { ServerClock, ServerTime };
//# sourceMappingURL=index.esm.js.map
