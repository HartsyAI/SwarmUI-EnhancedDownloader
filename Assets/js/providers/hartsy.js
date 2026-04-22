(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Providers = window.EnhancedDownloader.Providers || {};

    let filterOptionsCache = null;
    let filterOptionsCacheTime = 0;
    const filterOptionsCacheDuration = 5 * 60 * 1000;

    const sortMapping = {
        'Most Downloaded': 'downloads',
        'Newest': 'created_at',
        'Highest Rated': 'downloads',
        'Most Popular': 'downloads',
        'downloads': 'downloads',
        'created_at': 'created_at',
        'updated_at': 'updated_at',
        'title': 'title'
    };

    window.EnhancedDownloader.Providers.hartsy = {
        id: 'hartsy',
        displayName: 'Hartsy',
        supportsFilters: true,
        supportsNsfw: false,

        sortOptions: [
            { value: 'downloads', label: 'Most Downloads' },
            { value: 'created_at', label: 'Newest' },
            { value: 'updated_at', label: 'Recently Updated' },
            { value: 'title', label: 'Title' }
        ],

        search: async function (params) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) {
                throw new Error('EnhancedDownloader utils not loaded');
            }
            let tags = params.tags || '';
            if (params.type && params.type !== 'All') {
                const typeTag = params.type.toLowerCase();
                tags = tags ? `${tags},${typeTag}` : typeTag;
            }
            return await utils.genericRequestAsync('EnhancedDownloaderHartsySearch', {
                query: params.query || '',
                page: params.page || 1,
                limit: params.limit || 24,
                architecture: params.baseModel || params.architecture || '',
                sort: sortMapping[params.sort] || 'downloads',
                tags: tags
            });
        },

        getFilterOptions: async function () {
            const now = Date.now();
            if (filterOptionsCache && (now - filterOptionsCacheTime) < filterOptionsCacheDuration) {
                return filterOptionsCache;
            }
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) {
                return { architectures: [], tags: [], uploadSources: [], subscriptionTiers: [] };
            }
            try {
                const resp = await utils.genericRequestAsync('EnhancedDownloaderHartsyFilterOptions', {});
                if (resp && resp.success) {
                    filterOptionsCache = {
                        architectures: resp.architectures || [],
                        tags: resp.tags || [],
                        uploadSources: resp.uploadSources || [],
                        subscriptionTiers: resp.subscriptionTiers || []
                    };
                    filterOptionsCacheTime = now;
                    return filterOptionsCache;
                }
            }
            catch (e) {
                console.warn('Failed to load Hartsy filter options:', e);
            }
            return { architectures: [], tags: [], uploadSources: [], subscriptionTiers: [] };
        },

        getArchitectureOptions: async function () {
            const options = await this.getFilterOptions();
            const archs = options.architectures || [];
            const result = [{ value: 'All', label: 'All' }];
            for (const arch of archs) {
                if (arch && arch.id) {
                    const count = arch.modelCount || 0;
                    const name = arch.displayName || arch.id;
                    result.push({
                        value: arch.id,
                        label: count > 0 ? `${name} (${count})` : name
                    });
                }
            }
            return result;
        },

        handleDownload: async function (item) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils) return;
            if (item.modelId && utils.genericRequestAsync) {
                try {
                    const resp = await utils.genericRequestAsync('EnhancedDownloaderHartsyDownload', {
                        modelId: `${item.modelId}`
                    });
                    if (resp && resp.success && resp.downloadUrl) {
                        utils.loadUrlIntoManualDownloader(resp.downloadUrl);
                        return;
                    }
                } catch (e) {
                    console.warn('Hartsy download endpoint failed, falling back:', e);
                }
            }
            const bestUrl = item.downloadUrl || item.openUrl || '';
            if (bestUrl) {
                utils.loadUrlIntoManualDownloader(bestUrl);
            }
        },

        handleCardClick: function (item) {
            this.handleDownload(item);
        },

        getPopoverExtras: function (item, menuDiv) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!item.modelId || !utils || !utils.genericRequestAsync) return;
            if (item.torrent && item.torrent.magnetLink) {
                const magnetBtn = document.createElement('div');
                magnetBtn.className = 'sui_popover_model_button';
                magnetBtn.innerText = 'Copy Magnet Link';
                magnetBtn.onclick = () => {
                    if (typeof copyText === 'function') {
                        copyText(item.torrent.magnetLink);
                    }
                };
                menuDiv.appendChild(magnetBtn);
            }
            const versionsBtn = document.createElement('div');
            versionsBtn.className = 'sui_popover_model_button';
            versionsBtn.innerText = 'Load versions...';
            versionsBtn.onclick = async () => {
                versionsBtn.innerText = 'Loading...';
                versionsBtn.style.pointerEvents = 'none';
                try {
                    const resp = await utils.genericRequestAsync('EnhancedDownloaderHartsyVersions', {
                        modelId: `${item.modelId}`
                    });
                    if (!resp || !resp.success || !Array.isArray(resp.versions) || resp.versions.length === 0) {
                        versionsBtn.innerText = 'No other versions';
                        return;
                    }
                    versionsBtn.style.display = 'none';
                    for (const ver of resp.versions) {
                        if (ver.id === item.modelId) continue;
                        const label = ver.versionLabel || ver.architecture || ver.title || 'Version';
                        const sizeStr = ver.fileSize ? ` (${(ver.fileSize / (1024 * 1024)).toFixed(0)} MB)` : '';
                        const verBtn = document.createElement('div');
                        verBtn.className = 'sui_popover_model_button';
                        verBtn.innerText = `Download: ${label}${sizeStr}`;
                        verBtn.onclick = () => {
                            this.handleDownload({ modelId: ver.id, downloadUrl: '', openUrl: `https://hartsy.ai/models/${ver.id}` });
                        };
                        menuDiv.appendChild(verBtn);
                    }
                } catch {
                    versionsBtn.innerText = 'Failed to load versions';
                }
            };
            menuDiv.appendChild(versionsBtn);
        }
    };
})();
