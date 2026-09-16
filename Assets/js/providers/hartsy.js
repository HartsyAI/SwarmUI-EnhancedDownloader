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
            // Hartsy has no CivitAI-style "type" concept; checkpoint vs LoRA is distinguished by
            // architecture (e.g. "qwen-image" vs "qwen-image/lora"), so the type filter is not folded
            // into the tag query here - doing so (e.g. tags=checkpoint) matches nothing.
            // The browser passes the tag box as `tag`; accept both spellings so the filter is not silently dropped.
            const tags = params.tags || params.tag || '';
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

        // Hartsy has no type concept; a LoRA is an architecture suffix, so "every LoRA" is a comma-joined
        // architecture list. The `lora` tag is not usable for this: base models carry it too.
        loraArchitectures: function (architectures) {
            return (architectures || [])
                .map(a => a && a.id)
                .filter(id => id && id.toLowerCase().endsWith('/lora'))
                .join(',');
        },

        getArchitectureOptions: async function () {
            const options = await this.getFilterOptions();
            const archs = options.architectures || [];
            const result = [{ value: 'All', label: 'All' }];
            const loras = this.loraArchitectures(archs);
            if (loras) {
                result.push({ value: loras, label: 'LoRAs' });
            }
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

        /** Browsing opens on LoRAs: the base models are mostly repackages a user can get anywhere. */
        getDefaultArchitecture: async function () {
            const options = await this.getFilterOptions();
            return this.loraArchitectures(options.architectures) || 'All';
        },

        getVersionGroups: async function (modelId) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!modelId || !utils || !utils.genericRequestAsync) return [];
            try {
                const resp = await utils.genericRequestAsync('EnhancedDownloaderHartsyVersions', {
                    modelId: `${modelId}`
                });
                return (resp && resp.success && Array.isArray(resp.groups)) ? resp.groups : [];
            } catch (e) {
                console.warn('Failed to load Hartsy versions:', e);
                return [];
            }
        },

        findGroupFor: function (groups, modelId) {
            const id = `${modelId}`;
            return groups.find(g => (g.primary && `${g.primary.id}` === id)
                || (Array.isArray(g.variants) && g.variants.some(v => `${v.id}` === id))) || groups[0] || null;
        },

        /** Precision picker for the card: the same weights in other encodings, fetched lazily. */
        getSecondaryOptionsLazy: async function (item) {
            const groups = await this.getVersionGroups(item.modelId);
            const group = this.findGroupFor(groups, item.modelId);
            if (!group) return null;
            const entries = [group.primary, ...(Array.isArray(group.variants) ? group.variants : [])].filter(v => v && v.id);
            // The API blanks model_url on a precision this account can't have; list those disabled, not hidden.
            if (!entries.some(v => v.downloadUrl)) return null;
            return entries.map(v => {
                const parts = [v.precisionLabel || v.precision, v.specialFormat].filter(Boolean);
                const sizeStr = v.fileSize && typeof fileSizeStringify === 'function' ? fileSizeStringify(v.fileSize) : '';
                const gatedBy = v.downloadUrl ? '' : (v.subscriptionRequired || 'a subscription');
                const suffix = gatedBy ? ` (requires ${gatedBy})` : (sizeStr ? ` (${sizeStr})` : '');
                return {
                    value: v.downloadUrl || `gated:${v.id}`,
                    label: `${parts.length ? parts.join(' ') : (v.fileName || 'File')}${suffix}`,
                    downloadUrl: v.downloadUrl,
                    fileName: v.fileName || '',
                    fileSize: v.fileSize || null,
                    modelVersionId: v.id,
                    disabled: !v.downloadUrl,
                    primary: !!v.isPrimaryVariant && !!v.downloadUrl
                };
            });
        },

        handleDownload: function (item) {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils) return;
            const targetId = item.modelVersionId || item.modelId;
            // The page link, not a resolved file URL: the manual downloader's resolver fills in name, type and
            // metadata from it, and resolving here too would bill a second download event per click.
            const url = targetId
                ? `https://hartsy.ai/Home?type=models&id=${encodeURIComponent(targetId)}`
                : (item.downloadUrl || item.openUrl || '');
            if (url) {
                utils.loadUrlIntoManualDownloader(url);
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
                    const groups = await this.getVersionGroups(item.modelId);
                    const current = this.findGroupFor(groups, item.modelId);
                    const others = groups.filter(g => g !== current && g.primary && g.primary.downloadUrl);
                    if (others.length === 0) {
                        versionsBtn.innerText = 'No other versions';
                        return;
                    }
                    versionsBtn.style.display = 'none';
                    for (const group of others) {
                        const ver = group.primary;
                        const label = group.label || ver.versionLabel || ver.architecture || ver.title || 'Version';
                        const sizeStr = ver.fileSize && typeof fileSizeStringify === 'function' ? ` (${fileSizeStringify(ver.fileSize)})` : '';
                        const verBtn = document.createElement('div');
                        verBtn.className = 'sui_popover_model_button';
                        verBtn.innerText = `Download: ${label}${sizeStr}`;
                        verBtn.onclick = () => {
                            this.handleDownload({ modelId: ver.id, downloadUrl: '', openUrl: `https://hartsy.ai/Home?type=models&id=${ver.id}` });
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
