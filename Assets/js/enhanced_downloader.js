(function () {
    'use strict';

    // Placeholder: extension scaffold only.
    // Real UI will be embedded under existing Model Downloader in utiltab.js per plan.

    async function edGetStatus() {
        if (typeof genericRequest !== 'function') {
            return;
        }
        try {
            await genericRequest('EnhancedDownloaderAPI/GetStatus', {});
        }
        catch (e) {
            // ignore
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', edGetStatus);
    }
    else {
        edGetStatus();
    }
})();
