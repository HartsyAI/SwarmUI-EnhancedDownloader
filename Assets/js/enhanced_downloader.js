(function () {
    'use strict';

    const RECENTS_KEY = 'enhanced_downloader_recent_folders_v1';
    const MAX_RECENT_FOLDERS = 12;
    const DOM_READY_TIMEOUT_MS = 15000;
    const DOM_RETRY_INTERVAL_INITIAL_MS = 100;
    const DOM_RETRY_INTERVAL_MAX_MS = 1000;
    let downloadRoots = null;

    async function loadDownloadRoots() {
        const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
        if (downloadRoots || !utils || typeof utils.genericRequestAsync !== 'function') {
            return;
        }
        try {
            const resp = await utils.genericRequestAsync('EnhancedDownloaderGetDownloadRoots', {});
            if (resp && resp.success && resp.roots) {
                downloadRoots = resp.roots;
            }
        }
        catch {
        }
    }

    let cachedRootTrim = null;

    function normalizePath(path) {
        return `${path || ''}`.replaceAll('\\', '/').replaceAll(/\/+/g, '/').replace(/\/$/, '');
    }

    function getRootTrim() {
        if (cachedRootTrim !== null) {
            return cachedRootTrim;
        }
        const paths = Object.values(downloadRoots || {}).map(normalizePath).filter(p => p);
        if (!paths.length) {
            return '';
        }
        if (paths.length === 1) {
            const parts = paths[0].split('/');
            cachedRootTrim = parts.slice(0, Math.max(0, parts.length - 2)).join('/');
            return cachedRootTrim;
        }
        const split = paths.map(p => p.split('/'));
        let shared = 0;
        while (split.every(parts => parts[shared] !== undefined && parts[shared] === split[0][shared])) {
            shared++;
        }
        cachedRootTrim = shared < 1 ? '' : split[0].slice(0, shared - 1).join('/');
        return cachedRootTrim;
    }

    function toDisplayRoot(absoluteRoot) {
        const root = normalizePath(absoluteRoot);
        const trim = getRootTrim();
        return trim && root.startsWith(`${trim}/`) ? root.slice(trim.length + 1) : root;
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
        localStorage.setItem(RECENTS_KEY, JSON.stringify(without.slice(0, MAX_RECENT_FOLDERS)));
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
        if (!window.modelDownloader) {
            return false;
        }
        if (!modelDownloader.folders && !modelDownloader.folderBrowser) {
            return false;
        }
        if (modelDownloader.folderBrowser && !modelDownloader.folders) {
            return true;
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
        `;
        const destinationPath = destination.querySelector('.path');

        const isOldDropdown = folders.tagName === 'SELECT' && !modelDownloader.folderBrowser;

        let newWrap = null;
        let toggleBtn = null;
        let inline = null;
        let input = null;
        let addBtn = null;

        if (isOldDropdown) {
            newWrap = document.createElement('div');
            newWrap.className = 'enhanced-downloader-new-folder';
            newWrap.innerHTML = `
                <button type="button" class="basic-button enhanced-downloader-smallbtn">New Folder</button>
                <span class="enhanced-downloader-new-folder-inline" style="display:none">
                    <input type="text" class="auto-text" placeholder="SDXL/LoRAs/Characters" />
                    <button type="button" class="basic-button enhanced-downloader-smallbtn">Add</button>
                </span>
            `;
            toggleBtn = newWrap.querySelector('button');
            inline = newWrap.querySelector('.enhanced-downloader-new-folder-inline');
            input = inline.querySelector('input');
            addBtn = inline.querySelectorAll('button')[0];
        }

        const updatePreview = () => {
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            const type = modelDownloader.type ? modelDownloader.type.value : '';
            const rootRaw = downloadRoots && downloadRoots[type] ? `${downloadRoots[type]}` : '';
            const root = rootRaw ? toDisplayRoot(rootRaw) : normalizePath(type);
            const folder = utils && utils.resolveSelectedFolder ? utils.resolveSelectedFolder(modelDownloader) : '';
            const nameVal = modelDownloader.name ? (modelDownloader.name.value || '') : '';

            const combined = `${root}/${folder ? folder + '/' : ''}${nameVal}`.replaceAll('\\', '/').replaceAll(/\/+/g, '/');
            destinationPath.textContent = combined;
        };

        if (isOldDropdown) {
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
                // Keep selectedFolder in sync too, or folder_browser_injection.js's run() wrapper overwrites this on download.
                if (window.modelDownloader) {
                    modelDownloader.selectedFolder = safe;
                    if (typeof modelDownloader.updateSelectedFolderDisplay === 'function') {
                        modelDownloader.updateSelectedFolderDisplay();
                    }
                }
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
        }

        if (isOldDropdown) {
            folders.addEventListener('change', () => {
                addRecent(folders.value);
                updatePreview();
            });
        }
        else {
            if (modelDownloader.selectFolder && !modelDownloader.selectFolder._enhancedDownloaderWrapped) {
                const origSelectFolder = modelDownloader.selectFolder.bind(modelDownloader);
                const wrapped = (folderPath) => {
                    origSelectFolder(folderPath);
                    addRecent(folderPath);
                    updatePreview();
                };
                wrapped._enhancedDownloaderWrapped = true;
                modelDownloader.selectFolder = wrapped;
            }
        }

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

        if (isOldDropdown) {
            folders.insertAdjacentElement('afterend', newWrap);
            if (modelDownloader.name) {
                modelDownloader.name.insertAdjacentElement('afterend', destination);
            }
            else {
                newWrap.insertAdjacentElement('afterend', destination);
            }
        }
        else {
            if (modelDownloader.name) {
                modelDownloader.name.insertAdjacentElement('afterend', destination);
            }
            else {
                folders.insertAdjacentElement('afterend', destination);
            }
        }

        modelDownloader.reloadFolders();
        updatePreview();
        return true;
    }

    // Matches both the old `hartsy.ai/models/<id>` page link and the current `hartsy.ai/Home?type=models&id=<id>` link,
    // since users may still have the old form saved/shared. Returns the model ID, or null if not a Hartsy model link.
    function extractHartsyModelId(rawUrl) {
        let parsed;
        try {
            parsed = new URL((rawUrl || '').trim());
        }
        catch {
            return null;
        }
        if (!/(^|\.)hartsy\.ai$/i.test(parsed.hostname)) {
            return null;
        }
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        if (pathParts[0] === 'models' && pathParts[1]) {
            return decodeURIComponent(pathParts[1]);
        }
        if (pathParts[0] === 'Home' && parsed.searchParams.get('type') === 'models') {
            const id = parsed.searchParams.get('id');
            if (id) {
                return id;
            }
        }
        return null;
    }

    function clearCoreVersionFileSelectors() {
        if (!window.modelDownloader) {
            return;
        }
        for (const [select, wrap] of [[modelDownloader.versionSelect, modelDownloader.versionWrap], [modelDownloader.fileSelect, modelDownloader.fileWrap]]) {
            if (select) {
                select.innerHTML = '';
                select.onchange = null;
            }
            if (wrap) {
                wrap.style.display = 'none';
            }
        }
    }

    // Hartsy model page links (copied from the site or pasted from "Copy Model Link") aren't direct file downloads and
    // carry no metadata core's urlInput() can parse - resolve them through the Hartsy API instead, mirroring how core
    // handles CivitAI links, so pasting one populates the real download URL, name, and info instead of going stale.
    function wrapUrlInputForHartsy() {
        if (!window.modelDownloader || typeof modelDownloader.urlInput !== 'function' || modelDownloader.urlInput._enhancedDownloaderHartsy) {
            return;
        }
        const origUrlInput = modelDownloader.urlInput.bind(modelDownloader);
        let requestToken = 0;
        const wrapped = () => {
            const myToken = ++requestToken;
            const modelId = extractHartsyModelId(modelDownloader.url.value);
            if (!modelId) {
                origUrlInput();
                return;
            }
            modelDownloader.metadataZone.innerHTML = '';
            modelDownloader.metadataZone.dataset.raw = '';
            delete modelDownloader.metadataZone.dataset.image;
            modelDownloader.imageSide.innerHTML = '';
            clearCoreVersionFileSelectors();
            modelDownloader.urlStatusArea.innerText = 'URL appears to be a Hartsy model link. Resolving download info...';
            modelDownloader.button.disabled = true;
            const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
            if (!utils || typeof utils.genericRequestAsync !== 'function') {
                origUrlInput();
                return;
            }
            Promise.all([
                utils.genericRequestAsync('EnhancedDownloaderHartsyDownload', { modelId }),
                // Details carries the preview (image/description/architecture); fetched separately since it's cacheable
                // and doesn't record a download analytics event the way the download-info call does. Best-effort - a
                // details failure shouldn't block resolving the actual download link below.
                utils.genericRequestAsync('EnhancedDownloaderHartsyModelDetails', { modelId }).catch(() => null)
            ]).then(([resp, details]) => {
                if (myToken !== requestToken) {
                    return;
                }
                const hasDetails = details && details.success;
                const title = (hasDetails && details.title) || (resp && resp.success && resp.title) || modelId;
                const cleanName = `${title}`.replaceAll(/[\\/:*?"<>|]/g, '-').replaceAll(' ', '_');
                modelDownloader.name.value = cleanName;
                modelDownloader.name.style.borderColor = '';

                // Hartsy has no CivitAI-style "type" field; LoRA vs checkpoint is inferred from the architecture
                // string (e.g. "qwen-image/lora"), per the same convention used in providers/hartsy.js.
                if (modelDownloader.type && hasDetails && details.architecture) {
                    modelDownloader.type.value = `${details.architecture}`.toLowerCase().endsWith('/lora') ? 'LoRA' : 'Stable-Diffusion';
                }

                if (hasDetails) {
                    const descText = stripHtmlToText(details.description || '');
                    const infoHtml = `
                        <b>Hartsy Metadata</b>
                        <br><b>Model</b>: ${escapeHtml(title)}
                        ${details.architecture ? `<br><b>Architecture</b>: ${escapeHtml(details.architecture)}` : ''}
                        ${details.author ? `<br><b>Author</b>: ${escapeHtml(details.author)}` : ''}
                        ${Array.isArray(details.tags) && details.tags.length ? `<br><b>Tags</b>: ${escapeHtml(details.tags.join(', '))}` : ''}
                        ${descText ? `<br><b>Description</b>: ${escapeHtml(descText)}` : ''}
                    `;
                    const rawMeta = JSON.stringify({
                        'modelspec.title': title,
                        'modelspec.description': `From https://hartsy.ai/Home?type=models&id=${modelId}\n${descText || ''}`,
                        'modelspec.architecture': details.architecture || '',
                    }, null, 2);
                    if (typeof utils.setManualDownloaderInfo === 'function') {
                        utils.setManualDownloaderInfo(infoHtml, rawMeta, details.image || '');
                    }
                }

                if (!resp || !resp.success || !resp.downloadUrl) {
                    modelDownloader.urlStatusArea.innerText = `Resolved "${title}" from Hartsy, but Hartsy has no direct download link available for this model yet.${resp && resp.error ? ` (${resp.error})` : ''}`;
                    modelDownloader.button.disabled = true;
                    return;
                }

                modelDownloader.url.value = utils.appendExtensionHint ? utils.appendExtensionHint(resp.downloadUrl, resp.fileName) : resp.downloadUrl;
                modelDownloader.urlStatusArea.innerText = 'URL appears to be a Hartsy model link, and has been resolved to a direct download link.';
                modelDownloader.nameInput();
            }).catch(() => {
                if (myToken !== requestToken) {
                    return;
                }
                modelDownloader.urlStatusArea.innerText = 'Failed to contact Hartsy to resolve this model link.';
                modelDownloader.button.disabled = true;
            });
        };
        wrapped._enhancedDownloaderHartsy = true;
        modelDownloader.urlInput = wrapped;
    }

    const SAMPLE_MODEL_POOL_SIZE = 50;

    function pickSampleHartsyModel(items) {
        const usable = items.filter(item => item && item.name && !item.isNsfw);
        if (!usable.length) {
            return null;
        }
        return usable[Math.floor(Math.random() * usable.length)];
    }

    function applySampleHartsyModel(item) {
        const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
        const title = `${item.name}`;
        const cleanName = title.replaceAll(/[\\/:*?"<>|]/g, '-').replaceAll(' ', '_');
        const architecture = `${item.baseModel || ''}`;
        const downloadUrl = `${item.downloadUrl || ''}`;

        if (modelDownloader.type && architecture) {
            modelDownloader.type.value = architecture.toLowerCase().endsWith('/lora') ? 'LoRA' : 'Stable-Diffusion';
            modelDownloader.type.dispatchEvent(new Event('change'));
        }
        modelDownloader.name.value = cleanName;
        modelDownloader.name.dispatchEvent(new Event('change'));

        if (downloadUrl) {
            modelDownloader.url.value = utils.appendExtensionHint ? utils.appendExtensionHint(downloadUrl, item.fileName) : downloadUrl;
            modelDownloader.nameInput();
            modelDownloader.urlStatusArea.innerText = `Showing a Hartsy model to get you started: ${title}. Paste your own URL over it any time.`;
        }
        else {
            modelDownloader.url.style.borderColor = '';
            modelDownloader.name.style.borderColor = '';
            modelDownloader.urlStatusArea.innerText = `Showing a Hartsy model to get you started: ${title}. Hartsy has not published a direct download link for this one yet, so paste a URL above to download something else.`;
        }

        if (typeof utils.setManualDownloaderInfo === 'function') {
            const descText = stripHtmlToText(item.description || '');
            const infoHtml = `
                <b>Hartsy Model</b>
                <br><b>Model</b>: ${escapeHtml(title)}
                ${architecture ? `<br><b>Architecture</b>: ${escapeHtml(architecture)}` : ''}
                ${item.creator ? `<br><b>Author</b>: ${escapeHtml(item.creator)}` : ''}
                ${item.fileName ? `<br><b>File</b>: ${escapeHtml(item.fileName)}` : ''}
                ${descText ? `<br><b>Description</b>: ${escapeHtml(descText)}` : ''}
            `;
            const rawMeta = JSON.stringify({
                'modelspec.title': title,
                'modelspec.description': `From ${item.openUrl || 'https://hartsy.ai'}\n${descText || ''}`,
                'modelspec.architecture': architecture,
            }, null, 2);
            utils.setManualDownloaderInfo(infoHtml, rawMeta, item.image || '');
        }
    }

    async function loadSampleHartsyModel() {
        const utils = window.EnhancedDownloader && window.EnhancedDownloader.Utils;
        if (!utils || typeof utils.genericRequestAsync !== 'function' || !window.modelDownloader) {
            return;
        }
        if (!modelDownloader.url || !modelDownloader.name) {
            return;
        }
        if (modelDownloader.url.value.trim() || modelDownloader.name.value.trim()) {
            return;
        }
        try {
            const resp = await utils.genericRequestAsync('EnhancedDownloaderHartsySearch', { limit: SAMPLE_MODEL_POOL_SIZE });
            if (!resp || !resp.success || !Array.isArray(resp.items)) {
                return;
            }
            const item = pickSampleHartsyModel(resp.items);
            if (!item || modelDownloader.url.value.trim() || modelDownloader.name.value.trim()) {
                return;
            }
            applySampleHartsyModel(item);
        }
        catch (e) {
            console.warn('Could not load a sample Hartsy model:', e);
        }
    }

    function tryArmSampleModelLoad() {
        const pane = document.getElementById('Utilities-ModelDownloader-Tab');
        if (!pane) {
            return false;
        }
        if (pane.dataset.enhancedDownloaderSampleArmed) {
            return true;
        }
        pane.dataset.enhancedDownloaderSampleArmed = 'true';
        let observer = null;
        let done = false;
        const runOnce = () => {
            if (done) {
                return;
            }
            done = true;
            if (observer) {
                observer.disconnect();
            }
            loadSampleHartsyModel();
        };
        if (pane.classList.contains('active')) {
            runOnce();
            return true;
        }
        observer = new MutationObserver(() => {
            if (pane.classList.contains('active')) {
                runOnce();
            }
        });
        observer.observe(pane, { attributes: true, attributeFilter: ['class'] });
        return true;
    }

    function tryEnhanceUrlUI() {
        if (!window.modelDownloader || !modelDownloader.url) {
            return false;
        }
        wrapUrlInputForHartsy();
        const url = modelDownloader.url;
        if (url.dataset.enhancedDownloaderDone || url.nextElementSibling?.classList?.contains('enhanced-downloader-url-actions')) {
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
        pasteBtn.title = 'Reads your clipboard. Some browsers (e.g. Firefox) show their own "Paste" confirmation popup to allow this - click that popup, or just press Ctrl+V in the field instead.';
        pasteBtn.onclick = async () => {
            const statusArea = window.modelDownloader ? modelDownloader.urlStatusArea : null;
            if (!navigator.clipboard || !navigator.clipboard.readText) {
                if (statusArea) {
                    statusArea.innerText = 'Clipboard access is not available in this browser. Paste into the URL field directly (Ctrl+V) instead.';
                }
                return;
            }
            try {
                const text = await navigator.clipboard.readText();
                if (text) {
                    url.value = text.trim();
                    modelDownloader.urlInput();
                }
                else if (statusArea) {
                    statusArea.innerText = 'Clipboard is empty.';
                }
            }
            catch (e) {
                console.warn('Clipboard read failed:', e);
                if (statusArea) {
                    statusArea.innerText = 'Clipboard access was blocked. If your browser showed a permission prompt, click Paste again, or paste into the URL field directly (Ctrl+V).';
                }
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
            wrapper.insertBefore(layout, wrapper.firstChild);
            left.appendChild(main);
            right.appendChild(sidebar);

            main.classList.add('enhanced-downloader-manual');
            const mainInner = main.querySelector(':scope > div');
            if (mainInner) {
                mainInner.classList.add('enhanced-downloader-manual-inner');
            }
            const leftInfo = document.createElement('div');
            leftInfo.className = 'enhanced-downloader-section-info ed-info-left';
            leftInfo.innerHTML = `
<div class="ed-info-title">Manual Download</div>
<ul class="ed-info-list">
  <li><b>Purpose:</b> Download a model from a direct URL into Swarm’s model folders.</li>
  <li><b>Allowed files:</b> <code>.safetensors</code>, <code>.gguf</code>, <code>.ckpt</code>, <code>.pt</code>, <code>.sft</code>.</li>
  <li><b>Metadata:</b> CivitAI, Hugging Face and Hartsy links load their details automatically.</li>
  <li><b>Anything else:</b> Must be a direct download URL, not the HTML page around it.</li>
</ul>`;

            const rightInfo = document.createElement('div');
            rightInfo.className = 'enhanced-downloader-section-info ed-info-right';
            rightInfo.innerHTML = `
<div class="ed-info-title">Model Browser</div>
<ul class="ed-info-list">
  <li><b>Sources:</b> Search Hartsy, CivitAI or Hugging Face, each with its own filters.</li>
  <li><b>Recommended:</b> The panel below tracks the models the SwarmUI docs recommend.</li>
  <li><b>Download:</b> Pick a result to load its URL into the manual downloader on the left.</li>
  <li><b>Gated models:</b> A <b>401</b> means that provider wants an API key; add one in User Settings.</li>
</ul>`;
            layout.append(leftInfo, left, rightInfo, right);

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

    function tryEmbedFeaturedModelsPanel() {
        const comp = window.EnhancedDownloader && window.EnhancedDownloader.Components && window.EnhancedDownloader.Components.FeaturedModels;
        if (!comp || typeof comp.tryEmbed !== 'function') {
            return false;
        }
        return comp.tryEmbed();
    }

    function tryEmbedCivitaiBrowserPanel() {
        const comp = window.EnhancedDownloader && window.EnhancedDownloader.Components && window.EnhancedDownloader.Components.ModelBrowser;
        if (!comp || typeof comp.tryEmbed !== 'function') {
            return false;
        }
        return comp.tryEmbed();
    }

    // Core's ModelDownloaderUtil.run() builds an ActiveModelDownload, whose progress/resume behavior is buggy
    // (overall_percent is a hardcoded placeholder, total size is never sent, and cancelling deletes the partial
    // file instead of keeping it resumable - see WebAPI/Downloads/DownloadManager.cs for the replacement). Take
    // over run() entirely rather than patching around ActiveModelDownload, the same way folder_browser_injection.js
    // already wraps run() for its own folder sync. This runs after that wrap in the load order, so overwriting
    // `mdl.run` here discards it - fine, since resolveSelectedFolder() (used by startFromManualDownloader) reads
    // the same folder-browser state directly instead of depending on the hidden legacy <select> it used to sync.
    function tryTakeOverDownloadRun() {
        if (!window.modelDownloader || typeof modelDownloader.run !== 'function') {
            return false;
        }
        if (modelDownloader.run._edTakeover) {
            return true;
        }
        const downloads = window.EnhancedDownloader && window.EnhancedDownloader.Downloads;
        if (!downloads || typeof downloads.startFromManualDownloader !== 'function') {
            return false;
        }
        const run = function () {
            downloads.startFromManualDownloader(modelDownloader);
        };
        run._edTakeover = true;
        modelDownloader.run = run;
        return true;
    }

    async function enhancedDownloaderInit() {
        await loadDownloadRoots();
        const start = Date.now();
        let retryInterval = DOM_RETRY_INTERVAL_INITIAL_MS;
        while (Date.now() - start < DOM_READY_TIMEOUT_MS) {
            const downloads = window.EnhancedDownloader && window.EnhancedDownloader.Downloads;
            const downloadsReady = downloads ? await downloads.init() : false;
            tryArmSampleModelLoad();
            if (tryEmbedDownloadsPanel() && tryEnhanceUrlUI() && tryEnhanceFolderUI() && tryTakeOverDownloadRun() && downloadsReady && tryEmbedCivitaiBrowserPanel() && tryEmbedFeaturedModelsPanel()) {
                break;
            }
            await new Promise(r => setTimeout(r, retryInterval));
            retryInterval = Math.min(retryInterval * 1.5, DOM_RETRY_INTERVAL_MAX_MS);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhancedDownloaderInit);
    }
    else {
        enhancedDownloaderInit();
    }
})();
