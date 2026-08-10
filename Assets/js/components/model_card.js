(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Components = window.EnhancedDownloader.Components || {};

    let cardRenderId = 0;

    function getProvider(id) {
        return (window.EnhancedDownloader.Providers && window.EnhancedDownloader.Providers[id]) || null;
    }

    /** Builds the (optional) version select and lazy format picker row for a card, wired into the shared selection object. */
    function buildVariantRow(variantRow, item, provider, selection, applySelectionToDom) {
        const primaryOptions = (typeof provider.getPrimaryOptions === 'function') ? (provider.getPrimaryOptions(item) || []) : [];
        let primarySelect = null;
        let formatHolder = null;

        const resetFormatControl = () => {
            if (!formatHolder) return;
            formatHolder.innerHTML = '';
            const toggle = document.createElement('span');
            toggle.className = 'basic-button enhanced-downloader-smallbtn ed-model-format-toggle';
            toggle.textContent = 'More formats';
            toggle.onclick = async () => {
                if (toggle.dataset.loading === 'true') return;
                toggle.dataset.loading = 'true';
                toggle.textContent = 'Loading...';
                try {
                    const currentPrimary = primarySelect ? primaryOptions.find(o => o.value === primarySelect.value) : null;
                    const formats = await provider.getSecondaryOptionsLazy(item, currentPrimary);
                    if (!Array.isArray(formats) || formats.length <= 1) {
                        toggle.textContent = formats && formats.length === 1 ? 'Only one format available' : 'No formats found';
                        return;
                    }
                    const formatSelect = document.createElement('select');
                    formatSelect.className = 'auto-dropdown ed-variant-select';
                    formatSelect.autocomplete = 'off';
                    for (const f of formats) {
                        const optEl = document.createElement('option');
                        optEl.value = f.value;
                        optEl.textContent = f.label;
                        formatSelect.appendChild(optEl);
                    }
                    const defaultFormat = formats.find(f => f.primary) || formats[0];
                    formatSelect.value = defaultFormat.value;
                    selection.downloadUrl = defaultFormat.downloadUrl || defaultFormat.value;
                    selection.fileName = defaultFormat.fileName || selection.fileName;
                    selection.fileSize = defaultFormat.fileSize || selection.fileSize;
                    formatSelect.onchange = () => {
                        const chosen = formats.find(f => f.value === formatSelect.value);
                        if (!chosen) return;
                        selection.downloadUrl = chosen.downloadUrl || chosen.value;
                        selection.fileName = chosen.fileName || selection.fileName;
                        selection.fileSize = chosen.fileSize || selection.fileSize;
                        applySelectionToDom();
                    };
                    formatHolder.innerHTML = '';
                    formatHolder.appendChild(formatSelect);
                    applySelectionToDom();
                } catch (e) {
                    console.warn('Failed to load format options:', e);
                    toggle.textContent = 'Failed to load formats';
                }
            };
            formatHolder.appendChild(toggle);
        };

        if (primaryOptions.length > 1) {
            primarySelect = document.createElement('select');
            primarySelect.className = 'auto-dropdown ed-variant-select';
            primarySelect.autocomplete = 'off';
            for (const opt of primaryOptions) {
                const optEl = document.createElement('option');
                optEl.value = opt.value;
                optEl.textContent = opt.label;
                primarySelect.appendChild(optEl);
            }
            // modelVersionId is only meaningful for providers whose primary dimension is versions (CivitAI);
            // for others (e.g. HuggingFace's primary dimension is files) the option won't carry one, so leave it alone.
            const defaultOpt = primaryOptions.find(o => `${o.value}` === `${item.modelVersionId}`) || primaryOptions[0];
            primarySelect.value = defaultOpt.value;
            Object.assign(selection, {
                downloadUrl: defaultOpt.downloadUrl || defaultOpt.value,
                openUrl: defaultOpt.openUrl || selection.openUrl,
                fileName: defaultOpt.fileName || selection.fileName,
                fileSize: defaultOpt.fileSize || selection.fileSize,
                modelVersionId: defaultOpt.modelVersionId !== undefined ? defaultOpt.modelVersionId : selection.modelVersionId
            });
            primarySelect.onchange = () => {
                const chosen = primaryOptions.find(o => o.value === primarySelect.value);
                if (!chosen) return;
                Object.assign(selection, {
                    downloadUrl: chosen.downloadUrl || chosen.value,
                    openUrl: chosen.openUrl || selection.openUrl,
                    fileName: chosen.fileName || selection.fileName,
                    fileSize: chosen.fileSize || selection.fileSize,
                    modelVersionId: chosen.modelVersionId !== undefined ? chosen.modelVersionId : selection.modelVersionId
                });
                applySelectionToDom();
                resetFormatControl();
            };
            variantRow.appendChild(primarySelect);
        }

        if (typeof provider.getSecondaryOptionsLazy === 'function' && (primaryOptions.length > 0 || item.modelVersionId)) {
            formatHolder = document.createElement('span');
            formatHolder.className = 'ed-model-format-holder';
            variantRow.appendChild(formatHolder);
            resetFormatControl();
        }
    }

    /**
     * Create a model card DOM element for a search result item.
     * @param {Object} item - The normalized model result from the backend.
     * @param {string} providerId - The active provider ID.
     * @returns {{ card: HTMLElement, renderId: number, selection: Object }}
     */
    function createModelCard(item, providerId) {
        cardRenderId++;
        const renderId = cardRenderId;
        const provider = getProvider(providerId);
        const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;

        const div = document.createElement('div');
        div.className = 'model-block model-block-hoverable enhanced-downloader-model-card';

        const img = document.createElement('img');
        img.dataset.renderId = `${renderId}`;
        img.src = item.image || 'imgs/model_placeholder.jpg';
        img.title = 'Click to load into Manual Download';
        div.appendChild(img);

        if (providerId === 'huggingface' && provider && provider.loadCardImage
            && item.modelId && (!item.image || `${item.image}`.startsWith('imgs/'))) {
            provider.loadCardImage(img, item.modelId, renderId);
        }

        const textBlock = document.createElement('div');
        textBlock.className = 'model-descblock';

        const downloadsStr = typeof item.downloads === 'number' ? `${item.downloads}` : '';
        const baseStr = item.baseModel ? `${escapeHtml(item.baseModel)}` : '';
        const creatorStr = item.creator ? `${escapeHtml(item.creator)}` : '';
        const downloadOptions = Array.isArray(item.downloadOptions) ? item.downloadOptions : [];
        const bestDownloadUrl = item.downloadUrl
            ? `${item.downloadUrl}`
            : (downloadOptions.length > 0 && downloadOptions[0] ? `${downloadOptions[0].downloadUrl}` : '');
        const openUrl = item.openUrl ? `${item.openUrl}` : '';
        const descText = stripHtmlToText(item.description || '');
        const descHtml = descText ? `<div class="ed-model-desc">${escapeHtml(descText)}</div>` : '';
        const badges = (provider && typeof provider.getCardBadges === 'function') ? (provider.getCardBadges(item) || []) : [];
        const badgesHtml = badges.length > 0
            ? `<div class="ed-model-badges">${badges.map(b => `<span class="ed-model-badge ed-model-badge-${escapeHtml(b.kind || 'info')}">${escapeHtml(b.label || '')}</span>`).join('')}</div>`
            : '';

        const actionsHtml = `
            <div class="ed-model-actions">
                <button type="button" class="basic-button enhanced-downloader-smallbtn ed-model-download"><span class="translate">Download</span></button>
                ${openUrl ? `<a class="basic-button enhanced-downloader-smallbtn ed-model-open" href="${openUrl}" target="_blank" rel="noreferrer"><span class="translate">Open</span></a>` : ''}
            </div>
        `;

        textBlock.innerHTML = `
            <b>${escapeHtml(item.name || '')}</b>
            ${item.versionName ? `<br>${escapeHtml(item.versionName)}` : ''}
            <br>${escapeHtml(item.type || '')}${baseStr ? ` | ${baseStr}` : ''}${creatorStr ? ` | ${creatorStr}` : ''}${downloadsStr ? ` | ${downloadsStr} downloads` : ''}
            ${badgesHtml}
            ${descHtml}
            <div class="ed-model-variant-row"></div>
            ${actionsHtml}
        `;
        div.appendChild(textBlock);

        // selection tracks the currently picked version/format; the card and popover both read/write it.
        const selection = {
            downloadUrl: bestDownloadUrl,
            openUrl: openUrl,
            fileName: item.fileName || '',
            fileSize: item.fileSize || null,
            modelVersionId: item.modelVersionId
        };

        const openLink = textBlock.querySelector('.ed-model-open');
        const applySelectionToDom = () => {
            if (openLink) openLink.href = selection.openUrl || '';
        };

        const variantRow = textBlock.querySelector('.ed-model-variant-row');
        if (variantRow && provider) {
            buildVariantRow(variantRow, item, provider, selection, applySelectionToDom);
        }

        img.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const merged = Object.assign({}, item, selection);
            if (provider && provider.handleCardClick) {
                provider.handleCardClick(merged);
            } else if (utils) {
                utils.loadUrlIntoManualDownloader(selection.downloadUrl || selection.openUrl);
            }
        });

        const downloadBtn = textBlock.querySelector('.ed-model-download');
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                const merged = Object.assign({}, item, selection);
                if (provider && provider.handleDownload) {
                    provider.handleDownload(merged);
                } else if (utils) {
                    utils.loadUrlIntoManualDownloader(selection.downloadUrl || selection.openUrl);
                }
            };
        }

        return { card: div, renderId, selection };
    }

    window.EnhancedDownloader.Components.ModelCard = {
        create: createModelCard
    };
})();
