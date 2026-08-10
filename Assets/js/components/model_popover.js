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
     * @param {Object} selection - The card's live version/format pick; the "current" copy/download/open actions here track it.
     * @returns {HTMLElement} The popover menu element (to be appended to the results container).
     */
    function createModelPopover(item, providerId, renderId, cardDiv, selection) {
        const provider = getProvider(providerId);
        const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
        const sel = selection || item;

        const popoverId = `enhanced-downloader-model-${renderId}`;
        // scrollable_tall caps height, or a long menu measures taller than the viewport and renders off-screen.
        const menuDiv = createDiv(`popover_${popoverId}`, 'sui-popover sui_popover_model sui_popover_scrollable_tall');

        const btnDownload = document.createElement('div');
        btnDownload.className = 'sui_popover_model_button';
        btnDownload.innerText = 'Download';
        btnDownload.onclick = () => {
            const merged = Object.assign({}, item, sel);
            if (provider && provider.handleDownload) {
                provider.handleDownload(merged);
            } else if (utils) {
                utils.loadUrlIntoManualDownloader(sel.downloadUrl || sel.openUrl);
            }
        };
        menuDiv.appendChild(btnDownload);

        if (provider && typeof provider.getPopoverExtras === 'function') {
            provider.getPopoverExtras(item, menuDiv, selection);
        }

        if (sel.openUrl) {
            const btnOpen = document.createElement('div');
            btnOpen.className = 'sui_popover_model_button';
            btnOpen.innerText = 'Open';
            btnOpen.onclick = () => window.open(sel.openUrl, '_blank', 'noreferrer');
            menuDiv.appendChild(btnOpen);
        }

        // valueOrGetter is a function for selection-tracking values, since this popover is only built once.
        const addCopy = (label, valueOrGetter) => {
            const btn = document.createElement('div');
            btn.className = 'sui_popover_model_button';
            btn.innerText = label;
            btn.onclick = () => {
                const value = typeof valueOrGetter === 'function' ? valueOrGetter() : valueOrGetter;
                if (typeof copyText === 'function' && value) {
                    copyText(value);
                }
            };
            menuDiv.appendChild(btn);
        };

        if (sel.openUrl) addCopy('Copy Model Link', () => sel.openUrl);
        if (sel.downloadUrl) addCopy('Copy Download Link', () => sel.downloadUrl);
        if (item.torrent && item.torrent.magnetLink) {
            addCopy('Copy Magnet Link', item.torrent.magnetLink);
        }
        if (item.modelId) addCopy('Copy Model ID', `${item.modelId}`);
        if (sel.modelVersionId) addCopy('Copy Version ID', () => `${sel.modelVersionId}`);
        if (sel.fileName) addCopy('Copy Filename', () => sel.fileName);
        if (sel.fileSize) addCopy('Copy File Size (bytes)', () => `${sel.fileSize}`);

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
