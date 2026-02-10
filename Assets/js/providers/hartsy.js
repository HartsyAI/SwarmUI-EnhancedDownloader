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
            return await utils.genericRequestAsync('EnhancedDownloaderHartsySearch', {
                query: params.query || '',
                page: params.page || 1,
                limit: params.limit || 24,
                architecture: params.baseModel || params.architecture || '',
                sort: sortMapping[params.sort] || 'downloads',
                tags: params.tags || ''
            });
        },

        getFilterOptions: async function () {
            const now = Date.now();
            if (filterOptionsCache && (now - filterOptionsCacheTime) < filterOptionsCacheDuration) {
                return filterOptionsCache;
            }
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) {
                return { architectures: [], tags: [], uploadSources: [] };
            }
            try {
                const resp = await utils.genericRequestAsync('EnhancedDownloaderHartsyFilterOptions', {});
                if (resp && resp.success) {
                    filterOptionsCache = {
                        architectures: resp.architectures || [],
                        tags: resp.tags || [],
                        uploadSources: resp.uploadSources || []
                    };
                    filterOptionsCacheTime = now;
                    return filterOptionsCache;
                }
            }
            catch (e) {
                console.warn('Failed to load Hartsy filter options:', e);
            }
            return { architectures: [], tags: [], uploadSources: [] };
        },

        getArchitectureOptions: async function () {
            const options = await this.getFilterOptions();
            return ['All', ...(options.architectures || [])];
        },

        handleDownload: function (item) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            const bestUrl = item.downloadUrl || item.openUrl || '';
            if (utils) {
                utils.loadUrlIntoManualDownloader(bestUrl);
            }
        },

        handleCardClick: function (item) {
            this.handleDownload(item);
        },

        getPopoverExtras: function (item, menuDiv) {
            // No extra popover items for Hartsy
        }
    };
})();
