(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Providers = window.EnhancedDownloader.Providers || {};

    window.EnhancedDownloader.Providers.civitai = {
        id: 'civitai',
        displayName: 'CivitAI',
        supportsFilters: true,
        supportsNsfw: true,

        search: async function (params) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) {
                throw new Error('EnhancedDownloader utils not loaded');
            }
            return await utils.genericRequestAsync('EnhancedDownloaderCivitaiSearch', {
                query: params.query || '',
                page: params.page || 1,
                limit: params.limit || 24,
                cursor: params.cursor || '',
                type: params.type || 'All',
                baseModel: params.baseModel || 'All',
                sort: params.sort || 'Most Downloaded',
                includeNsfw: !!params.includeNsfw
            });
        }
    };
})();
