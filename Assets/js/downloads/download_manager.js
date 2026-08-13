/* Owns the entire in-progress-downloads UI: one card per download, driven by the server-side state in
 * WebAPI/Downloads/DownloadManager.cs. The server is the sole source of truth (bytes downloaded, state,
 * speed) - this module only renders it and forwards button clicks. That's what makes reload-mid-download
 * safe: on load it just asks the server what's still going and redraws from that, same as any other poll. */
(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};

    const POLL_INTERVAL_MS = 2000;

    /** Last known state of each download, keyed by ID. */
    const records = new Map();
    /** DOM handles for each download's card, keyed by ID. */
    const cardEls = new Map();
    let pollTimer = null;
    let zone = null;

    function utils() {
        return window.EnhancedDownloader && window.EnhancedDownloader.Utils;
    }

    async function call(endpoint, payload) {
        const u = utils();
        if (!u || typeof u.genericRequestAsync !== 'function') {
            return null;
        }
        try {
            return await u.genericRequestAsync(endpoint, payload);
        }
        catch (e) {
            console.warn(`Enhanced Downloader: ${endpoint} failed:`, e);
            return null;
        }
    }

    function formatBytes(n) {
        return typeof fileSizeStringify === 'function' ? fileSizeStringify(n) : `${Math.round(n)} B`;
    }

    /** Builds the status line for a card. Returned as HTML (not text) since the errored case needs a link. */
    function statusHtml(rec) {
        const known = rec.totalBytes > 0;
        // Set only for the attempt where the server didn't honor a resume and the byte count restarted from
        // zero - without this, that jump reads as an unexplained progress regression instead of what it is.
        const noteHtml = rec.note ? `<br>${escapeHtml(rec.note)}` : '';
        if (rec.state === 'downloading') {
            const speed = rec.perSecond > 0 ? ` - ${formatBytes(rec.perSecond)}/s` : '';
            if (!known) {
                return `Downloading... ${formatBytes(rec.downloadedBytes)}${speed}${noteHtml}`;
            }
            const pct = Math.floor((rec.downloadedBytes / rec.totalBytes) * 100);
            return `Downloading... ${formatBytes(rec.downloadedBytes)} / ${formatBytes(rec.totalBytes)} (${pct}%)${speed}${noteHtml}`;
        }
        if (rec.state === 'paused') {
            return `Paused at ${formatBytes(rec.downloadedBytes)}${known ? ` / ${formatBytes(rec.totalBytes)}` : ''}. The partial file is kept - Resume to continue.`;
        }
        if (rec.state === 'errored') {
            const msg = rec.error || 'Unknown error.';
            let html = `Error: ${escapeHtml(msg)}`;
            if (/401|unauthorized/i.test(msg)) {
                const link = `<a href="#" onclick="getRequiredElementById('usersettingstabbutton').click();getRequiredElementById('userinfotabbutton').click();">Open User Settings</a>`;
                html += `<br>This usually means the file is gated and requires authentication (or an API key) for the selected provider. ${link} to configure credentials, then retry.`;
            }
            else if (rec.downloadedBytes > 0) {
                html += `<br>${formatBytes(rec.downloadedBytes)} was already saved and will resume from there.`;
            }
            return html;
        }
        if (rec.state === 'completed') {
            return `Done! ${formatBytes(rec.totalBytes || rec.downloadedBytes)}`;
        }
        return '';
    }

    function makeButton(label, hint, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'basic-button';
        if (hint) {
            btn.title = hint;
        }
        btn.textContent = label;
        btn.onclick = onClick;
        return btn;
    }

    function renderActions(container, rec) {
        container.replaceChildren();
        if (rec.state === 'downloading') {
            container.appendChild(makeButton('Cancel', 'Pause this download - the partial file is kept so it can be resumed.', () => cancelDownload(rec.id)));
        }
        else if (rec.state === 'paused' || rec.state === 'errored') {
            const label = rec.state === 'errored' ? 'Retry' : 'Resume';
            container.appendChild(makeButton(label, 'Continue this download from where it left off.', () => resumeDownload(rec.id)));
            container.appendChild(makeButton('Clear', 'Delete the partial file and remove this download from the list.', () => clearDownload(rec.id)));
        }
        else if (rec.state === 'completed') {
            container.appendChild(makeButton('Dismiss', 'Remove this from the list. The downloaded model is not affected.', () => clearDownload(rec.id)));
        }
    }

    function ensureZone() {
        if (zone) {
            return zone;
        }
        if (window.modelDownloader && modelDownloader.activeZone) {
            zone = modelDownloader.activeZone;
        }
        return zone;
    }

    function buildCard(rec) {
        const root = document.createElement('div');
        root.className = 'ed-download-card';
        root.innerHTML = `
            <div class="card">
                <div class="card-header"></div>
                <div class="ed-download-progress"><div class="ed-download-progress-bar"></div></div>
                <div class="ed-download-status"></div>
                <div class="ed-download-actions"></div>
            </div>
        `;
        const els = {
            root,
            card: root.querySelector('.card'),
            header: root.querySelector('.card-header'),
            img: null,
            progressWrap: root.querySelector('.ed-download-progress'),
            bar: root.querySelector('.ed-download-progress-bar'),
            status: root.querySelector('.ed-download-status'),
            actions: root.querySelector('.ed-download-actions')
        };
        cardEls.set(rec.id, els);
        zone.insertBefore(root, zone.firstChild);
        return els;
    }

    function updateCard(rec) {
        const els = cardEls.get(rec.id) || buildCard(rec);
        els.header.textContent = `[${rec.type}] ${rec.name}`;
        if (rec.image && !els.img) {
            els.img = document.createElement('img');
            els.img.className = 'card-img-top';
            els.img.alt = 'Model thumbnail';
            els.img.src = rec.image;
            els.header.insertAdjacentElement('afterend', els.img);
        }
        const known = rec.totalBytes > 0;
        const pct = rec.state === 'completed' ? 100 : (known ? Math.min(100, (rec.downloadedBytes / rec.totalBytes) * 100) : 0);
        els.bar.style.width = `${pct}%`;
        els.progressWrap.classList.toggle('ed-progress-indeterminate', rec.state === 'downloading' && !known);
        els.status.innerHTML = statusHtml(rec);
        // State classes go on `root` (the `.ed-download-card`), not the inner `.card` - the CSS selectors for
        // per-state coloring and the "Show completed" toggle both key off `.ed-download-card.ed-state-*`.
        els.root.classList.remove('ed-state-downloading', 'ed-state-paused', 'ed-state-errored', 'ed-state-completed');
        els.root.classList.add(`ed-state-${rec.state}`);
        renderActions(els.actions, rec);
    }

    function removeCard(id) {
        const els = cardEls.get(id);
        if (els) {
            els.root.remove();
            cardEls.delete(id);
        }
    }

    /** Starts or stops the poll loop based on whether anything is actively downloading right now. Paused/errored/
     * completed downloads don't change on their own server-side, so there's nothing to gain from polling for them. */
    function reconcilePolling() {
        const anyActive = [...records.values()].some(r => r.state === 'downloading');
        if (anyActive && !pollTimer) {
            pollTimer = setInterval(pollOnce, POLL_INTERVAL_MS);
        }
        else if (!anyActive && pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    function setRecord(rec) {
        if (!rec || !ensureZone()) {
            return;
        }
        records.set(rec.id, rec);
        updateCard(rec);
        reconcilePolling();
    }

    /** Replaces the full known set with the server's list - the server is authoritative, so anything locally
     * tracked but absent here (eg cleared from another tab) is dropped too. */
    function applyList(list) {
        if (!ensureZone()) {
            return;
        }
        const seen = new Set();
        for (const rec of list) {
            seen.add(rec.id);
            records.set(rec.id, rec);
            updateCard(rec);
        }
        for (const id of [...records.keys()]) {
            if (!seen.has(id)) {
                records.delete(id);
                removeCard(id);
            }
        }
        reconcilePolling();
    }

    async function pollOnce() {
        const resp = await call('EnhancedDownloaderListDownloads', {});
        if (resp && resp.success) {
            applyList(resp.downloads || []);
        }
    }

    async function cancelDownload(id) {
        const resp = await call('EnhancedDownloaderCancelDownload', { id });
        if (resp && resp.download) {
            setRecord(resp.download);
        }
    }

    async function resumeDownload(id) {
        const resp = await call('EnhancedDownloaderResumeDownload', { id });
        if (resp && resp.download) {
            setRecord(resp.download);
        }
        else if (resp && resp.error) {
            console.warn(`Enhanced Downloader: resume failed: ${resp.error}`);
        }
    }

    async function clearDownload(id) {
        const resp = await call('EnhancedDownloaderClearDownload', { id });
        if (resp && resp.success) {
            records.delete(id);
            removeCard(id);
            reconcilePolling();
        }
        else if (resp && resp.error) {
            console.warn(`Enhanced Downloader: clear failed: ${resp.error}`);
        }
    }

    /** Entry point for enhanced_downloader.js's replacement of modelDownloader.run(). Reads the same fields core's
     * ActiveModelDownload constructor would have, and hands them to the server-side resumable downloader instead. */
    async function startFromManualDownloader(mdl) {
        const u = utils();
        if (!mdl || !u || !ensureZone()) {
            return;
        }
        const folder = u.resolveSelectedFolder(mdl);
        const name = folder ? `${folder}/${mdl.name.value}` : mdl.name.value;
        const payload = {
            url: mdl.url.value,
            type: mdl.type ? mdl.type.value : '',
            name,
            metadata: mdl.metadataZone ? (mdl.metadataZone.dataset.raw || '') : '',
            image: mdl.metadataZone ? (mdl.metadataZone.dataset.image || '') : ''
        };
        mdl.button.disabled = true;
        const resp = await call('EnhancedDownloaderStartDownload', payload);
        if (resp && resp.success && resp.download) {
            setRecord(resp.download);
            return;
        }
        mdl.button.disabled = false;
        if (mdl.urlStatusArea) {
            mdl.urlStatusArea.innerText = `Failed to start download: ${(resp && resp.error) || 'unknown error'}`;
        }
    }

    /** Fetches whatever downloads are already known server-side (in progress, paused, or errored across a page
     * reload or server restart) and renders them. Returns false if modelDownloader isn't in the DOM yet, so the
     * caller's retry loop tries again later. */
    let initialized = false;
    async function init() {
        if (initialized) {
            return true;
        }
        if (!ensureZone()) {
            return false;
        }
        const resp = await call('EnhancedDownloaderListDownloads', {});
        if (resp && resp.success) {
            applyList(resp.downloads || []);
        }
        initialized = true;
        return true;
    }

    window.EnhancedDownloader.Downloads = { init, startFromManualDownloader };
})();
