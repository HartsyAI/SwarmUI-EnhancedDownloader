(function () {
    'use strict';

    // Placeholder file for future model browser component logic.

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Components = window.EnhancedDownloader.Components || {};

    function getProvider(id) {
        const prov = window.EnhancedDownloader.Providers && window.EnhancedDownloader.Providers[id];
        return prov || null;
    }

    function listProvidersInOrder() {
        const providers = window.EnhancedDownloader.Providers || {};
        const order = ['civitai', 'huggingface', 'hartsy'];
        const result = [];
        for (const id of order) {
            if (providers[id]) {
                result.push(providers[id]);
            }
        }
        for (const id of Object.keys(providers)) {
            if (!order.includes(id)) {
                result.push(providers[id]);
            }
        }
        return result;
    }

    function createBrowserCard() {
        const card = document.createElement('div');
        card.className = 'card border-secondary mb-3 enhanced-downloader-browser-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="translate">Browse Models</span>
            </div>
            <div class="card-body">
                <div class="enhanced-downloader-browser-controls">
                    <div class="enhanced-downloader-browser-row">
                        <span class="translate">Source</span>:
                        <select class="auto-dropdown ed-provider" autocomplete="off"></select>
                        <input type="text" class="auto-text ed-query" placeholder="Search..." autocomplete="off" />
                        <button type="button" class="basic-button enhanced-downloader-smallbtn ed-search"><span class="translate">Search</span></button>
                    </div>
                    <div class="enhanced-downloader-browser-row">
                        <span class="translate">Filters</span>:
                        <select class="auto-dropdown ed-type" autocomplete="off">
                            <option value="All" class="translate" selected>All</option>
                            <option value="Checkpoint">Checkpoint</option>
                            <option value="LORA">LoRA</option>
                            <option value="LoCon">LoCon</option>
                            <option value="LyCORIS">LyCORIS</option>
                            <option value="TextualInversion">Textual Inversion</option>
                            <option value="ControlNet">ControlNet</option>
                            <option value="VAE">VAE</option>
                        </select>
                        <select class="auto-dropdown ed-basemodel" autocomplete="off">
                            <option value="All" class="translate" selected>All</option>
                            <option value="SD 1.5">SD 1.5</option>
                            <option value="SDXL 1.0">SDXL 1.0</option>
                            <option value="Pony">Pony</option>
                            <option value="Illustrious">Illustrious</option>
                            <option value="Flux.1 D">Flux.1 D</option>
                        </select>
                        <select class="auto-dropdown ed-sort" autocomplete="off">
                            <option value="Most Downloaded" selected>Most Downloaded</option>
                            <option value="Newest">Newest</option>
                            <option value="Highest Rated">Highest Rated</option>
                        </select>
                        <label class="enhanced-downloader-toggle"><input type="checkbox" class="ed-nsfw" /> <span class="translate">NSFW</span></label>
                    </div>
                </div>
                <div class="enhanced-downloader-browser-status"></div>
                <div class="enhanced-downloader-browser-results browser-content-container"></div>
                <div class="enhanced-downloader-browser-pager">
                    <button type="button" class="basic-button enhanced-downloader-smallbtn ed-prev"><span class="translate">Prev</span></button>
                    <span class="ed-pageinfo"></span>
                    <button type="button" class="basic-button enhanced-downloader-smallbtn ed-next"><span class="translate">Next</span></button>
                </div>
            </div>
        `;
        return card;
    }

    window.EnhancedDownloader.Components.ModelBrowser = {
        tryEmbed: function tryEmbed() {
            const utils = window.EnhancedDownloader.Utils;
            if (!utils) {
                return false;
            }

            const wrapper = document.querySelector('.model-downloader-section-wrapper');
            const main = document.querySelector('.model-downloader-main-section');
            if (!wrapper || !main) {
                return false;
            }
            if (wrapper.dataset.enhancedDownloaderBrowserDone) {
                return true;
            }

            const providers = listProvidersInOrder();
            if (!providers.length) {
                return false;
            }

            const card = createBrowserCard();
            const providerSelect = card.querySelector('.ed-provider');
            const query = card.querySelector('.ed-query');
            const searchBtn = card.querySelector('.ed-search');
            const type = card.querySelector('.ed-type');
            const baseModel = card.querySelector('.ed-basemodel');
            const sort = card.querySelector('.ed-sort');
            const nsfw = card.querySelector('.ed-nsfw');
            const status = card.querySelector('.enhanced-downloader-browser-status');
            const results = card.querySelector('.enhanced-downloader-browser-results');
            const prev = card.querySelector('.ed-prev');
            const next = card.querySelector('.ed-next');
            const pageInfo = card.querySelector('.ed-pageinfo');

            for (const p of providers) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.displayName || p.id;
                if (p.id === 'civitai') {
                    opt.selected = true;
                }
                providerSelect.appendChild(opt);
            }

            const state = {
                inflight: false,
                providerId: providerSelect.value || providers[0].id,
                // Cursor paging (HF / CivitAI query-mode)
                cursor: '',
                cursorStack: [],
                hasNextCursor: false,
                nextCursor: '',
                // Page paging (CivitAI non-query, Hartsy)
                page: 1,
                totalPages: 1,
                hasMore: false, // For providers that use hasMore instead of totalPages
                // Last query/filters
                lastQuery: '',
                lastType: 'All',
                lastBaseModel: 'All',
                lastSort: 'Most Downloaded',
                lastIncludeNsfw: false
            };

            const isProviderCursorPaged = () => {
                const prov = getProvider(state.providerId);
                if (!prov) {
                    return false;
                }
                // Hartsy uses page-based pagination
                if (prov.id === 'hartsy') {
                    return false;
                }
                if (prov.id !== 'civitai') {
                    return true;
                }
                return !!(state.lastQuery && state.lastQuery.trim().length);
            };

            // Store default CivitAI base model options
            const defaultBaseModelOptions = [
                { value: 'All', label: 'All' },
                { value: 'SD 1.5', label: 'SD 1.5' },
                { value: 'SDXL 1.0', label: 'SDXL 1.0' },
                { value: 'Pony', label: 'Pony' },
                { value: 'Illustrious', label: 'Illustrious' },
                { value: 'Flux.1 D', label: 'Flux.1 D' }
            ];

            // Store default sort options
            const defaultSortOptions = [
                { value: 'Most Downloaded', label: 'Most Downloaded' },
                { value: 'Newest', label: 'Newest' },
                { value: 'Highest Rated', label: 'Highest Rated' }
            ];

            // Hartsy sort options
            const hartsySortOptions = [
                { value: 'popular', label: 'Most Popular' },
                { value: 'newest', label: 'Newest' },
                { value: 'downloads', label: 'Most Downloads' }
            ];

            const populateSelect = (selectEl, options, selectedValue) => {
                const currentValue = selectedValue || selectEl.value;
                selectEl.innerHTML = '';
                for (const opt of options) {
                    const optEl = document.createElement('option');
                    optEl.value = opt.value;
                    optEl.textContent = opt.label;
                    if (opt.value === currentValue) {
                        optEl.selected = true;
                    }
                    selectEl.appendChild(optEl);
                }
            };

            const updateProviderUI = async () => {
                const prov = getProvider(state.providerId);
                const isFilterable = !!(prov && prov.supportsFilters);
                const isNsfw = !!(prov && prov.supportsNsfw);

                // Set placeholder based on provider
                if (prov && prov.id === 'huggingface') {
                    query.placeholder = 'Search Hugging Face...';
                } else if (prov && prov.id === 'hartsy') {
                    query.placeholder = 'Search Hartsy...';
                } else {
                    query.placeholder = 'Search...';
                }

                // Handle type filter (CivitAI only)
                type.disabled = !(prov && prov.id === 'civitai');

                // Handle base model / architecture filter
                baseModel.disabled = !isFilterable;
                if (prov && prov.id === 'hartsy' && prov.getArchitectureOptions) {
                    // Load Hartsy architectures dynamically
                    try {
                        const archOptions = await prov.getArchitectureOptions();
                        const options = archOptions.map(a => ({ value: a, label: a }));
                        populateSelect(baseModel, options, 'All');
                    } catch (e) {
                        console.warn('Failed to load Hartsy architecture options:', e);
                        populateSelect(baseModel, [{ value: 'All', label: 'All' }], 'All');
                    }
                } else if (prov && prov.id === 'civitai') {
                    // Restore CivitAI options
                    populateSelect(baseModel, defaultBaseModelOptions, state.lastBaseModel || 'All');
                }

                // Handle sort options
                sort.disabled = !isFilterable;
                if (prov && prov.id === 'hartsy') {
                    populateSelect(sort, hartsySortOptions, 'popular');
                } else if (prov && prov.id === 'civitai') {
                    populateSelect(sort, defaultSortOptions, state.lastSort || 'Most Downloaded');
                }

                // Handle NSFW toggle
                nsfw.disabled = !isNsfw;
                if (!isNsfw) {
                    nsfw.checked = false;
                }
            };

            const updatePager = () => {
                const prov = getProvider(state.providerId);
                if (isProviderCursorPaged()) {
                    const pageIndex = (state.cursorStack.length + 1);
                    pageInfo.textContent = `Page ${pageIndex}`;
                    prev.disabled = state.cursorStack.length <= 0 || state.inflight;
                    next.disabled = !state.hasNextCursor || state.inflight;
                }
                else if (prov && prov.id === 'hartsy') {
                    // Hartsy uses hasMore flag instead of totalPages
                    pageInfo.textContent = `Page ${state.page}`;
                    prev.disabled = state.page <= 1 || state.inflight;
                    next.disabled = !state.hasMore || state.inflight;
                }
                else {
                    pageInfo.textContent = `Page ${state.page} / ${state.totalPages}`;
                    prev.disabled = state.page <= 1 || state.inflight;
                    next.disabled = state.page >= state.totalPages || state.inflight;
                }
            };

            const modelTypeToSwarmSubtype = (civitType) => {
                if (civitType === 'Checkpoint') {
                    return 'Stable-Diffusion';
                }
                if (['LORA', 'LoCon', 'LyCORIS'].includes(civitType)) {
                    return 'LoRA';
                }
                if (civitType === 'TextualInversion') {
                    return 'Embedding';
                }
                if (civitType === 'ControlNet') {
                    return 'ControlNet';
                }
                if (civitType === 'VAE') {
                    return 'VAE';
                }
                return modelDownloader && modelDownloader.type ? modelDownloader.type.value : 'Stable-Diffusion';
            };

            const doCivitaiDownload = (modelId, modelVersionId, civitType) => {
                if (!window.modelDownloader || typeof modelDownloader.getCivitaiMetadata !== 'function') {
                    return;
                }
                const versId = modelVersionId ? `${modelVersionId}` : null;
                modelDownloader.getCivitaiMetadata(`${modelId}`, versId, (rawData, rawVersion, metadata, modelType, url, img, imgs, errMsg) => {
                    if (!rawData) {
                        status.textContent = `Failed to load metadata. ${errMsg || ''}`;
                        return;
                    }
                    const typeToUse = modelType || modelTypeToSwarmSubtype(civitType);
                    const safeName = `${rawData.name} - ${rawVersion.name}`.replaceAll(/[\|\\\/\:\*\?\"\<\>\|\,\.\&\!\[\]\(\)]/g, '-');
                    const folder = modelDownloader.folders && modelDownloader.folders.value !== '(None)' ? modelDownloader.folders.value : '';
                    const fullName = folder ? `${folder}/${safeName}` : safeName;
                    const metaText = metadata ? JSON.stringify(metadata) : '';
                    const download = new ActiveModelDownload(modelDownloader, fullName, url, img, typeToUse, metaText);
                    download.download();
                }, '', true);
            };

            let renderId = 0;

            const hfImageCache = new Map();
            const hfImageInflight = new Map();
            const hfImageQueue = [];
            let hfImageActive = 0;
            const hfImageMax = 4;

            const hfQueuePump = () => {
                while (hfImageActive < hfImageMax && hfImageQueue.length > 0) {
                    const task = hfImageQueue.shift();
                    if (!task) {
                        continue;
                    }
                    hfImageActive++;
                    task().finally(() => {
                        hfImageActive--;
                        hfQueuePump();
                    });
                }
            };

            const hfGetImage = async (modelId) => {
                const key = `${modelId || ''}`;
                if (!key) {
                    return '';
                }
                if (hfImageCache.has(key)) {
                    return hfImageCache.get(key) || '';
                }
                if (hfImageInflight.has(key)) {
                    return await hfImageInflight.get(key);
                }
                const p = (async () => {
                    try {
                        const resp = await utils.genericRequestAsync('EnhancedDownloaderHuggingFaceImage', { modelId: key });
                        const img = resp && resp.success ? (resp.image || '') : '';
                        hfImageCache.set(key, img);
                        return img;
                    }
                    catch {
                        hfImageCache.set(key, '');
                        return '';
                    }
                    finally {
                        hfImageInflight.delete(key);
                    }
                })();
                hfImageInflight.set(key, p);
                return await p;
            };

            const hfApplyToManualDownloader = async (item, bestDownloadUrl, openUrl) => {
                try {
                    if (!utils || typeof utils.setManualDownloaderInfo !== 'function') {
                        return;
                    }

                    const title = `${item && item.name ? item.name : (item && item.modelId ? item.modelId : '')}`;
                    const modelId = item && item.modelId ? `${item.modelId}` : '';
                    const descText = utils.stripHtmlToText((item && item.description) ? item.description : '');
                    const link = openUrl ? `${openUrl}` : '';

                    const infoHtml = `
                        <b>Hugging Face Metadata</b>
                        ${title ? `<br><b>Model</b>: ${escapeHtml(title)}` : ''}
                        ${modelId ? `<br><b>Model ID</b>: ${escapeHtml(modelId)}` : ''}
                        ${link ? `<br><b>Link</b>: <a href="${link}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a>` : ''}
                        ${descText ? `<br><b>Description</b>: ${escapeHtml(descText)}` : ''}
                    `;

                    const rawMeta = JSON.stringify({
                        'modelspec.title': title || modelId || '',
                        'modelspec.description': link ? `From ${link}\n${descText || ''}` : (descText || ''),
                        'modelspec.thumbnail': ''
                    }, null, 2);

                    // Swarm's urlInput() clears metadataZone for HF links; set URL first, then re-apply.
                    utils.loadUrlIntoManualDownloader(bestDownloadUrl || openUrl);
                    utils.setManualDownloaderInfo(infoHtml, rawMeta, '');

                    if (modelId) {
                        const img = await hfGetImage(modelId);
                        if (img) {
                            const rawMetaWithThumb = JSON.stringify({
                                'modelspec.title': title || modelId || '',
                                'modelspec.description': link ? `From ${link}\n${descText || ''}` : (descText || ''),
                                'modelspec.thumbnail': img
                            }, null, 2);
                            utils.setManualDownloaderInfo(infoHtml, rawMetaWithThumb, img);
                        }
                    }
                }
                catch {
                    // ignore
                }
            };

            const hfLoadIntoImg = (imgEl, modelId) => {
                if (!imgEl || !modelId) {
                    return;
                }
                const rid = `${renderId}`;
                const task = async () => {
                    const image = await hfGetImage(modelId);
                    if (!image) {
                        return;
                    }
                    if (imgEl.dataset && imgEl.dataset.renderId && imgEl.dataset.renderId !== rid) {
                        return;
                    }
                    imgEl.src = image;
                };
                hfImageQueue.push(task);
                hfQueuePump();
            };

            const render = (items) => {
                while (results.firstChild) {
                    results.removeChild(results.firstChild);
                }
                for (const item of (items || [])) {
                    renderId++;
                    const div = document.createElement('div');
                    div.className = 'model-block model-block-hoverable enhanced-downloader-model-card';

                    const img = document.createElement('img');
                    img.dataset.renderId = `${renderId}`;
                    img.src = item.image || 'imgs/model_placeholder.jpg';
                    img.title = 'Click to load into Manual Download';
                    div.appendChild(img);

                    if ((state.providerId || '') === 'huggingface' && item.modelId && (!item.image || `${item.image}`.startsWith('imgs/'))) {
                        hfLoadIntoImg(img, item.modelId);
                    }

                    const textBlock = document.createElement('div');
                    textBlock.className = 'model-descblock';

                    const downloadsStr = typeof item.downloads === 'number' ? `${item.downloads}` : '';
                    const baseStr = item.baseModel ? `${escapeHtml(item.baseModel)}` : '';
                    const creatorStr = item.creator ? `${escapeHtml(item.creator)}` : '';
                    const openUrl = item.openUrl ? `${item.openUrl}` : '';
                    const downloadOptions = Array.isArray(item.downloadOptions) ? item.downloadOptions : [];
                    const bestDownloadUrl = item.downloadUrl
                        ? `${item.downloadUrl}`
                        : (downloadOptions.length > 0 && downloadOptions[0] && downloadOptions[0].downloadUrl ? `${downloadOptions[0].downloadUrl}` : '');
                    const descText = utils.stripHtmlToText(item.description || '');
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

                    img.addEventListener('click', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if ((state.providerId || '') === 'huggingface') {
                            hfApplyToManualDownloader(item, bestDownloadUrl, openUrl);
                        }
                        else {
                            utils.loadUrlIntoManualDownloader(bestDownloadUrl || openUrl);
                        }
                    });

                    const downloadBtnInline = textBlock.querySelector('.ed-model-download');
                    if (downloadBtnInline) {
                        downloadBtnInline.onclick = () => {
                            if ((state.providerId || '') === 'civitai') {
                                doCivitaiDownload(item.modelId, item.modelVersionId, item.type);
                            }
                            else if ((state.providerId || '') === 'huggingface') {
                                hfApplyToManualDownloader(item, bestDownloadUrl, openUrl);
                            }
                            else {
                                utils.loadUrlIntoManualDownloader(bestDownloadUrl || openUrl);
                            }
                        };
                    }

                    const popoverId = `enhanced-downloader-model-${renderId}`;
                    const menuDiv = createDiv(`popover_${popoverId}`, 'sui-popover sui_popover_model');

                    const btnDownload = document.createElement('div');
                    btnDownload.className = 'sui_popover_model_button';
                    btnDownload.innerText = 'Download';
                    btnDownload.onclick = () => {
                        if ((state.providerId || '') === 'civitai') {
                            doCivitaiDownload(item.modelId, item.modelVersionId, item.type);
                        }
                        else if ((state.providerId || '') === 'huggingface') {
                            hfApplyToManualDownloader(item, bestDownloadUrl, openUrl);
                        }
                        else {
                            utils.loadUrlIntoManualDownloader(bestDownloadUrl || openUrl);
                        }
                    };
                    menuDiv.appendChild(btnDownload);

                    if ((state.providerId || '') === 'huggingface' && item.modelId) {
                        const loadAllBtn = document.createElement('div');
                        loadAllBtn.className = 'sui_popover_model_button';
                        loadAllBtn.innerText = 'Load all files...';
                        loadAllBtn.onclick = async () => {
                            if (loadAllBtn.dataset.loading === 'true') {
                                return;
                            }
                            loadAllBtn.dataset.loading = 'true';
                            const oldText = loadAllBtn.innerText;
                            loadAllBtn.innerText = 'Loading...';
                            try {
                                const resp = await utils.genericRequestAsync('EnhancedDownloaderHuggingFaceFiles', {
                                    modelId: `${item.modelId}`,
                                    limit: 2000
                                });
                                if (!resp || !resp.success || !Array.isArray(resp.files)) {
                                    loadAllBtn.innerText = 'Failed to load files';
                                    return;
                                }
                                const existing = new Set();
                                if (Array.isArray(downloadOptions)) {
                                    for (const opt of downloadOptions) {
                                        if (opt && opt.downloadUrl) {
                                            existing.add(`${opt.downloadUrl}`);
                                        }
                                    }
                                }
                                let added = 0;
                                for (const opt of resp.files) {
                                    if (!opt || !opt.downloadUrl) {
                                        continue;
                                    }
                                    const dl = `${opt.downloadUrl}`;
                                    if (existing.has(dl)) {
                                        continue;
                                    }
                                    existing.add(dl);
                                    const optBtn = document.createElement('div');
                                    optBtn.className = 'sui_popover_model_button';
                                    optBtn.innerText = opt.fileName ? `Download: ${opt.fileName}` : 'Download File';
                                    optBtn.onclick = () => {
                                        if ((state.providerId || '') === 'huggingface') {
                                            hfApplyToManualDownloader(item, dl, openUrl);
                                        }
                                        else {
                                            utils.loadUrlIntoManualDownloader(dl);
                                        }
                                    };
                                    menuDiv.insertBefore(optBtn, loadAllBtn.nextSibling);
                                    added++;
                                }
                                loadAllBtn.innerText = added > 0 ? `Loaded ${added} files` : 'No additional files';
                            }
                            catch {
                                loadAllBtn.innerText = 'Failed to load files';
                            }
                        };
                        menuDiv.appendChild(loadAllBtn);
                    }

                    if ((state.providerId || '') !== 'civitai' && downloadOptions.length > 0) {
                        for (const opt of downloadOptions) {
                            if (!opt || !opt.downloadUrl) {
                                continue;
                            }
                            const optBtn = document.createElement('div');
                            optBtn.className = 'sui_popover_model_button';
                            optBtn.innerText = opt.fileName ? `Download: ${opt.fileName}` : 'Download File';
                            optBtn.onclick = () => {
                                if ((state.providerId || '') === 'huggingface') {
                                    hfApplyToManualDownloader(item, `${opt.downloadUrl}`, openUrl);
                                }
                                else {
                                    utils.loadUrlIntoManualDownloader(`${opt.downloadUrl}`);
                                }
                            };
                            menuDiv.appendChild(optBtn);
                        }
                    }

                    if (openUrl) {
                        const btnOpen = document.createElement('a');
                        btnOpen.className = 'sui_popover_model_button';
                        btnOpen.innerText = 'Open';
                        btnOpen.href = openUrl;
                        btnOpen.target = '_blank';
                        btnOpen.rel = 'noreferrer';
                        menuDiv.appendChild(btnOpen);
                    }

                    const addCopy = (label, value) => {
                        const btn = document.createElement('div');
                        btn.className = 'sui_popover_model_button';
                        btn.innerText = label;
                        btn.onclick = async () => {
                            await utils.tryCopyText(value);
                        };
                        menuDiv.appendChild(btn);
                    };

                    if (openUrl) {
                        addCopy('Copy Model Link', openUrl);
                    }
                    if (item.downloadUrl) {
                        addCopy('Copy Download Link', item.downloadUrl);
                    }
                    if (downloadOptions.length > 0) {
                        for (const opt of downloadOptions) {
                            if (opt && opt.downloadUrl && opt.fileName) {
                                addCopy(`Copy Download Link: ${opt.fileName}`, `${opt.downloadUrl}`);
                            }
                        }
                    }
                    if (item.modelId) {
                        addCopy('Copy Model ID', `${item.modelId}`);
                    }
                    if (item.modelVersionId) {
                        addCopy('Copy Version ID', `${item.modelVersionId}`);
                    }
                    if (item.fileName) {
                        addCopy('Copy Filename', `${item.fileName}`);
                    }
                    if (item.fileSize) {
                        addCopy('Copy File Size (bytes)', `${item.fileSize}`);
                    }

                    results.appendChild(menuDiv);

                    const menu = createDiv(null, 'model-block-menu-button');
                    menu.innerHTML = '&#x2630;';
                    menu.addEventListener('click', () => {
                        doPopover(popoverId);
                    });
                    div.appendChild(menu);

                    results.appendChild(div);
                }
                applyTranslations(results);
            };

            const runSearch = async (setPage = null) => {
                if (state.inflight) {
                    return;
                }
                const prov = getProvider(state.providerId);
                if (!prov) {
                    return;
                }

                const newQuery = query.value || '';
                const newType = type.value || 'All';
                const newBaseModel = baseModel.value || 'All';
                const newSort = sort.value || 'Most Downloaded';
                const newNsfw = !!nsfw.checked;

                const filterable = !!prov.supportsFilters;

                const filtersChanged =
                    state.lastQuery !== newQuery
                    || (filterable && state.lastType !== newType)
                    || (filterable && state.lastBaseModel !== newBaseModel)
                    || (filterable && state.lastSort !== newSort)
                    || (prov.supportsNsfw && state.lastIncludeNsfw !== newNsfw);

                state.lastQuery = newQuery;
                if (filterable) {
                    state.lastType = newType;
                    if (state.lastType === 'ControlNet') {
                        state.lastType = 'Controlnet';
                    }
                    state.lastBaseModel = newBaseModel;
                    state.lastSort = newSort;
                }
                state.lastIncludeNsfw = prov.supportsNsfw ? newNsfw : false;

                if (filtersChanged) {
                    state.page = 1;
                    state.totalPages = 1;
                    state.cursor = '';
                    state.cursorStack = [];
                    state.hasNextCursor = false;
                    state.nextCursor = '';
                }

                if (!isProviderCursorPaged()) {
                    if (setPage != null) {
                        state.page = setPage;
                    }
                }
                else {
                    // Cursor mode: ignore page changes.
                    state.page = 1;
                    state.totalPages = 1;
                }

                status.textContent = 'Loading...';
                state.inflight = true;
                updatePager();
                try {
                    const resp = await prov.search({
                        query: state.lastQuery,
                        page: state.page,
                        limit: 24,
                        cursor: isProviderCursorPaged() ? state.cursor : '',
                        type: state.lastType,
                        baseModel: state.lastBaseModel,
                        sort: state.lastSort,
                        includeNsfw: state.lastIncludeNsfw
                    });

                    if (!resp || resp.error || !resp.success) {
                        status.textContent = resp && resp.error ? `${resp.error}` : 'Failed to load.';
                        render([]);
                        state.totalPages = 1;
                        state.hasNextCursor = false;
                        state.nextCursor = '';
                    }
                    else {
                        const mode = resp.mode || (isProviderCursorPaged() ? 'cursor' : 'page');
                        if (mode === 'cursor') {
                            state.nextCursor = (resp.nextCursor || '').trim();
                            state.hasNextCursor = state.nextCursor.length > 0;
                        }
                        else {
                            state.page = resp.page || state.page;
                            state.totalPages = resp.totalPages || 1;
                            state.hasMore = resp.hasMore || false;
                            state.hasNextCursor = false;
                            state.nextCursor = '';
                        }
                        status.textContent = `Found ${resp.totalItems || 0} results`;
                        render(resp.items || []);
                    }
                }
                catch (e) {
                    status.textContent = 'Failed to load.';
                    render([]);
                    state.hasNextCursor = false;
                    state.nextCursor = '';
                }
                state.inflight = false;
                updatePager();
            };

            providerSelect.onchange = async () => {
                state.providerId = providerSelect.value || state.providerId;
                await updateProviderUI();
                runSearch(1);
            };
            searchBtn.onclick = () => runSearch(1);
            query.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    runSearch(1);
                }
            });
            type.onchange = () => runSearch(1);
            baseModel.onchange = () => runSearch(1);
            sort.onchange = () => runSearch(1);
            nsfw.onchange = () => runSearch(1);

            prev.onclick = () => {
                if (isProviderCursorPaged()) {
                    if (state.cursorStack.length === 0) {
                        return;
                    }
                    state.cursor = state.cursorStack.pop() || '';
                    state.nextCursor = '';
                    state.hasNextCursor = false;
                    runSearch(null);
                }
                else {
                    runSearch(Math.max(1, state.page - 1));
                }
            };
            next.onclick = () => {
                const prov = getProvider(state.providerId);
                if (isProviderCursorPaged()) {
                    if (!state.hasNextCursor || !state.nextCursor) {
                        return;
                    }
                    state.cursorStack.push(state.cursor || '');
                    state.cursor = state.nextCursor;
                    state.nextCursor = '';
                    state.hasNextCursor = false;
                    runSearch(null);
                }
                else if (prov && prov.id === 'hartsy') {
                    // Hartsy uses hasMore flag
                    if (!state.hasMore) {
                        return;
                    }
                    runSearch(state.page + 1);
                }
                else {
                    runSearch(Math.min(state.totalPages, state.page + 1));
                }
            };

            wrapper.dataset.enhancedDownloaderBrowserDone = 'true';
            const rightCol = wrapper.querySelector('.enhanced-downloader-col-right');
            (rightCol || main).appendChild(card);
            applyTranslations(card);
            // Initialize UI (async but don't block)
            updateProviderUI().then(() => {
                updatePager();
                runSearch(1);
            });
            return true;
        }
    };
})();
