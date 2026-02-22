(function () {
    'use strict';

    const HISTORY_KEY = 'enhanced_downloader_history_v1';
    const MAX_HISTORY_ITEMS = 100;
    const MAX_AGE_DAYS = 30;

    function getHistory() {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(parsed)) return [];
            // Filter out old entries (older than MAX_AGE_DAYS)
            const cutoff = Date.now() - (MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
            return parsed.filter(item => item && item.timestamp && item.timestamp > cutoff);
        }
        catch {
            return [];
        }
    }

    function saveHistory(history) {
        try {
            // Keep only the most recent MAX_HISTORY_ITEMS
            const trimmed = history.slice(-MAX_HISTORY_ITEMS);
            localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
        }
        catch {
            // Ignore storage errors
        }
    }

    function addToHistory(name, url, type, success, errorMsg = null) {
        const history = getHistory();
        history.push({
            timestamp: Date.now(),
            name,
            url,
            type,
            success,
            errorMsg
        });
        saveHistory(history);
    }

    // Expose the API
    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.DownloadHistory = {
        get: getHistory,
        add: addToHistory
    };
})();
