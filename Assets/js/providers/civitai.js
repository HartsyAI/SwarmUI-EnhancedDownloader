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
            if (!window.modelDownloader || typeof modelDownloader.getCivitaiMetadata !== 'function') {
                return;
            }
            const versId = item.modelVersionId ? `${item.modelVersionId}` : null;
            modelDownloader.getCivitaiMetadata(`${item.modelId}`, versId, (rawData, rawVersion, metadata, modelType, url, img, imgs, errMsg) => {
                if (!rawData) {
                    return;
                }
                const typeToUse = modelType || modelTypeToSwarmSubtype(item.type);
                const safeName = `${rawData.name} - ${rawVersion.name}`.replaceAll(/[\|\\\/\:\*\?\"\<\>\|\,\.\&\!\[\]\(\)]/g, '-');
                const folder = modelDownloader.folders && modelDownloader.folders.value !== '(None)' ? modelDownloader.folders.value : '';
                const fullName = folder ? `${folder}/${safeName}` : safeName;
                const metaText = metadata ? JSON.stringify(metadata) : '';
                const download = new ActiveModelDownload(modelDownloader, fullName, url, img, typeToUse, metaText);
                download.download();
            }, '', true);
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
