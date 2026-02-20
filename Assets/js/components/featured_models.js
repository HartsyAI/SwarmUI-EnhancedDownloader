(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Components = window.EnhancedDownloader.Components || {};

    const COLLAPSE_KEY = 'enhanced_downloader_featured_collapsed';
    const EXPAND_IMAGE_KEY = 'enhanced_downloader_featured_expand_image';
    const EXPAND_VIDEO_KEY = 'enhanced_downloader_featured_expand_video';

    function createModelCard(model) {
        const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
        const downloads = Array.isArray(model.downloads) ? model.downloads : [];

        const card = document.createElement('div');
        card.className = 'model-block model-block-hoverable enhanced-downloader-featured-card';
        if (model.isRecommended) {
            card.classList.add('ed-featured-recommended');
        }

        const badgeHtml = model.isRecommended
            ? ' <span class="enhanced-downloader-featured-badge">Recommended</span>'
            : '';

        const chips = [model.architecture, model.scale, model.author].filter(Boolean);
        const chipsStr = chips.map(t => escapeHtml(t)).join(' | ');

        const noteHtml = model.note
            ? `<div class="enhanced-downloader-featured-note">${escapeHtml(model.note)}</div>`
            : '';

        const header = document.createElement('div');
        header.innerHTML = `
            <div><b>${escapeHtml(model.name || '')}</b>${badgeHtml}</div>
            <div class="enhanced-downloader-featured-chips">${chipsStr}</div>
            ${noteHtml}
        `;
        while (header.firstChild) card.appendChild(header.firstChild);

        // Actions row: version selector + download + open
        if (downloads.length > 0) {
            const actions = document.createElement('div');
            actions.className = 'ed-model-actions';

            const select = document.createElement('select');
            select.className = 'auto-dropdown enhanced-downloader-featured-select';
            select.autocomplete = 'off';
            for (const dl of downloads) {
                const opt = document.createElement('option');
                opt.value = dl.url || '';
                opt.textContent = dl.label || dl.url || '';
                select.appendChild(opt);
            }
            actions.appendChild(select);

            const dlBtn = document.createElement('button');
            dlBtn.type = 'button';
            dlBtn.className = 'basic-button enhanced-downloader-smallbtn';
            dlBtn.innerHTML = '<span class="translate">Download</span>';
            dlBtn.onclick = () => {
                if (utils && select.value) utils.loadUrlIntoManualDownloader(select.value);
            };
            actions.appendChild(dlBtn);

            const openBtn = document.createElement('a');
            openBtn.className = 'basic-button enhanced-downloader-smallbtn';
            openBtn.target = '_blank';
            openBtn.rel = 'noreferrer';
            openBtn.innerHTML = '<span class="translate">Open</span>';
            openBtn.href = select.value || '#';
            select.addEventListener('change', () => {
                openBtn.href = select.value || '#';
            });
            actions.appendChild(openBtn);

            card.appendChild(actions);
        }
        return card;
    }

    function buildColumn(title, models, expandKey) {
        const col = document.createElement('div');
        col.className = 'enhanced-downloader-featured-column';

        const header = document.createElement('div');
        header.className = 'enhanced-downloader-featured-group-header';
        header.textContent = title;
        col.appendChild(header);

        if (models.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'enhanced-downloader-featured-empty';
            empty.textContent = 'No models in this category.';
            col.appendChild(empty);
            return col;
        }

        const list = document.createElement('div');
        list.className = 'enhanced-downloader-featured-list';
        col.appendChild(list);

        for (let i = 0; i < models.length; i++) {
            const card = createModelCard(models[i]);
            if (i > 0) card.classList.add('ed-featured-collapsible');
            list.appendChild(card);
        }

        if (models.length > 1) {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'basic-button enhanced-downloader-smallbtn enhanced-downloader-featured-expand-btn';

            const isExpanded = localStorage.getItem(expandKey) === 'true';
            const updateToggle = (expanded) => {
                const collapsible = list.querySelectorAll('.ed-featured-collapsible');
                for (const el of collapsible) {
                    el.style.display = expanded ? '' : 'none';
                }
                toggleBtn.textContent = expanded
                    ? 'Show less'
                    : `Show ${models.length - 1} more`;
            };

            updateToggle(isExpanded);

            toggleBtn.onclick = () => {
                const nowExpanded = localStorage.getItem(expandKey) !== 'true';
                localStorage.setItem(expandKey, nowExpanded ? 'true' : 'false');
                updateToggle(nowExpanded);
            };

            col.appendChild(toggleBtn);
        }

        return col;
    }

    window.EnhancedDownloader.Components.FeaturedModels = {
        tryEmbed: function tryEmbed() {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || !utils.genericRequestAsync) return false;

            const wrapper = document.querySelector('.model-downloader-section-wrapper');
            if (!wrapper) return false;
            if (wrapper.dataset.enhancedDownloaderFeaturedDone) return true;

            const rightCol = wrapper.querySelector('.enhanced-downloader-col-right');
            if (!rightCol) return false;

            wrapper.dataset.enhancedDownloaderFeaturedDone = 'true';

            const card = document.createElement('div');
            card.className = 'card border-secondary mb-3 enhanced-downloader-featured-section';
            card.innerHTML = `
                <div class="card-header">
                    <span class="translate">Recommended Models</span>
                    <span class="enhanced-downloader-featured-toggle-wrap">
                        <button type="button" class="basic-button enhanced-downloader-smallbtn ed-featured-toggle">Hide</button>
                    </span>
                </div>
                <div class="card-body enhanced-downloader-featured-body-wrap">
                    <div class="enhanced-downloader-featured-about">
                        Models recommended in the SwarmUI docs. Pick a version from the dropdown then hit Download to load it into the manual downloader.
                        See the <a href="https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Model%20Support.md" target="_blank" rel="noreferrer">Image Model Support</a>
                        and <a href="https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Video%20Model%20Support.md" target="_blank" rel="noreferrer">Video Model Support</a> docs for more details.
                    </div>
                    <div class="enhanced-downloader-featured-loading">Loading...</div>
                    <div class="enhanced-downloader-featured-columns"></div>
                </div>
            `;

            const bodyWrap = card.querySelector('.enhanced-downloader-featured-body-wrap');
            const toggleBtn = card.querySelector('.ed-featured-toggle');
            const loadingEl = card.querySelector('.enhanced-downloader-featured-loading');
            const columnsEl = card.querySelector('.enhanced-downloader-featured-columns');

            // Collapse entire section
            const isCollapsed = localStorage.getItem(COLLAPSE_KEY) === 'true';
            if (isCollapsed) {
                bodyWrap.style.display = 'none';
                toggleBtn.textContent = 'Show';
            }
            toggleBtn.onclick = () => {
                const hidden = bodyWrap.style.display === 'none';
                bodyWrap.style.display = hidden ? '' : 'none';
                toggleBtn.textContent = hidden ? 'Hide' : 'Show';
                localStorage.setItem(COLLAPSE_KEY, hidden ? 'false' : 'true');
            };

            // Insert before the browse card
            const browseCard = rightCol.querySelector('.enhanced-downloader-browser-card');
            if (browseCard) {
                rightCol.insertBefore(card, browseCard);
            } else {
                rightCol.insertBefore(card, rightCol.firstChild);
            }

            // Load data
            utils.genericRequestAsync('EnhancedDownloaderGetFeaturedModels', {}).then(resp => {
                loadingEl.style.display = 'none';
                if (!resp || !resp.success || !Array.isArray(resp.models) || resp.models.length === 0) {
                    columnsEl.innerHTML = '<div class="enhanced-downloader-featured-empty">No featured models available.</div>';
                    return;
                }

                const imageModels = resp.models.filter(m => m.category === 'image');
                const videoModels = resp.models.filter(m => m.category === 'video');

                columnsEl.appendChild(buildColumn('Image Models', imageModels, EXPAND_IMAGE_KEY));
                columnsEl.appendChild(buildColumn('Video Models', videoModels, EXPAND_VIDEO_KEY));

                if (typeof applyTranslations === 'function') {
                    applyTranslations(card);
                }
            }).catch(() => {
                loadingEl.textContent = 'Failed to load featured models.';
            });

            return true;
        }
    };
})();
