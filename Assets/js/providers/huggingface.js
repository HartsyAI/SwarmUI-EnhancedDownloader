(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Providers = window.EnhancedDownloader.Providers || {};

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
        }
    };
})();
