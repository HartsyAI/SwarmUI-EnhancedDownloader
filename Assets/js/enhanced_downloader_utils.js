(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Utils = window.EnhancedDownloader.Utils || {};

    window.EnhancedDownloader.Utils.genericRequestAsync = function genericRequestAsync(url, in_data) {
        return new Promise((resolve, reject) => {
            if (typeof genericRequest !== 'function') {
                reject('genericRequest is not available');
                return;
            }
            genericRequest(url, in_data, data => resolve(data), 0, e => reject(e));
        });
    };

    window.EnhancedDownloader.Utils.stripHtmlToText = function stripHtmlToText(html) {
        if (!html) {
            return '';
        }
        try {
            const div = document.createElement('div');
            div.innerHTML = `${html}`;
            const text = (div.textContent || div.innerText || '').replaceAll(/\s+/g, ' ').trim();
            return text;
        }
        catch {
            return `${html}`.replaceAll(/<[^>]*>/g, '').replaceAll(/\s+/g, ' ').trim();
        }
    };

    window.EnhancedDownloader.Utils.tryCopyText = async function tryCopyText(text) {
        const val = (text ?? '').toString();
        if (!val) {
            return false;
        }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(val);
                return true;
            }
        }
        catch {
            // ignore
        }
        return false;
    };

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
                imgSide.innerHTML = `<img src="${imageDataUrl}"/>`;
            }
            else {
                delete mz.dataset.image;
                imgSide.innerHTML = '';
            }
            return true;
        }
        catch {
            return false;
        }
    };

    window.EnhancedDownloader.Utils.getOrCreateNamespace = function getOrCreateNamespace(root, key) {
        if (!root[key]) {
            root[key] = {};
        }
        return root[key];
    };
})();
