(function () {
    'use strict';

    const RECENTS_KEY = 'enhanced_downloader_recent_folders_v1';
    let downloadRoots = null;
    let civitaiBrowserState = {
        page: 1,
        totalPages: 1,
        cursor: '',
        cursorStack: [],
        hasNextCursor: false,
        nextCursor: '',
        lastQuery: '',
        lastType: 'All',
        lastBaseModel: 'All',
        lastSort: 'Most Downloaded',
        lastIncludeNsfw: false,
        inflight: false
    };

    function genericRequestAsync(url, in_data) {
        return new Promise((resolve, reject) => {
            if (typeof genericRequest !== 'function') {
                reject('genericRequest is not available');
                return;
            }
            genericRequest(url, in_data, data => resolve(data), 0, e => reject(e));
        });
    }

    function stripHtmlToText(html) {
        if (!html) {
            return '';
        }
        try {
            const div = document.createElement('div');
            div.innerHTML = `${html}`;
            const text = (div.textContent || div.innerText || '').replaceAll(/\s+/g, ' ').trim();
            return text;
        }
        catch {
            return `${html}`.replaceAll(/<[^>]*>/g, '').replaceAll(/\s+/g, ' ').trim();
        }
    }

    async function loadDownloadRoots() {
        if (downloadRoots || typeof genericRequest !== 'function') {
            return;
        }
        try {
            const resp = await genericRequestAsync('EnhancedDownloaderGetDownloadRoots', {});
            if (resp && resp.success && resp.roots) {
                downloadRoots = resp.roots;
            }
        }
        catch {
            // ignore
        }
    }

    function getRecents() {
        try {
            const raw = localStorage.getItem(RECENTS_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string' && x.length > 0) : [];
        }
        catch {
            return [];
        }
    }

    function addRecent(folderPath) {
        if (!folderPath || folderPath === '(None)') {
            return;
        }
        const recents = getRecents();
        const cleaned = folderPath.trim();
        const without = recents.filter(x => x !== cleaned);
        without.unshift(cleaned);
        localStorage.setItem(RECENTS_KEY, JSON.stringify(without.slice(0, 12)));
    }

    function injectRecentsIntoFolderSelect(select) {
        if (!select) {
            return;
        }
        const recents = getRecents();
        if (!recents.length) {
            return;
        }
        const existing = new Set([...select.querySelectorAll('option')].map(o => o.value));
        const noneOpt = select.querySelector('option');
        const firstChild = noneOpt || select.firstChild;
        const group = document.createElement('optgroup');
        group.label = 'Recent';
        for (const path of recents) {
            if (existing.has(path)) {
                continue;
            }
            const opt = document.createElement('option');
            opt.value = path;
            opt.textContent = path;
            group.appendChild(opt);
        }
        if (!group.children.length) {
            return;
        }
        select.insertBefore(group, firstChild);
    }

    function tryEnhanceFolderUI() {
        if (!window.modelDownloader || !modelDownloader.folders) {
            return false;
        }
        const folders = modelDownloader.folders;
        if (folders.dataset.enhancedDownloaderDone) {
            return true;
        }
        folders.dataset.enhancedDownloaderDone = 'true';

        const origBuild = modelDownloader.buildFolderSelector.bind(modelDownloader);
        modelDownloader.buildFolderSelector = (selector) => {
            origBuild(selector);
            injectRecentsIntoFolderSelect(selector);
        };

        const destination = document.createElement('div');
        destination.className = 'enhanced-downloader-destination';
        destination.innerHTML = `
            <div class="enhanced-downloader-destination-label"><span class="translate">Destination</span></div>
            <div class="enhanced-downloader-destination-path"><span class="path"></span></div>
            <div class="enhanced-downloader-destination-crumbs"></div>
        `;
        const destinationPath = destination.querySelector('.path');
        const destinationCrumbs = destination.querySelector('.enhanced-downloader-destination-crumbs');

        const newWrap = document.createElement('div');
        newWrap.className = 'enhanced-downloader-new-folder';
        newWrap.innerHTML = `
            <button type="button" class="basic-button enhanced-downloader-smallbtn">New Folder</button>
            <span class="enhanced-downloader-new-folder-inline" style="display:none">
                <input type="text" class="auto-text" placeholder="SDXL/LoRAs/Characters" />
                <button type="button" class="basic-button enhanced-downloader-smallbtn">Add</button>
            </span>
        `;
        const toggleBtn = newWrap.querySelector('button');
        const inline = newWrap.querySelector('.enhanced-downloader-new-folder-inline');
        const input = inline.querySelector('input');
        const addBtn = inline.querySelectorAll('button')[0];

        const updatePreview = () => {
            const type = modelDownloader.type ? modelDownloader.type.value : '';
            const rootRaw = downloadRoots && downloadRoots[type] ? `${downloadRoots[type]}` : '';
            const root = (rootRaw || type).replaceAll('\\', '/').replaceAll(/\/+/g, '/').replace(/\/$/, '');
            const folder = folders.value && folders.value !== '(None)' ? folders.value : '';
            const nameVal = modelDownloader.name ? (modelDownloader.name.value || '') : '';

            const combined = `${root}/${folder ? folder + '/' : ''}${nameVal}`.replaceAll('\\', '/').replaceAll(/\/+/g, '/');
            destinationPath.textContent = combined;

            while (destinationCrumbs.firstChild) {
                destinationCrumbs.removeChild(destinationCrumbs.firstChild);
            }

            const addChip = (label, value, cls) => {
                const span = document.createElement('span');
                span.className = `enhanced-downloader-chip${cls ? ' ' + cls : ''}`;
                span.textContent = label ? `${label}: ${value}` : value;
                destinationCrumbs.appendChild(span);
            };

            addChip('Root', root, 'enhanced-downloader-chip-root');
            if (folder) {
                addChip('Folder', folder, 'enhanced-downloader-chip-folder');
            }
            const nameParts = nameVal.split('/').filter(p => p && p.length);
            if (nameParts.length > 1) {
                addChip('From name', nameParts.slice(0, -1).join('/'), 'enhanced-downloader-chip-namefolders');
            }
            addChip('File', (nameParts.length ? nameParts[nameParts.length - 1] : (nameVal || '(unnamed)')), 'enhanced-downloader-chip-file');
        };

        toggleBtn.onclick = () => {
            inline.style.display = inline.style.display === 'none' ? 'inline-flex' : 'none';
            if (inline.style.display !== 'none') {
                input.focus();
                input.select();
            }
        };

        const addFolder = () => {
            const raw = (input.value || '').trim().replaceAll('\\', '/');
            if (!raw) {
                return;
            }
            const safe = raw.replaceAll(/\s+/g, '_').replaceAll(/\/+/g, '/').replace(/\/$/, '');
            const has = [...folders.querySelectorAll('option')].some(o => o.value === safe);
            if (!has) {
                const opt = document.createElement('option');
                opt.value = safe;
                opt.textContent = safe;
                folders.appendChild(opt);
            }
            folders.value = safe;
            addRecent(safe);
            updatePreview();
        };
        addBtn.onclick = addFolder;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addFolder();
            }
        });

        folders.addEventListener('change', () => {
            addRecent(folders.value);
            updatePreview();
        });
        if (modelDownloader.type) {
            modelDownloader.type.addEventListener('change', updatePreview);
        }
        if (modelDownloader.name) {
            modelDownloader.name.addEventListener('input', updatePreview);
            modelDownloader.name.addEventListener('change', updatePreview);
        }

        if (modelDownloader.nameInput && !modelDownloader.nameInput._enhancedDownloaderWrapped) {
            const origNameInput = modelDownloader.nameInput.bind(modelDownloader);
            const wrapped = () => {
                origNameInput();
                updatePreview();
            };
            wrapped._enhancedDownloaderWrapped = true;
            modelDownloader.nameInput = wrapped;
        }

        if (modelDownloader.urlInput && !modelDownloader.urlInput._enhancedDownloaderWrapped) {
            const origUrlInput = modelDownloader.urlInput.bind(modelDownloader);
            const wrapped = () => {
                origUrlInput();
                updatePreview();
            };
            wrapped._enhancedDownloaderWrapped = true;
            modelDownloader.urlInput = wrapped;
        }

        folders.insertAdjacentElement('afterend', newWrap);
        if (modelDownloader.name) {
            modelDownloader.name.insertAdjacentElement('afterend', destination);
        }
        else {
            newWrap.insertAdjacentElement('afterend', destination);
        }

        modelDownloader.reloadFolders();
        updatePreview();
        return true;
    }

    function tryEnhanceUrlUI() {
        if (!window.modelDownloader || !modelDownloader.url) {
            return false;
        }
        const url = modelDownloader.url;
        if (url.dataset.enhancedDownloaderDone) {
            return true;
        }
        url.dataset.enhancedDownloaderDone = 'true';

        const btnWrap = document.createElement('span');
        btnWrap.className = 'enhanced-downloader-url-actions';
        btnWrap.innerHTML = `
            <button type="button" class="basic-button enhanced-downloader-smallbtn">Paste</button>
            <button type="button" class="basic-button enhanced-downloader-smallbtn">Clear</button>
        `;
        const [pasteBtn, clearBtn] = btnWrap.querySelectorAll('button');
        pasteBtn.onclick = async () => {
            if (!navigator.clipboard || !navigator.clipboard.readText) {
                return;
            }
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    url.value = text.trim();
                    modelDownloader.urlInput();
                }
            }
            catch {
                // ignore
            }
        };
        clearBtn.onclick = () => {
            url.value = '';
            modelDownloader.urlInput();
        };
        url.insertAdjacentElement('afterend', btnWrap);
        return true;
    }

    function tryEmbedDownloadsPanel() {
        const wrapper = document.querySelector('.model-downloader-section-wrapper');
        const main = document.querySelector('.model-downloader-main-section');
        const sidebar = document.getElementById('model_downloader_right_sidebar');
        if (!wrapper || !main || !sidebar) {
            return false;
        }
        if (wrapper.dataset.enhancedDownloaderDownloadsDone) {
            return true;
        }
        wrapper.dataset.enhancedDownloaderDownloadsDone = 'true';

        if (!wrapper.dataset.enhancedDownloaderLayoutDone) {
            const topCard = document.querySelector('#Utilities-ModelDownloader-Tab > .card.border-secondary');
            if (topCard) {
                topCard.classList.add('enhanced-downloader-topcard');
                topCard.style.display = 'none';
            }

            const layout = document.createElement('div');
            layout.className = 'enhanced-downloader-layout';
            const left = document.createElement('div');
            left.className = 'enhanced-downloader-col enhanced-downloader-col-left';
            const right = document.createElement('div');
            right.className = 'enhanced-downloader-col enhanced-downloader-col-right';
            layout.appendChild(left);
            layout.appendChild(right);
            wrapper.insertBefore(layout, wrapper.firstChild);
            left.appendChild(main);
            right.appendChild(sidebar);

            const leftInfo = document.createElement('div');
            leftInfo.className = 'enhanced-downloader-section-info';
            leftInfo.innerHTML = `
<div class="ed-info-title">Manual Download</div>
<ul class="ed-info-list">
  <li><b>Purpose:</b> Download a model from a direct URL into Swarm’s model folders.</li>
  <li><b>Allowed files:</b> <code>.safetensors</code> and <code>.gguf</code> only.</li>
  <li><b>Hugging Face:</b> Paste a direct file URL.</li>
  <li><b>CivitAI:</b> Paste any CivitAI model/file URL; Swarm will auto-load metadata.</li>
  <li><b>Direct links:</b> Non-HF/CivitAI links must be direct downloads (not HTML pages).</li>
</ul>`;
            left.insertBefore(leftInfo, left.firstChild);

            const rightInfo = document.createElement('div');
            rightInfo.className = 'enhanced-downloader-section-info';
            rightInfo.innerHTML = `
<div class="ed-info-title">Model Browser</div>
<ul class="ed-info-list">
  <li><b>Source:</b> CivitAI model search + filters.</li>
  <li><b>Download:</b> Pick a result and download directly into your Swarm model folders.</li>
  <li><b>Gated models:</b> If you see <b>401 Unauthorized</b>, enter your CivitAI API key and retry.</li>
  <li><b>Tip:</b> Use filters (type/base model/sort) to narrow results before paging.</li>
</ul>`;
            right.insertBefore(rightInfo, right.firstChild);

            wrapper.dataset.enhancedDownloaderLayoutDone = 'true';
        }

        const leftCol = wrapper.querySelector('.enhanced-downloader-col-left');
        if (!leftCol) {
            return false;
        }

        const card = document.createElement('div');
        card.className = 'card border-secondary mb-3 enhanced-downloader-downloads-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="translate">Downloads</span>
                <span class="enhanced-downloader-downloads-controls">
                    <label class="enhanced-downloader-toggle"><input type="checkbox" class="ed-show-completed" /> <span class="translate">Show completed</span></label>
                </span>
            </div>
            <div class="card-body enhanced-downloader-downloads-body"></div>
        `;
        const body = card.querySelector('.enhanced-downloader-downloads-body');
        const showCompleted = card.querySelector('.ed-show-completed');

        sidebar.classList.add('enhanced-downloader-downloads-zone');
        body.appendChild(sidebar);

        showCompleted.onchange = () => {
            sidebar.classList.toggle('enhanced-downloader-show-completed', showCompleted.checked);
        };

        leftCol.appendChild(card);
        return true;
    }

    function tryEmbedCivitaiBrowserPanel() {
        const wrapper = document.querySelector('.model-downloader-section-wrapper');
        const main = document.querySelector('.model-downloader-main-section');
        if (!wrapper || !main) {
            return false;
        }
        if (wrapper.dataset.enhancedDownloaderBrowserDone) {
            return true;
        }

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
                        <select class="auto-dropdown ed-provider" autocomplete="off">
                            <option value="civitai" class="translate" selected>CivitAI</option>
                        </select>
                        <input type="text" class="auto-text ed-query" placeholder="Search CivitAI..." autocomplete="off" />
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

        const provider = card.querySelector('.ed-provider');
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

        const updatePager = () => {
            const isQueryMode = !!(civitaiBrowserState.lastQuery && civitaiBrowserState.lastQuery.trim().length);
            if (isQueryMode) {
                const pageIndex = (civitaiBrowserState.cursorStack.length + 1);
                pageInfo.textContent = `${pageIndex}`;
                prev.disabled = civitaiBrowserState.cursorStack.length === 0 || civitaiBrowserState.inflight;
                next.disabled = !civitaiBrowserState.hasNextCursor || civitaiBrowserState.inflight;
                prev.style.display = civitaiBrowserState.cursorStack.length === 0 ? 'none' : '';
                next.style.display = civitaiBrowserState.hasNextCursor ? '' : 'none';
            }
            else {
                pageInfo.textContent = `${civitaiBrowserState.page} / ${civitaiBrowserState.totalPages}`;
                prev.disabled = civitaiBrowserState.page <= 1 || civitaiBrowserState.inflight;
                next.disabled = civitaiBrowserState.page >= civitaiBrowserState.totalPages || civitaiBrowserState.inflight;
                prev.style.display = civitaiBrowserState.page <= 1 ? 'none' : '';
                next.style.display = civitaiBrowserState.page >= civitaiBrowserState.totalPages ? 'none' : '';
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

        const doDownload = (modelId, modelVersionId, civitType) => {
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

        const render = (items) => {
            while (results.firstChild) {
                results.removeChild(results.firstChild);
            }
            for (const item of items) {
                renderId++;
                const div = document.createElement('div');
                div.className = 'model-block model-block-hoverable enhanced-downloader-model-card';
                const img = document.createElement('img');
                img.src = item.image || 'imgs/model_placeholder.jpg';
                div.appendChild(img);
                const textBlock = document.createElement('div');
                textBlock.className = 'model-descblock';
                const downloadsStr = typeof item.downloads === 'number' ? `${item.downloads}` : '';
                const baseStr = item.baseModel ? `${escapeHtml(item.baseModel)}` : '';
                const creatorStr = item.creator ? `${escapeHtml(item.creator)}` : '';
                const openUrl = `https://civitai.com/models/${encodeURIComponent(item.modelId)}?modelVersionId=${encodeURIComponent(item.modelVersionId)}`;
                const descText = stripHtmlToText(item.description || '');
                const descHtml = descText ? `<div class="ed-model-desc">${escapeHtml(descText)}</div>` : '';
                textBlock.innerHTML = `
                    <b>${escapeHtml(item.name || '')}</b>
                    ${item.versionName ? `<br>${escapeHtml(item.versionName)}` : ''}
                    <br>${escapeHtml(item.type || '')}${baseStr ? ` | ${baseStr}` : ''}${creatorStr ? ` | ${creatorStr}` : ''}${downloadsStr ? ` | ${downloadsStr} downloads` : ''}
                    ${descHtml}
                `;
                div.appendChild(textBlock);

                const popoverId = `enhanced-downloader-civitai-${renderId}`;
                const menuDiv = createDiv(`popover_${popoverId}`, 'sui-popover sui_popover_model');

                const btnDownload = document.createElement('div');
                btnDownload.className = 'sui_popover_model_button';
                btnDownload.innerText = 'Download';
                btnDownload.onclick = () => doDownload(item.modelId, item.modelVersionId, item.type);
                menuDiv.appendChild(btnDownload);

                const btnOpen = document.createElement('a');
                btnOpen.className = 'sui_popover_model_button';
                btnOpen.innerText = 'Open';
                btnOpen.href = openUrl;
                btnOpen.target = '_blank';
                btnOpen.rel = 'noreferrer';
                menuDiv.appendChild(btnOpen);

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
            if (civitaiBrowserState.inflight) {
                return;
            }
            const newQuery = query.value || '';
            const newType = type.value || 'All';
            const newBaseModel = baseModel.value || 'All';
            const newSort = sort.value || 'Most Downloaded';
            const newNsfw = !!nsfw.checked;

            const wasQueryMode = !!(civitaiBrowserState.lastQuery && civitaiBrowserState.lastQuery.trim().length);
            const willQueryMode = !!(newQuery && newQuery.trim().length);
            const filtersChanged =
                civitaiBrowserState.lastQuery !== newQuery
                || civitaiBrowserState.lastType !== newType
                || civitaiBrowserState.lastBaseModel !== newBaseModel
                || civitaiBrowserState.lastSort !== newSort
                || civitaiBrowserState.lastIncludeNsfw !== newNsfw;

            civitaiBrowserState.lastQuery = newQuery;
            civitaiBrowserState.lastType = type.value || 'All';
            if (civitaiBrowserState.lastType === 'ControlNet') {
                civitaiBrowserState.lastType = 'Controlnet';
            }
            civitaiBrowserState.lastBaseModel = baseModel.value || 'All';
            civitaiBrowserState.lastSort = sort.value || 'Most Downloaded';
            civitaiBrowserState.lastIncludeNsfw = !!nsfw.checked;

            if (filtersChanged) {
                civitaiBrowserState.page = 1;
                civitaiBrowserState.totalPages = 1;
                civitaiBrowserState.cursor = '';
                civitaiBrowserState.cursorStack = [];
                civitaiBrowserState.hasNextCursor = false;
                civitaiBrowserState.nextCursor = '';
            }

            if (!willQueryMode) {
                if (setPage != null) {
                    civitaiBrowserState.page = setPage;
                }
            }
            else {
                // Cursor-based pagination: ignore any page changes.
                civitaiBrowserState.page = 1;
                civitaiBrowserState.totalPages = 1;
            }

            status.textContent = 'Loading...';
            civitaiBrowserState.inflight = true;
            updatePager();
            try {
                const resp = await genericRequestAsync('EnhancedDownloaderCivitaiSearch', {
                    query: civitaiBrowserState.lastQuery,
                    page: civitaiBrowserState.page,
                    limit: 24,
                    cursor: willQueryMode ? civitaiBrowserState.cursor : '',
                    type: civitaiBrowserState.lastType,
                    baseModel: civitaiBrowserState.lastBaseModel,
                    sort: civitaiBrowserState.lastSort,
                    includeNsfw: civitaiBrowserState.lastIncludeNsfw
                });
                if (!resp || resp.error || !resp.success) {
                    status.textContent = resp && resp.error ? `${resp.error}` : 'Failed to load.';
                    render([]);
                    civitaiBrowserState.totalPages = 1;
                    civitaiBrowserState.hasNextCursor = false;
                    civitaiBrowserState.nextCursor = '';
                }
                else {
                    const mode = resp.mode || (willQueryMode ? 'cursor' : 'page');
                    if (mode === 'cursor') {
                        civitaiBrowserState.nextCursor = (resp.nextCursor || '').trim();
                        civitaiBrowserState.hasNextCursor = civitaiBrowserState.nextCursor.length > 0;
                    }
                    else {
                        civitaiBrowserState.page = resp.page || civitaiBrowserState.page;
                        civitaiBrowserState.totalPages = resp.totalPages || 1;
                        civitaiBrowserState.hasNextCursor = false;
                        civitaiBrowserState.nextCursor = '';
                    }
                    status.textContent = `Found ${resp.totalItems || 0} results`;
                    render(resp.items || []);
                }
            }
            catch (e) {
                status.textContent = 'Failed to load.';
                render([]);
                civitaiBrowserState.hasNextCursor = false;
                civitaiBrowserState.nextCursor = '';
            }
            civitaiBrowserState.inflight = false;
            updatePager();
        };

        provider.onchange = () => runSearch(1);
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
            const isQueryMode = !!(civitaiBrowserState.lastQuery && civitaiBrowserState.lastQuery.trim().length);
            if (isQueryMode) {
                if (civitaiBrowserState.cursorStack.length === 0) {
                    return;
                }
                civitaiBrowserState.cursor = civitaiBrowserState.cursorStack.pop();
                civitaiBrowserState.nextCursor = '';
                civitaiBrowserState.hasNextCursor = false;
                runSearch(null);
            }
            else {
                runSearch(Math.max(1, civitaiBrowserState.page - 1));
            }
        };
        next.onclick = () => {
            const isQueryMode = !!(civitaiBrowserState.lastQuery && civitaiBrowserState.lastQuery.trim().length);
            if (isQueryMode) {
                if (!civitaiBrowserState.hasNextCursor || !civitaiBrowserState.nextCursor) {
                    return;
                }
                civitaiBrowserState.cursorStack.push(civitaiBrowserState.cursor || '');
                civitaiBrowserState.cursor = civitaiBrowserState.nextCursor;
                civitaiBrowserState.nextCursor = '';
                civitaiBrowserState.hasNextCursor = false;
                runSearch(null);
            }
            else {
                runSearch(Math.min(civitaiBrowserState.totalPages, civitaiBrowserState.page + 1));
            }
        };

        wrapper.dataset.enhancedDownloaderBrowserDone = 'true';
        const rightCol = wrapper.querySelector('.enhanced-downloader-col-right');
        (rightCol || main).appendChild(card);
        applyTranslations(card);
        updatePager();
        runSearch(1);
        return true;
    }

    function enhanceModelDownloader401Message() {
        if (!window.ActiveModelDownload || !ActiveModelDownload.prototype || !ActiveModelDownload.prototype.download) {
            return;
        }
        if (ActiveModelDownload.prototype.download._enhancedDownloaderWrapped401) {
            return;
        }
        const orig = ActiveModelDownload.prototype.download;
        const wrapped = function () {
            const originalStatusText = this.statusText;
            const originalSetBorder = this.setBorderColor;
            const originalIsDone = this.isDone;
            const originalDownload = orig.bind(this);
            this.download = originalDownload;
            try {
                const oldStatus = this.statusText;
                const oldIsDone = this.isDone;
                const oldSetBorder = this.setBorderColor;
                const oldCancel = this.cancelButton;
                const that = this;
                const oldMakeWSRequest = window.makeWSRequest;
                if (typeof oldMakeWSRequest === 'function') {
                    window.makeWSRequest = function (name, payload, onData, timeout, onError, onOpen) {
                        if (name === 'DoModelDownloadWS' && typeof onError === 'function') {
                            const wrappedErr = function (e) {
                                if (that && that.url && `${that.url}`.startsWith('https://civitai.com/') && (`${e}`.includes('401') || `${e}`.toLowerCase().includes('unauthorized'))) {
                                    const link = `<a href="#" onclick="getRequiredElementById('usersettingstabbutton').click();getRequiredElementById('userinfotabbutton').click();">Click here to enter your CivitAI API key</a>`;
                                    const hint = `This download returned <b>401 Unauthorized</b>. This usually means the file is gated and requires a CivitAI API key.<br>${link}, then retry.`;
                                    oldStatus.innerHTML = `Error: ${escapeHtml(e)}\n<br>${hint}<br><br><button class="basic-button" title="Restart the download" style="width:98%">Retry</button><br><br>`;
                                    oldStatus.querySelector('button').onclick = () => {
                                        that.download();
                                    };
                                    oldSetBorder.call(that, '#aa0000');
                                    oldIsDone.call(that);
                                    return;
                                }
                                return onError(e);
                            };
                            return oldMakeWSRequest(name, payload, onData, timeout, wrappedErr, onOpen);
                        }
                        return oldMakeWSRequest(name, payload, onData, timeout, onError, onOpen);
                    };
                    try {
                        return orig.call(that);
                    }
                    finally {
                        window.makeWSRequest = oldMakeWSRequest;
                    }
                }
            }
            catch {
                // ignore
            }
            return orig.call(this);
        };
        wrapped._enhancedDownloaderWrapped401 = true;
        ActiveModelDownload.prototype.download = wrapped;
    }

    async function enhancedDownloaderInit() {
        await loadDownloadRoots();
        enhanceModelDownloader401Message();
        const start = Date.now();
        while (Date.now() - start < 15000) {
            if (tryEmbedDownloadsPanel() && tryEnhanceUrlUI() && tryEnhanceFolderUI() && tryEmbedCivitaiBrowserPanel()) {
                break;
            }
            await new Promise(r => setTimeout(r, 100));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhancedDownloaderInit);
    }
    else {
        enhancedDownloaderInit();
    }
})();
