(function () {
    'use strict';

    window.ModelBrowser = window.ModelBrowser || {};
    window.ModelBrowser.Components = window.ModelBrowser.Components || {};

    const COLLAPSE_KEY = 'enhanced_downloader_featured_collapsed';
    const EXPAND_IMAGE_KEY = 'enhanced_downloader_featured_expand_image';
    const EXPAND_VIDEO_KEY = 'enhanced_downloader_featured_expand_video';
    const EXPAND_AUDIO_KEY = 'enhanced_downloader_featured_expand_audio';

    function createModelCard(model) {
        const utils = window.ModelBrowser && window.ModelBrowser.Utils;
        const downloads = Array.isArray(model.downloads) ? model.downloads : [];

        const card = document.createElement('div');
        card.className = 'model-block model-block-hoverable model-browser-featured-card';
        if (model.isRecommended) {
            card.classList.add('ed-featured-recommended');
        }

        const badgeHtml = model.isRecommended
            ? ' <span class="model-browser-featured-badge translate">Recommended</span>'
            : '';

        const chips = [model.architecture, model.scale, model.author].filter(Boolean);
        const chipsStr = chips.map(t => escapeHtml(t)).join(' | ');

        const noteHtml = model.note
            ? `<div class="model-browser-featured-note">${escapeHtml(model.note)}</div>`
            : '';

        const header = document.createElement('div');
        header.innerHTML = `
            <div><b>${escapeHtml(model.name || '')}</b>${badgeHtml}</div>
            <div class="model-browser-featured-chips">${chipsStr}</div>
            ${noteHtml}
        `;
        while (header.firstChild) card.appendChild(header.firstChild);

        if (downloads.length > 0) {
            const actions = document.createElement('div');
            actions.className = 'ed-model-actions';

            const select = document.createElement('select');
            select.className = 'auto-dropdown model-browser-featured-select';
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
            dlBtn.className = 'basic-button model-browser-smallbtn';
            dlBtn.innerHTML = '<span class="translate">Download</span>';
            dlBtn.onclick = () => {
                if (utils && select.value) utils.loadUrlIntoManualDownloader(select.value);
            };
            actions.appendChild(dlBtn);

            const openBtn = document.createElement('a');
            openBtn.className = 'basic-button model-browser-smallbtn';
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
        col.className = 'model-browser-featured-column';

        const header = document.createElement('div');
        header.className = 'model-browser-featured-group-header';
        header.textContent = translate(title);
        col.appendChild(header);

        if (models.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'model-browser-featured-empty';
            empty.textContent = translate('No models in this category.');
            col.appendChild(empty);
            return col;
        }

        const list = document.createElement('div');
        list.className = 'model-browser-featured-list';
        col.appendChild(list);

        for (let i = 0; i < models.length; i++) {
            const card = createModelCard(models[i]);
            if (i > 0) card.classList.add('ed-featured-collapsible');
            list.appendChild(card);
        }

        if (models.length > 1) {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'basic-button model-browser-smallbtn model-browser-featured-expand-btn';

            const isExpanded = localStorage.getItem(expandKey) === 'true';
            const updateToggle = (expanded) => {
                const collapsible = list.querySelectorAll('.ed-featured-collapsible');
                for (const el of collapsible) {
                    el.style.display = expanded ? '' : 'none';
                }
                toggleBtn.textContent = expanded
                    ? translate('Show less')
                    : `${translate('Show')} ${models.length - 1} ${translate('more')}`;
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

    window.ModelBrowser.Components.FeaturedModels = {
        tryEmbed: function tryEmbed() {
            const utils = window.ModelBrowser && window.ModelBrowser.Utils;
            if (!utils || !utils.genericRequestAsync) return false;

            const wrapper = document.querySelector('.model-downloader-section-wrapper');
            if (!wrapper) return false;
            if (wrapper.dataset.modelBrowserFeaturedDone) return true;

            const rightCol = wrapper.querySelector('.model-browser-col-right');
            if (!rightCol) return false;

            wrapper.dataset.modelBrowserFeaturedDone = 'true';

            const card = document.createElement('div');
            card.className = 'card border-secondary mb-3 model-browser-featured-section';
            card.innerHTML = `
                <div class="card-header">
                    <span class="translate">Recommended Models</span>
                    <span class="model-browser-featured-toggle-wrap">
                        <button type="button" class="basic-button model-browser-smallbtn ed-featured-toggle">Hide</button>
                    </span>
                </div>
                <div class="card-body model-browser-featured-body-wrap">
                    <div class="model-browser-featured-about translate">
                        Models recommended in the SwarmUI docs. Pick a version from the dropdown then hit Download to load it into the manual downloader.
                        See the <a href="https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Model%20Support.md" target="_blank" rel="noreferrer">Image Model Support</a>
                        <a href="https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Video%20Model%20Support.md" target="_blank" rel="noreferrer">Video Model Support</a>,
                        and <a href="https://github.com/mcmonkeyprojects/SwarmUI/blob/master/docs/Audio%20Model%20Support.md" target="_blank" rel="noreferrer">Audio Model Support</a> docs for more details.
                    </div>
                    <div class="model-browser-featured-loading">${translate('Loading...')}</div>
                    <div class="model-browser-featured-columns"></div>
                </div>
            `;

            const bodyWrap = card.querySelector('.model-browser-featured-body-wrap');
            const toggleBtn = card.querySelector('.ed-featured-toggle');
            const loadingEl = card.querySelector('.model-browser-featured-loading');
            const columnsEl = card.querySelector('.model-browser-featured-columns');

            const isCollapsed = localStorage.getItem(COLLAPSE_KEY) === 'true';
            toggleBtn.textContent = translate(isCollapsed ? 'Show' : 'Hide');
            if (isCollapsed) {
                bodyWrap.style.display = 'none';
            }
            toggleBtn.onclick = () => {
                const hidden = bodyWrap.style.display === 'none';
                bodyWrap.style.display = hidden ? '' : 'none';
                toggleBtn.textContent = translate(hidden ? 'Hide' : 'Show');
                localStorage.setItem(COLLAPSE_KEY, hidden ? 'false' : 'true');
            };

            const browseCard = rightCol.querySelector('.model-browser-browser-card');
            if (browseCard) {
                rightCol.insertBefore(card, browseCard);
            } else {
                rightCol.insertBefore(card, rightCol.firstChild);
            }

            utils.genericRequestAsync('ModelBrowserGetFeaturedModels', {}).then(resp => {
                loadingEl.style.display = 'none';
                if (!resp || !resp.success || !Array.isArray(resp.models) || resp.models.length === 0) {
                    columnsEl.textContent = '';
                    const empty = document.createElement('div');
                    empty.className = 'model-browser-featured-empty';
                    empty.textContent = translate('No featured models available.');
                    columnsEl.appendChild(empty);
                    if (typeof applyTranslations === 'function') {
                        applyTranslations(card);
                    }
                    return;
                }

                const imageModels = resp.models.filter(m => m.category === 'image');
                const videoModels = resp.models.filter(m => m.category === 'video');
                const audioModels = resp.models.filter(m => m.category === 'audio');

                columnsEl.appendChild(buildColumn('Image Models', imageModels, EXPAND_IMAGE_KEY));
                columnsEl.appendChild(buildColumn('Video Models', videoModels, EXPAND_VIDEO_KEY));
                if (audioModels.length > 0) {
                    columnsEl.appendChild(buildColumn('Audio Models', audioModels, EXPAND_AUDIO_KEY));
                }

                if (typeof applyTranslations === 'function') {
                    applyTranslations(card);
                }
            }).catch(() => {
                loadingEl.textContent = translate('Failed to load featured models.');
            });

            return true;
        }
    };
})();
