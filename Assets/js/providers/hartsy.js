(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Providers = window.EnhancedDownloader.Providers || {};

    window.EnhancedDownloader.Providers.hartsy = {
        id: 'hartsy',
        displayName: 'Hartsy',
        supportsFilters: true,
        supportsNsfw: false,

        // Filter options cache
        _filterOptionsCache: null,
        _filterOptionsCacheTime: 0,
        _filterOptionsCacheDuration: 5 * 60 * 1000, // 5 minutes

        // Sort options for Hartsy
        sortOptions: [
            { value: 'popular', label: 'Most Popular' },
            { value: 'newest', label: 'Newest' },
            { value: 'downloads', label: 'Most Downloads' }
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
                sort: this.mapSort(params.sort),
                tags: params.tags || ''
            });
        },

        getFilterOptions: async function () {
            const now = Date.now();
            if (this._filterOptionsCache && (now - this._filterOptionsCacheTime) < this._filterOptionsCacheDuration) {
                return this._filterOptionsCache;
            }

            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) {
                return { architectures: [], tags: [], uploadSources: [] };
            }

            try {
                const resp = await utils.genericRequestAsync('EnhancedDownloaderHartsyFilterOptions', {});
                if (resp && resp.success) {
                    this._filterOptionsCache = {
                        architectures: resp.architectures || [],
                        tags: resp.tags || [],
                        uploadSources: resp.uploadSources || []
                    };
                    this._filterOptionsCacheTime = now;
                    return this._filterOptionsCache;
                }
            } catch (e) {
                console.warn('Failed to load Hartsy filter options:', e);
            }

            return { architectures: [], tags: [], uploadSources: [] };
        },

        // Map UI sort values to Hartsy API values
        mapSort: function (uiSort) {
            const mapping = {
                'Most Downloaded': 'downloads',
                'Newest': 'newest',
                'Highest Rated': 'popular',
                'Most Popular': 'popular',
                'popular': 'popular',
                'newest': 'newest',
                'downloads': 'downloads'
            };
            return mapping[uiSort] || 'popular';
        },

        // Get architecture options for dropdown (called by model browser)
        getArchitectureOptions: async function () {
            const options = await this.getFilterOptions();
            return ['All', ...(options.architectures || [])];
        }
    };
})();
