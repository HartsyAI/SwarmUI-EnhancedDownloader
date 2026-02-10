(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Utils = window.EnhancedDownloader.Utils || {};
    window.EnhancedDownloader.Providers = window.EnhancedDownloader.Providers || {};
    window.EnhancedDownloader.Components = window.EnhancedDownloader.Components || {};

    /** Promise wrapper around SwarmUI's callback-based genericRequest. */
    window.EnhancedDownloader.Utils.genericRequestAsync = function genericRequestAsync(url, in_data) {
        return new Promise((resolve, reject) => {
            if (typeof genericRequest !== 'function') {
                reject('genericRequest is not available');
                return;
            }
            genericRequest(url, in_data, data => resolve(data), 0, e => reject(e));
        });
    };

    /** Load a URL into the manual downloader, trigger validation, and scroll to it. */
    window.EnhancedDownloader.Utils.loadUrlIntoManualDownloader = function loadUrlIntoManualDownloader(url) {
        try {
            if (!window.modelDownloader || !modelDownloader.url || typeof modelDownloader.urlInput !== 'function') {
                return false;
            }
            modelDownloader.url.value = `${url || ''}`;
            modelDownloader.urlInput();
            modelDownloader.url.focus();
            modelDownloader.url.select();
            modelDownloader.url.scrollIntoView({ behavior: 'smooth', block: 'start' });
            return true;
        }
        catch {
            return false;
        }
    };

    /** Set metadata info and optional preview image in the manual downloader panel. */
    window.EnhancedDownloader.Utils.setManualDownloaderInfo = function setManualDownloaderInfo(infoHtml, rawMetadata, imageDataUrl) {
        try {
            if (!window.modelDownloader) {
                return false;
            }
            const mz = modelDownloader.metadataZone;
            const imgSide = modelDownloader.imageSide;
            if (!mz || !imgSide) {
                return false;
            }
            mz.innerHTML = infoHtml || '';
            mz.dataset.raw = rawMetadata || '';
            if (imageDataUrl) {
                mz.dataset.image = imageDataUrl;
                imgSide.replaceChildren();
                const img = document.createElement('img');
                img.src = imageDataUrl;
                imgSide.appendChild(img);
            }
            else {
                delete mz.dataset.image;
                imgSide.replaceChildren();
            }
            return true;
        }
        catch {
            return false;
        }
    };
})();
