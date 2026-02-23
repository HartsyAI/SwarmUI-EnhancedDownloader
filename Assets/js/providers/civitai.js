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

    // Handle CivitAI download URLs by fetching metadata from version endpoint
    function injectCivitAIVersionFix() {
        if (!window.modelDownloader) {
            return false;
        }

        const mdl = window.modelDownloader;

        if (mdl._civitAIVersionFixInjected) {
            return true;
        }

        const origUrlInput = mdl.urlInput;
        mdl.urlInput = function() {
            const url = this.url.value.trim();

            // Check if it's a CivitAI download URL (api/download/models/{versionId})
            if (url.startsWith(this.civitPrefix)) {
                const parts = url.substring(this.civitPrefix.length).split('/').slice(0, 4);

                if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'download' && parts[2] === 'models') {
                    const versionId = parts[3];

                    // Fetch version data directly - it includes downloadUrl and all metadata
                    genericRequest('ForwardMetadataRequest', { 'url': `${this.civitPrefix}api/v1/model-versions/${versionId}` }, (rawData) => {
                        rawData = rawData.response;
                        if (!rawData || !rawData.files || !rawData.files.length) {
                            this.urlStatusArea.innerText = "URL appears to be a CivitAI download link, but could not fetch file information.";
                            return;
                        }

                        // Use the downloadUrl from the version data
                        const primaryFile = rawData.files.find(f => f.primary) || rawData.files[0];
                        this.url.value = primaryFile.downloadUrl;

                        // Trigger normal flow with the real download URL
                        origUrlInput.call(this);
                    }, 0, () => {
                        this.urlStatusArea.innerText = "URL appears to be a CivitAI download link, but could not fetch model information.";
                    });
                    return;
                }
            }

            origUrlInput.call(this);
        };

        mdl._civitAIVersionFixInjected = true;
        return true;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(injectCivitAIVersionFix, 100);
        });
    } else {
        setTimeout(injectCivitAIVersionFix, 100);
    }
})();
