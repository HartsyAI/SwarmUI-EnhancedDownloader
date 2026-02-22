(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Providers = window.EnhancedDownloader.Providers || {};

    const modelTypeToSwarmSubtype = (civitType) => {
        if (civitType === 'Checkpoint') return 'Stable-Diffusion';
        if (['LORA', 'LoCon', 'LyCORIS'].includes(civitType)) return 'LoRA';
        if (civitType === 'TextualInversion') return 'Embedding';
        if (civitType === 'ControlNet') return 'ControlNet';
        if (civitType === 'VAE') return 'VAE';
        return window.modelDownloader && modelDownloader.type ? modelDownloader.type.value : 'Stable-Diffusion';
    };

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
        },

        handleDownload: function (item) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            const bestUrl = item.downloadUrl || item.openUrl || '';
            if (utils) {
                utils.loadUrlIntoManualDownloader(bestUrl);
            }
        },

        handleCardClick: function (item) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            const bestUrl = item.downloadUrl || item.openUrl || '';
            if (utils) {
                utils.loadUrlIntoManualDownloader(bestUrl);
            }
        },

        getPopoverExtras: function (item, menuDiv) {
            // CivitAI has no extra popover items
        }
    };
})();
