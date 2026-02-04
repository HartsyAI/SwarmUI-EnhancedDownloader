(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Components = window.EnhancedDownloader.Components || {};

    function getProvider(id) {
        return (window.EnhancedDownloader.Providers && window.EnhancedDownloader.Providers[id]) || null;
    }

    /**
     * Create a popover menu for a model card and attach the hamburger button to the card.
     * @param {Object} item - The normalized model result.
     * @param {string} providerId - The active provider ID.
     * @param {number} renderId - Unique render ID for this card.
     * @param {HTMLElement} cardDiv - The card element to attach the menu button to.
     * @returns {HTMLElement} The popover menu element (to be appended to the results container).
     */
    function createModelPopover(item, providerId, renderId, cardDiv) {
        const provider = getProvider(providerId);
        const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
        const downloadOptions = Array.isArray(item.downloadOptions) ? item.downloadOptions : [];
        const bestDownloadUrl = item.downloadUrl
            ? `${item.downloadUrl}`
            : (downloadOptions.length > 0 && downloadOptions[0] ? `${downloadOptions[0].downloadUrl}` : '');
        const openUrl = item.openUrl ? `${item.openUrl}` : '';

        const popoverId = `enhanced-downloader-model-${renderId}`;
        const menuDiv = createDiv(`popover_${popoverId}`, 'sui-popover sui_popover_model');

        // Download button
        const btnDownload = document.createElement('div');
        btnDownload.className = 'sui_popover_model_button';
        btnDownload.innerText = 'Download';
        btnDownload.onclick = () => {
            if (provider && provider.handleDownload) {
                provider.handleDownload(item);
            } else if (utils) {
                utils.loadUrlIntoManualDownloader(bestDownloadUrl || openUrl);
            }
        };
        menuDiv.appendChild(btnDownload);

        // Provider-specific extras (e.g. HF "Load all files")
        if (provider && typeof provider.getPopoverExtras === 'function') {
            provider.getPopoverExtras(item, menuDiv);
        }

        // Non-CivitAI file download options
        if (providerId !== 'civitai' && downloadOptions.length > 0) {
            for (const opt of downloadOptions) {
                if (!opt || !opt.downloadUrl) continue;
                const optBtn = document.createElement('div');
                optBtn.className = 'sui_popover_model_button';
                optBtn.innerText = opt.fileName ? `Download: ${opt.fileName}` : 'Download File';
                optBtn.onclick = () => {
                    if (provider && provider.handleCardClick) {
                        // Use provider logic for consistency (e.g. HF sets metadata)
                        const fakeItem = Object.assign({}, item, { downloadUrl: `${opt.downloadUrl}` });
                        provider.handleCardClick(fakeItem);
                    } else if (utils) {
                        utils.loadUrlIntoManualDownloader(`${opt.downloadUrl}`);
                    }
                };
                menuDiv.appendChild(optBtn);
            }
        }

        // Open link
        if (openUrl) {
            const btnOpen = document.createElement('a');
            btnOpen.className = 'sui_popover_model_button';
            btnOpen.innerText = 'Open';
            btnOpen.href = openUrl;
            btnOpen.target = '_blank';
            btnOpen.rel = 'noreferrer';
            menuDiv.appendChild(btnOpen);
        }

        // Copy actions — use SwarmUI's global copyText()
        const addCopy = (label, value) => {
            const btn = document.createElement('div');
            btn.className = 'sui_popover_model_button';
            btn.innerText = label;
            btn.onclick = () => {
                if (typeof copyText === 'function') {
                    copyText(value);
                }
            };
            menuDiv.appendChild(btn);
        };

        if (openUrl) addCopy('Copy Model Link', openUrl);
        if (item.downloadUrl) addCopy('Copy Download Link', item.downloadUrl);
        if (downloadOptions.length > 0) {
            for (const opt of downloadOptions) {
                if (opt && opt.downloadUrl && opt.fileName) {
                    addCopy(`Copy Link: ${opt.fileName}`, `${opt.downloadUrl}`);
                }
            }
        }
        if (item.modelId) addCopy('Copy Model ID', `${item.modelId}`);
        if (item.modelVersionId) addCopy('Copy Version ID', `${item.modelVersionId}`);
        if (item.fileName) addCopy('Copy Filename', `${item.fileName}`);
        if (item.fileSize) addCopy('Copy File Size (bytes)', `${item.fileSize}`);

        // Hamburger menu button
        const menuBtn = createDiv(null, 'model-block-menu-button');
        menuBtn.innerHTML = '&#x2630;';
        menuBtn.addEventListener('click', () => {
            doPopover(popoverId);
        });
        cardDiv.appendChild(menuBtn);

        return menuDiv;
    }

    window.EnhancedDownloader.Components.ModelPopover = {
        create: createModelPopover
    };
})();
