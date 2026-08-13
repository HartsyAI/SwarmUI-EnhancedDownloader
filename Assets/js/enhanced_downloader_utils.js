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

    /** If fileName is a GGUF file but url doesn't already look like one, append the `#.gguf` hint core's
     * DoModelDownloadWS reads to pick the save extension (see civitai's getCivitaiMetadata for the same trick). */
    window.EnhancedDownloader.Utils.appendExtensionHint = function appendExtensionHint(url, fileName) {
        if (!url || !fileName) {
            return url;
        }
        if (`${fileName}`.toLowerCase().endsWith('.gguf') && !`${url}`.toLowerCase().endsWith('.gguf')) {
            return `${url}#.gguf`;
        }
        return url;
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

    /** Resolves the currently selected destination folder from whichever folder UI is active, returning '' for
     * the root. `mdl.folders` is core's original <select> and always exists regardless of which UI is showing -
     * it is NOT a reliable "which UI is active" signal (its tagName is always 'SELECT'). The real signal is
     * `mdl.folderBrowser`, set only once folder_browser_injection.js has installed its tree UI over the select;
     * until then (or if it never loads), the select's own value is authoritative. Shared by the destination-path
     * preview and the download start handoff so both always agree on where a model is about to land. */
    window.EnhancedDownloader.Utils.resolveSelectedFolder = function resolveSelectedFolder(mdl) {
        if (!mdl) {
            return '';
        }
        const raw = mdl.folderBrowser ? mdl.selectedFolder : (mdl.folders ? mdl.folders.value : '');
        return raw && raw !== '(None)' ? raw : '';
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
