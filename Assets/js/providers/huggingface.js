(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Providers = window.EnhancedDownloader.Providers || {};

    const imageCache = new Map();
    const imageInflight = new Map();
    const imageQueue = [];
    let imageActive = 0;
    const imageMax = 4;
    const IMAGE_CACHE_MAX = 100;

    const queuePump = () => {
        while (imageActive < imageMax && imageQueue.length > 0) {
            const task = imageQueue.shift();
            if (!task) continue;
            imageActive++;
            task().finally(() => {
                imageActive--;
                queuePump();
            });
        }
    };

    const evictOldestCacheEntries = () => {
        if (imageCache.size <= IMAGE_CACHE_MAX) return;
        const iter = imageCache.keys();
        let toDelete = imageCache.size - IMAGE_CACHE_MAX;
        while (toDelete-- > 0) {
            const oldest = iter.next().value;
            imageCache.delete(oldest);
        }
    };

    const getImage = async (modelId) => {
        const key = `${modelId || ''}`;
        if (!key) return '';
        if (imageCache.has(key)) return imageCache.get(key) || '';
        if (imageInflight.has(key)) return await imageInflight.get(key);
        const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
        if (!utils || !utils.genericRequestAsync) return '';
        const p = (async () => {
            try {
                const resp = await utils.genericRequestAsync('EnhancedDownloaderHuggingFaceImage', { modelId: key });
                const img = resp && resp.success ? (resp.image || '') : '';
                imageCache.set(key, img);
                evictOldestCacheEntries();
                return img;
            }
            catch {
                imageCache.set(key, '');
                evictOldestCacheEntries();
                return '';
            }
            finally {
                imageInflight.delete(key);
            }
        })();
        imageInflight.set(key, p);
        return await p;
    };

    const applyToManualDownloader = async (item, bestDownloadUrl, openUrl) => {
        try {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || typeof utils.setManualDownloaderInfo !== 'function') return;

            const title = `${item && item.name ? item.name : (item && item.modelId ? item.modelId : '')}`;
            const modelId = item && item.modelId ? `${item.modelId}` : '';
            const descText = stripHtmlToText((item && item.description) ? item.description : '');
            const link = openUrl ? `${openUrl}` : '';

            const infoHtml = `
                <b>Hugging Face Metadata</b>
                ${title ? `<br><b>Model</b>: ${escapeHtml(title)}` : ''}
                ${modelId ? `<br><b>Model ID</b>: ${escapeHtml(modelId)}` : ''}
                ${link ? `<br><b>Link</b>: <a href="${link}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a>` : ''}
                ${descText ? `<br><b>Description</b>: ${escapeHtml(descText)}` : ''}
            `;

            const rawMeta = JSON.stringify({
                'modelspec.title': title || modelId || '',
                'modelspec.description': link ? `From ${link}\n${descText || ''}` : (descText || ''),
                'modelspec.thumbnail': ''
            }, null, 2);

            // Swarm's urlInput() clears metadataZone for HF links; set URL first, then re-apply.
            utils.loadUrlIntoManualDownloader(bestDownloadUrl || openUrl);
            utils.setManualDownloaderInfo(infoHtml, rawMeta, '');

            if (modelId) {
                const img = await getImage(modelId);
                if (img) {
                    const rawMetaWithThumb = JSON.stringify({
                        'modelspec.title': title || modelId || '',
                        'modelspec.description': link ? `From ${link}\n${descText || ''}` : (descText || ''),
                        'modelspec.thumbnail': img
                    }, null, 2);
                    utils.setManualDownloaderInfo(infoHtml, rawMetaWithThumb, img);
                }
            }
        }
        catch {
            // ignore
        }
    };

    window.EnhancedDownloader.Providers.huggingface = {
        id: 'huggingface',
        displayName: 'Hugging Face',
        supportsFilters: false,
        supportsNsfw: false,

        search: async function (params) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) {
                throw new Error('EnhancedDownloader utils not loaded');
            }
            return await utils.genericRequestAsync('EnhancedDownloaderHuggingFaceSearch', {
                query: params.query || '',
                limit: params.limit || 24,
                cursor: params.cursor || ''
            });
        },

        handleDownload: function (item) {
            const downloadOptions = Array.isArray(item.downloadOptions) ? item.downloadOptions : [];
            const bestUrl = item.downloadUrl
                ? `${item.downloadUrl}`
                : (downloadOptions.length > 0 && downloadOptions[0] ? `${downloadOptions[0].downloadUrl}` : '');
            const openUrl = item.openUrl ? `${item.openUrl}` : '';
            applyToManualDownloader(item, bestUrl, openUrl);
        },

        handleCardClick: function (item) {
            this.handleDownload(item);
        },

        /** Queue an image load for a card's img element. */
        loadCardImage: function (imgEl, modelId, renderId) {
            if (!imgEl || !modelId) return;
            const rid = `${renderId}`;
            const task = async () => {
                const image = await getImage(modelId);
                if (!image) return;
                if (imgEl.dataset && imgEl.dataset.renderId && imgEl.dataset.renderId !== rid) return;
                imgEl.src = image;
            };
            imageQueue.push(task);
            queuePump();
        },

        /** Return extra popover buttons for HuggingFace models. */
        getPopoverExtras: function (item, menuDiv) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!item || !item.modelId) return;

            const loadAllBtn = document.createElement('div');
            loadAllBtn.className = 'sui_popover_model_button';
            loadAllBtn.innerText = 'Load all files...';
            loadAllBtn.onclick = async () => {
                if (loadAllBtn.dataset.loading === 'true') return;
                loadAllBtn.dataset.loading = 'true';
                loadAllBtn.innerText = 'Loading...';
                try {
                    const resp = await utils.genericRequestAsync('EnhancedDownloaderHuggingFaceFiles', {
                        modelId: `${item.modelId}`,
                        limit: 2000
                    });
                    if (!resp || !resp.success || !Array.isArray(resp.files)) {
                        loadAllBtn.innerText = 'Failed to load files';
                        return;
                    }
                    const downloadOptions = Array.isArray(item.downloadOptions) ? item.downloadOptions : [];
                    const existing = new Set();
                    for (const opt of downloadOptions) {
                        if (opt && opt.downloadUrl) existing.add(`${opt.downloadUrl}`);
                    }
                    let added = 0;
                    for (const opt of resp.files) {
                        if (!opt || !opt.downloadUrl) continue;
                        const dl = `${opt.downloadUrl}`;
                        if (existing.has(dl)) continue;
                        existing.add(dl);
                        const optBtn = document.createElement('div');
                        optBtn.className = 'sui_popover_model_button';
                        optBtn.innerText = opt.fileName ? `Download: ${opt.fileName}` : 'Download File';
                        optBtn.onclick = () => {
                            applyToManualDownloader(item, dl, item.openUrl || '');
                        };
                        menuDiv.insertBefore(optBtn, loadAllBtn.nextSibling);
                        added++;
                    }
                    loadAllBtn.innerText = added > 0 ? `Loaded ${added} files` : 'No additional files';
                }
                catch {
                    loadAllBtn.innerText = 'Failed to load files';
                }
            };
            menuDiv.appendChild(loadAllBtn);
        }
    };
})();
