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

    const sortOptions = [
        { value: 'Most Downloaded', label: 'Most Downloaded' },
        { value: 'Highest Rated', label: 'Highest Rated' },
        { value: 'Most Liked', label: 'Most Liked' },
        { value: 'Most Discussed', label: 'Most Discussed' },
        { value: 'Most Collected', label: 'Most Collected' },
        { value: 'Newest', label: 'Newest' },
        { value: 'Oldest', label: 'Oldest' }
    ];
    const periodOptions = [
        { value: 'AllTime', label: 'All Time' },
        { value: 'Year', label: 'Past Year' },
        { value: 'Month', label: 'Past Month' },
        { value: 'Week', label: 'Past Week' },
        { value: 'Day', label: 'Past Day' }
    ];

    window.EnhancedDownloader.Providers.civitai = {
        id: 'civitai',
        displayName: 'CivitAI',
        supportsFilters: true,
        supportsNsfw: true,
        supportsPeriod: true,

        getSortOptions: function () { return sortOptions; },
        getPeriodOptions: function () { return periodOptions; },

        /** Fetches CivitAI's live type/baseModel enums so the filter dropdowns track new architectures automatically. */
        getFilterOptions: async function () {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) return { types: [], baseModels: [] };
            const resp = await utils.genericRequestAsync('EnhancedDownloaderCivitaiFilterOptions', {});
            if (resp && resp.success) {
                return { types: resp.types || [], baseModels: resp.baseModels || [] };
            }
            throw new Error((resp && resp.error) || 'Failed to load CivitAI filter options');
        },

        getTypeOptions: async function () {
            const { types } = await this.getFilterOptions();
            return [{ value: 'All', label: 'All' }, ...types.map(t => ({ value: t, label: t === 'LORA' ? 'LoRA' : t }))];
        },

        getBaseModelOptions: async function () {
            const { baseModels } = await this.getFilterOptions();
            return [{ value: 'All', label: 'All' }, ...baseModels.map(b => ({ value: b, label: b }))];
        },

        /** Version picker for the card: one option per modelVersion, built from data already in the search result (no fetch). */
        getPrimaryOptions: function (item) {
            const versions = Array.isArray(item.downloadOptions) ? item.downloadOptions : [];
            const modelId = item.modelId;
            return versions.filter(v => v && v.downloadUrl).map(v => ({
                value: `${v.modelVersionId}`,
                label: v.versionName ? `${v.versionName}${v.baseModel ? ` [${v.baseModel}]` : ''}` : (v.fileName || 'Version'),
                downloadUrl: `${v.downloadUrl}`,
                openUrl: modelId ? `https://civitai.com/models/${modelId}?modelVersionId=${v.modelVersionId}` : (item.openUrl || ''),
                fileName: v.fileName || '',
                fileSize: v.fileSize || null,
                modelVersionId: `${v.modelVersionId}`
            }));
        },

        /** Format picker for the card: fetched lazily since it needs a request per version. */
        getSecondaryOptionsLazy: async function (item, primaryOption) {
            const versionId = primaryOption ? parseInt(primaryOption.value, 10)
                : (typeof item.modelVersionId === 'number' ? item.modelVersionId : parseInt(item.modelVersionId, 10));
            if (!versionId || isNaN(versionId)) return null;
            const files = await this.getVersionFiles(versionId);
            if (!Array.isArray(files) || files.length <= 1) return null;
            return files.filter(f => f && f.downloadUrl).map(f => {
                const parts = [f.format, f.precision, f.sizeLabel].filter(Boolean);
                const sizeStr = f.fileSize && typeof fileSizeStringify === 'function' ? fileSizeStringify(f.fileSize) : '';
                return {
                    value: f.downloadUrl,
                    label: `${parts.length ? parts.join(' ') : (f.fileName || 'File')}${sizeStr ? ` (${sizeStr})` : ''}`,
                    downloadUrl: f.downloadUrl,
                    fileName: f.fileName || '',
                    fileSize: f.fileSize || null,
                    primary: !!f.primary
                };
            });
        },

        /** Fetches every file (all format/precision variants) for a model version. */
        getVersionFiles: async function (modelVersionId) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) return [];
            const id = typeof modelVersionId === 'number' ? modelVersionId : parseInt(modelVersionId, 10);
            if (!id || isNaN(id)) return [];
            try {
                const resp = await utils.genericRequestAsync('EnhancedDownloaderCivitaiVersionFiles', { modelVersionId: id });
                return (resp && resp.success && Array.isArray(resp.files)) ? resp.files : [];
            } catch (e) {
                console.warn('Failed to load CivitAI version files:', e);
                return [];
            }
        },

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
                includeNsfw: !!params.includeNsfw,
                period: params.period || '',
                username: params.username || '',
                tag: params.tag || '',
                supportsGeneration: !!params.supportsGeneration,
                fromPlatform: !!params.fromPlatform
            });
        },

        suggestTags: async function (queryStr) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) return [];
            try {
                const resp = await utils.genericRequestAsync('EnhancedDownloaderCivitaiTags', {
                    query: queryStr || '',
                    limit: 12
                });
                return (resp && resp.success && Array.isArray(resp.tags)) ? resp.tags : [];
            } catch {
                return [];
            }
        },

        /** Run a pre-flight check before downloading. Resolves to { ok, warning, requiresLogin, inEarlyAccess } or null on failure. */
        preflightCheck: async function (item) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) return null;
            const versionId = typeof item.modelVersionId === 'number' ? item.modelVersionId : parseInt(item.modelVersionId, 10);
            if (!versionId || isNaN(versionId)) return null;
            try {
                return await utils.genericRequestAsync('EnhancedDownloaderCivitaiVersionCheck', {
                    modelVersionId: versionId
                });
            } catch {
                return null;
            }
        },

        handleDownload: async function (item) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            const bestUrl = item.downloadUrl || item.openUrl || '';
            const check = await this.preflightCheck(item);
            if (check && check.success) {
                const warnings = [];
                if (check.inEarlyAccess && check.earlyAccessEndsAt) {
                    const dateStr = new Date(check.earlyAccessEndsAt).toLocaleString();
                    warnings.push(`This model is in Early Access until ${dateStr}. Downloading may require a CivitAI subscription.`);
                }
                if (check.requireAuth && !check.hasApiKey) {
                    warnings.push('This download requires login. Add your CivitAI API key in User Settings to authenticate.');
                }
                if (warnings.length > 0) {
                    const message = warnings.join('\n\n') + '\n\nContinue anyway?';
                    if (typeof window.confirm === 'function' && !window.confirm(message)) {
                        return;
                    }
                }
            }
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

        /** Returns rich badges to render on the card for a CivitAI model. */
        getCardBadges: function (item) {
            const badges = [];
            if (item.earlyAccessEndsAt) {
                const ends = new Date(item.earlyAccessEndsAt);
                if (!isNaN(ends.getTime()) && ends.getTime() > Date.now()) {
                    const dateStr = ends.toLocaleDateString();
                    badges.push({ label: `Early Access until ${dateStr}`, kind: 'warn' });
                }
            }
            if (item.mode === 'Archived') badges.push({ label: 'Archived', kind: 'muted' });
            if (item.mode === 'TakenDown') badges.push({ label: 'Taken Down', kind: 'danger' });
            const nsfwLevel = typeof item.nsfwLevel === 'number' ? item.nsfwLevel : 0;
            if (nsfwLevel >= 16) badges.push({ label: 'XXX', kind: 'danger' });
            else if (nsfwLevel >= 8) badges.push({ label: 'X', kind: 'warn' });
            else if (nsfwLevel >= 4) badges.push({ label: 'R', kind: 'warn' });
            if (typeof item.thumbsUpCount === 'number' && item.thumbsUpCount > 0) {
                badges.push({ label: `\u{1F44D} ${item.thumbsUpCount}`, kind: 'info' });
            }
            return badges;
        },

        getPopoverExtras: function (item, menuDiv, selection) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            const trainedWords = Array.isArray(item.trainedWords) ? item.trainedWords : [];
            if (trainedWords.length > 0) {
                const triggerBtn = document.createElement('div');
                triggerBtn.className = 'sui_popover_model_button';
                triggerBtn.innerText = `Copy Trigger Words (${trainedWords.length})`;
                triggerBtn.onclick = () => {
                    if (typeof copyText === 'function') {
                        copyText(trainedWords.join(', '));
                    }
                };
                menuDiv.appendChild(triggerBtn);
            }
            if (item.air) {
                const airBtn = document.createElement('div');
                airBtn.className = 'sui_popover_model_button';
                airBtn.innerText = 'Copy AIR URN';
                airBtn.onclick = () => {
                    if (typeof copyText === 'function') {
                        copyText(`${item.air}`);
                    }
                };
                menuDiv.appendChild(airBtn);
            }
            if (item.modelVersionId) {
                const examplesBtn = document.createElement('div');
                examplesBtn.className = 'sui_popover_model_button';
                examplesBtn.innerText = 'Load Example Prompts...';
                examplesBtn.onclick = async () => {
                    if (examplesBtn.dataset.loading === 'true') return;
                    examplesBtn.dataset.loading = 'true';
                    examplesBtn.innerText = 'Loading...';
                    try {
                        const versionId = selection && selection.modelVersionId
                            ? (typeof selection.modelVersionId === 'number' ? selection.modelVersionId : parseInt(selection.modelVersionId, 10))
                            : (typeof item.modelVersionId === 'number' ? item.modelVersionId : parseInt(item.modelVersionId, 10));
                        const resp = await utils.genericRequestAsync('EnhancedDownloaderCivitaiImages', {
                            modelVersionId: versionId,
                            limit: 6,
                            includeNsfw: typeof item.nsfwLevel === 'number' && item.nsfwLevel >= 4
                        });
                        if (!resp || !resp.success || !Array.isArray(resp.images) || resp.images.length === 0) {
                            examplesBtn.innerText = 'No example prompts found';
                            return;
                        }
                        let added = 0;
                        for (const ex of resp.images) {
                            const prompt = (ex && ex.prompt) ? `${ex.prompt}` : '';
                            if (!prompt) continue;
                            const promptBtn = document.createElement('div');
                            promptBtn.className = 'sui_popover_model_button';
                            const short = prompt.length > 60 ? prompt.slice(0, 60) + '\u2026' : prompt;
                            promptBtn.innerText = `Copy Prompt: ${short}`;
                            promptBtn.title = prompt;
                            promptBtn.onclick = () => {
                                if (typeof copyText === 'function') {
                                    copyText(prompt);
                                }
                            };
                            menuDiv.insertBefore(promptBtn, examplesBtn.nextSibling);
                            added++;
                        }
                        examplesBtn.innerText = added > 0 ? `Loaded ${added} example prompts` : 'No example prompts found';
                    } catch {
                        examplesBtn.innerText = 'Failed to load examples';
                    }
                };
                menuDiv.appendChild(examplesBtn);
            }
        }
    };

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

            if (url.startsWith(this.civitPrefix)) {
                const parts = url.substring(this.civitPrefix.length).split('/').slice(0, 4);

                if (parts.length >= 4 && parts[0] === 'api' && parts[1] === 'download' && parts[2] === 'models') {
                    const versionId = parts[3];

                    genericRequest('ForwardMetadataRequest', { 'url': `${this.civitPrefix}api/v1/model-versions/${versionId}` }, (rawData) => {
                        rawData = rawData.response;
                        if (!rawData || !rawData.files || !rawData.files.length) {
                            this.urlStatusArea.innerText = "URL appears to be a CivitAI download link, but could not fetch file information.";
                            return;
                        }

                        const primaryFile = rawData.files.find(f => f.primary) || rawData.files[0];
                        this.url.value = primaryFile.downloadUrl;

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
