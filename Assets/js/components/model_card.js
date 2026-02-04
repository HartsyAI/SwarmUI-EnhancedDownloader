(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Components = window.EnhancedDownloader.Components || {};

    let cardRenderId = 0;

    function getProvider(id) {
        return (window.EnhancedDownloader.Providers && window.EnhancedDownloader.Providers[id]) || null;
    }

    /**
     * Create a model card DOM element for a search result item.
     * @param {Object} item - The normalized model result from the backend.
     * @param {string} providerId - The active provider ID.
     * @returns {{ card: HTMLElement, renderId: number }}
     */
    function createModelCard(item, providerId) {
        cardRenderId++;
        const renderId = cardRenderId;
        const provider = getProvider(providerId);
        const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;

        const div = document.createElement('div');
        div.className = 'model-block model-block-hoverable enhanced-downloader-model-card';

        // Image
        const img = document.createElement('img');
        img.dataset.renderId = `${renderId}`;
        img.src = item.image || 'imgs/model_placeholder.jpg';
        img.title = 'Click to load into Manual Download';
        div.appendChild(img);

        // Lazy-load HuggingFace images via provider
        if (providerId === 'huggingface' && provider && provider.loadCardImage
            && item.modelId && (!item.image || `${item.image}`.startsWith('imgs/'))) {
            provider.loadCardImage(img, item.modelId, renderId);
        }

        // Text block
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
            ${descHtml}
            ${actionsHtml}
        `;
        div.appendChild(textBlock);

        // Image click — delegate to provider
        img.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (provider && provider.handleCardClick) {
                provider.handleCardClick(item);
            } else if (utils) {
                utils.loadUrlIntoManualDownloader(bestDownloadUrl || openUrl);
            }
        });

        // Download button — delegate to provider
        const downloadBtn = textBlock.querySelector('.ed-model-download');
        if (downloadBtn) {
            downloadBtn.onclick = () => {
                if (provider && provider.handleDownload) {
                    provider.handleDownload(item);
                } else if (utils) {
                    utils.loadUrlIntoManualDownloader(bestDownloadUrl || openUrl);
                }
            };
        }

        return { card: div, renderId };
    }

    /** Reset the render ID counter (e.g. on new search). */
    function resetRenderId() {
        cardRenderId = 0;
    }

    /** Get the current render ID value. */
    function getRenderId() {
        return cardRenderId;
    }

    window.EnhancedDownloader.Components.ModelCard = {
        create: createModelCard,
        resetRenderId: resetRenderId,
        getRenderId: getRenderId
    };
})();
