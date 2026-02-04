(function () {
    'use strict';

    const RECENTS_KEY = 'enhanced_downloader_recent_folders_v1';
    const MAX_RECENT_FOLDERS = 12;
    const DOM_READY_TIMEOUT_MS = 15000;
    const DOM_RETRY_INTERVAL_MS = 100;
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

            main.classList.add('enhanced-downloader-manual');
            const mainInner = main.querySelector(':scope > div');
            if (mainInner) {
                mainInner.classList.add('enhanced-downloader-manual-inner');
            }
            const metaZone = document.getElementById('model_downloader_metadatazone');
            const imgSide = document.getElementById('model_downloader_imageside');
            if (metaZone && imgSide && !metaZone.closest('.enhanced-downloader-meta-split')) {
                const split = document.createElement('div');
                split.className = 'enhanced-downloader-meta-split';
                metaZone.insertAdjacentElement('beforebegin', split);
                split.appendChild(imgSide);
                split.appendChild(metaZone);
            }

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
        const comp = window.EnhancedDownloader && window.EnhancedDownloader.Components && window.EnhancedDownloader.Components.ModelBrowser;
        if (!comp || typeof comp.tryEmbed !== 'function') {
            return false;
        }
        return comp.tryEmbed();
    }

    function enhanceModelDownloader401Message() {
        if (!window.ActiveModelDownload || !ActiveModelDownload.prototype || !ActiveModelDownload.prototype.download) {
            return;
        }
        if (ActiveModelDownload.prototype.download._ed401) {
            return;
        }

        let activeInstance = null;

        // Permanently wrap makeWSRequest once to detect 401 on DoModelDownloadWS
        if (typeof window.makeWSRequest === 'function' && !window.makeWSRequest._ed401) {
            const origWS = window.makeWSRequest;
            window.makeWSRequest = function (name, payload, onData, timeout, onError, onOpen) {
                if (name === 'DoModelDownloadWS' && typeof onError === 'function' && activeInstance) {
                    const inst = activeInstance;
                    const wrappedErr = function (e) {
                        if (`${e}`.includes('401') || `${e}`.toLowerCase().includes('unauthorized')) {
                            const link = `<a href="#" onclick="getRequiredElementById('usersettingstabbutton').click();getRequiredElementById('userinfotabbutton').click();">Open User Settings</a>`;
                            const hint = `This download returned <b>401 Unauthorized</b>. This usually means the file is gated and requires authentication (or an API key) for the selected provider.<br>${link} to configure credentials, then retry.`;
                            inst.statusText.innerHTML = `Error: ${escapeHtml(e)}\n<br>${hint}<br><br><button class="basic-button" title="Restart the download" style="width:98%">Retry</button><br><br>`;
                            inst.statusText.querySelector('button').onclick = () => inst.download();
                            inst.setBorderColor('#aa0000');
                            inst.isDone();
                            return;
                        }
                        return onError(e);
                    };
                    return origWS(name, payload, onData, timeout, wrappedErr, onOpen);
                }
                return origWS(name, payload, onData, timeout, onError, onOpen);
            };
            window.makeWSRequest._ed401 = true;
        }

        // Lightweight prototype wrapper — just tracks the active download instance
        const origDownload = ActiveModelDownload.prototype.download;
        ActiveModelDownload.prototype.download = function () {
            activeInstance = this;
            try {
                return origDownload.call(this);
            }
            finally {
                activeInstance = null;
            }
        };
        ActiveModelDownload.prototype.download._ed401 = true;
    }

    async function enhancedDownloaderInit() {
        await loadDownloadRoots();
        enhanceModelDownloader401Message();
        const start = Date.now();
        while (Date.now() - start < DOM_READY_TIMEOUT_MS) {
            if (tryEmbedDownloadsPanel() && tryEnhanceUrlUI() && tryEnhanceFolderUI() && tryEmbedCivitaiBrowserPanel()) {
                break;
            }
            await new Promise(r => setTimeout(r, DOM_RETRY_INTERVAL_MS));
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhancedDownloaderInit);
    }
    else {
        enhancedDownloaderInit();
    }
})();
