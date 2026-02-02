(function () {
    'use strict';

    const RECENTS_KEY = 'enhanced_downloader_recent_folders_v1';
    let downloadRoots = null;

    async function loadDownloadRoots() {
        if (downloadRoots || typeof genericRequest !== 'function') {
            return;
        }
        try {
            const resp = await genericRequest('EnhancedDownloaderGetDownloadRoots', {});
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

        wrapper.appendChild(card);
        return true;
    }

    async function enhancedDownloaderInit() {
        await loadDownloadRoots();
        const start = Date.now();
        while (Date.now() - start < 15000) {
            if (tryEmbedDownloadsPanel() && tryEnhanceUrlUI() && tryEnhanceFolderUI()) {
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
