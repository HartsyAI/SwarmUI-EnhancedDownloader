(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Components = window.EnhancedDownloader.Components || {};

    function getProvider(id) {
        return (window.EnhancedDownloader.Providers && window.EnhancedDownloader.Providers[id]) || null;
    }

    function listProvidersInOrder() {
        const providers = window.EnhancedDownloader.Providers || {};
        const order = ['hartsy', 'civitai', 'huggingface'];
        const result = [];
        for (const id of order) {
            if (providers[id]) result.push(providers[id]);
        }
        for (const id of Object.keys(providers)) {
            if (!order.includes(id)) result.push(providers[id]);
        }
        return result;
    }

    // Default filter option sets
    const defaultBaseModelOptions = [
        { value: 'All', label: 'All' },
        { value: 'SD 1.5', label: 'SD 1.5' },
        { value: 'SDXL 1.0', label: 'SDXL 1.0' },
        { value: 'Pony', label: 'Pony' },
        { value: 'Illustrious', label: 'Illustrious' },
        { value: 'Flux.1 D', label: 'Flux.1 D' }
    ];
    const defaultSortOptions = [
        { value: 'Most Downloaded', label: 'Most Downloaded' },
        { value: 'Newest', label: 'Newest' },
        { value: 'Highest Rated', label: 'Highest Rated' }
    ];
    const hartsySortOptions = [
        { value: 'popular', label: 'Most Popular' },
        { value: 'newest', label: 'Newest' },
        { value: 'downloads', label: 'Most Downloads' }
    ];

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

    function populateSelect(selectEl, options, selectedValue) {
        const currentValue = selectedValue || selectEl.value;
        selectEl.innerHTML = '';
        for (const opt of options) {
            const optEl = document.createElement('option');
            optEl.value = opt.value;
            optEl.textContent = opt.label;
            if (opt.value === currentValue) optEl.selected = true;
            selectEl.appendChild(optEl);
        }
    }

    window.EnhancedDownloader.Components.ModelBrowser = {
        tryEmbed: function tryEmbed() {
            const utils = window.EnhancedDownloader.Utils;
            const ModelCard = window.EnhancedDownloader.Components.ModelCard;
            const ModelPopover = window.EnhancedDownloader.Components.ModelPopover;
            if (!utils || !ModelCard || !ModelPopover) return false;

            const wrapper = document.querySelector('.model-downloader-section-wrapper');
            const main = document.querySelector('.model-downloader-main-section');
            if (!wrapper || !main) return false;
            if (wrapper.dataset.enhancedDownloaderBrowserDone) return true;

            const providers = listProvidersInOrder();
            if (!providers.length) return false;

            const card = createBrowserCard();
            const providerSelect = card.querySelector('.ed-provider');
            const query = card.querySelector('.ed-query');
            const searchBtn = card.querySelector('.ed-search');
            const typeFilter = card.querySelector('.ed-type');
            const baseModelFilter = card.querySelector('.ed-basemodel');
            const sortFilter = card.querySelector('.ed-sort');
            const nsfwToggle = card.querySelector('.ed-nsfw');
            const statusEl = card.querySelector('.enhanced-downloader-browser-status');
            const resultsEl = card.querySelector('.enhanced-downloader-browser-results');
            const prevBtn = card.querySelector('.ed-prev');
            const nextBtn = card.querySelector('.ed-next');
            const pageInfo = card.querySelector('.ed-pageinfo');

            // Populate provider dropdown
            for (const p of providers) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.displayName || p.id;
                if (p.id === 'hartsy') opt.selected = true;
                providerSelect.appendChild(opt);
            }

            // State
            const state = {
                inflight: false,
                providerId: providerSelect.value || providers[0].id,
                cursor: '', cursorStack: [], hasNextCursor: false, nextCursor: '',
                page: 1, totalPages: 1, hasMore: false,
                lastQuery: '', lastType: 'All', lastBaseModel: 'All',
                lastSort: 'Most Downloaded', lastIncludeNsfw: false
            };

            const isProviderCursorPaged = () => {
                const prov = getProvider(state.providerId);
                if (!prov) return false;
                if (prov.id === 'hartsy') return false;
                if (prov.id !== 'civitai') return true;
                return !!(state.lastQuery && state.lastQuery.trim().length);
            };

            // --- UI Update Functions ---

            const updateProviderUI = async () => {
                const prov = getProvider(state.providerId);
                const isFilterable = !!(prov && prov.supportsFilters);
                const isNsfw = !!(prov && prov.supportsNsfw);

                // Placeholder text
                if (prov && prov.id === 'huggingface') {
                    query.placeholder = 'Search Hugging Face...';
                } else if (prov && prov.id === 'hartsy') {
                    query.placeholder = 'Search Hartsy...';
                } else {
                    query.placeholder = 'Search...';
                }

                // Type filter (CivitAI only)
                typeFilter.disabled = !(prov && prov.id === 'civitai');

                // Base model / architecture
                baseModelFilter.disabled = !isFilterable;
                if (prov && prov.id === 'hartsy' && prov.getArchitectureOptions) {
                    try {
                        const archOptions = await prov.getArchitectureOptions();
                        populateSelect(baseModelFilter, archOptions.map(a => ({ value: a, label: a })), 'All');
                    } catch {
                        populateSelect(baseModelFilter, [{ value: 'All', label: 'All' }], 'All');
                    }
                } else if (prov && prov.id === 'civitai') {
                    populateSelect(baseModelFilter, defaultBaseModelOptions, state.lastBaseModel || 'All');
                }

                // Sort
                sortFilter.disabled = !isFilterable;
                if (prov && prov.id === 'hartsy') {
                    populateSelect(sortFilter, hartsySortOptions, 'popular');
                } else if (prov && prov.id === 'civitai') {
                    populateSelect(sortFilter, defaultSortOptions, state.lastSort || 'Most Downloaded');
                }

                // NSFW
                nsfwToggle.disabled = !isNsfw;
                if (!isNsfw) nsfwToggle.checked = false;
            };

            const updatePager = () => {
                const prov = getProvider(state.providerId);
                if (isProviderCursorPaged()) {
                    pageInfo.textContent = `Page ${state.cursorStack.length + 1}`;
                    prevBtn.disabled = state.cursorStack.length <= 0 || state.inflight;
                    nextBtn.disabled = !state.hasNextCursor || state.inflight;
                } else if (prov && prov.id === 'hartsy') {
                    pageInfo.textContent = `Page ${state.page}`;
                    prevBtn.disabled = state.page <= 1 || state.inflight;
                    nextBtn.disabled = !state.hasMore || state.inflight;
                } else {
                    pageInfo.textContent = `Page ${state.page} / ${state.totalPages}`;
                    prevBtn.disabled = state.page <= 1 || state.inflight;
                    nextBtn.disabled = state.page >= state.totalPages || state.inflight;
                }
            };

            // --- Render ---

            const render = (items) => {
                while (resultsEl.firstChild) resultsEl.removeChild(resultsEl.firstChild);
                for (const item of (items || [])) {
                    const { card: cardEl, renderId } = ModelCard.create(item, state.providerId);
                    const popoverEl = ModelPopover.create(item, state.providerId, renderId, cardEl);
                    resultsEl.appendChild(popoverEl);
                    resultsEl.appendChild(cardEl);
                }
                applyTranslations(resultsEl);
            };

            // --- Search ---

            const runSearch = async (setPage = null) => {
                if (state.inflight) return;
                const prov = getProvider(state.providerId);
                if (!prov) return;

                const newQuery = query.value || '';
                const newType = typeFilter.value || 'All';
                const newBaseModel = baseModelFilter.value || 'All';
                const newSort = sortFilter.value || 'Most Downloaded';
                const newNsfw = !!nsfwToggle.checked;
                const filterable = !!prov.supportsFilters;

                const filtersChanged =
                    state.lastQuery !== newQuery
                    || (filterable && state.lastType !== newType)
                    || (filterable && state.lastBaseModel !== newBaseModel)
                    || (filterable && state.lastSort !== newSort)
                    || (prov.supportsNsfw && state.lastIncludeNsfw !== newNsfw);

                state.lastQuery = newQuery;
                if (filterable) {
                    state.lastType = newType === 'ControlNet' ? 'Controlnet' : newType;
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
                    if (setPage != null) state.page = setPage;
                } else {
                    state.page = 1;
                    state.totalPages = 1;
                }

                statusEl.textContent = 'Loading...';
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
                        statusEl.textContent = resp && resp.error ? `${resp.error}` : 'Failed to load.';
                        render([]);
                        state.totalPages = 1;
                        state.hasNextCursor = false;
                        state.nextCursor = '';
                    } else {
                        const mode = resp.mode || (isProviderCursorPaged() ? 'cursor' : 'page');
                        if (mode === 'cursor') {
                            state.nextCursor = (resp.nextCursor || '').trim();
                            state.hasNextCursor = state.nextCursor.length > 0;
                        } else {
                            state.page = resp.page || state.page;
                            state.totalPages = resp.totalPages || 1;
                            state.hasMore = resp.hasMore || false;
                            state.hasNextCursor = false;
                            state.nextCursor = '';
                        }
                        statusEl.textContent = `Found ${resp.totalItems || 0} results`;
                        render(resp.items || []);
                    }
                } catch {
                    statusEl.textContent = 'Failed to load.';
                    render([]);
                    state.hasNextCursor = false;
                    state.nextCursor = '';
                }
                state.inflight = false;
                updatePager();
            };

            // --- Event Binding ---

            providerSelect.onchange = async () => {
                state.providerId = providerSelect.value || state.providerId;
                await updateProviderUI();
                runSearch(1);
            };
            searchBtn.onclick = () => runSearch(1);
            query.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); runSearch(1); }
            });
            typeFilter.onchange = () => runSearch(1);
            baseModelFilter.onchange = () => runSearch(1);
            sortFilter.onchange = () => runSearch(1);
            nsfwToggle.onchange = () => runSearch(1);

            prevBtn.onclick = () => {
                if (isProviderCursorPaged()) {
                    if (state.cursorStack.length === 0) return;
                    state.cursor = state.cursorStack.pop() || '';
                    state.nextCursor = '';
                    state.hasNextCursor = false;
                    runSearch(null);
                } else {
                    runSearch(Math.max(1, state.page - 1));
                }
            };
            nextBtn.onclick = () => {
                if (isProviderCursorPaged()) {
                    if (!state.hasNextCursor || !state.nextCursor) return;
                    state.cursorStack.push(state.cursor || '');
                    state.cursor = state.nextCursor;
                    state.nextCursor = '';
                    state.hasNextCursor = false;
                    runSearch(null);
                } else if (getProvider(state.providerId)?.id === 'hartsy') {
                    if (!state.hasMore) return;
                    runSearch(state.page + 1);
                } else {
                    runSearch(Math.min(state.totalPages, state.page + 1));
                }
            };

            // --- Mount ---

            wrapper.dataset.enhancedDownloaderBrowserDone = 'true';
            const rightCol = wrapper.querySelector('.enhanced-downloader-col-right');
            (rightCol || main).appendChild(card);
            applyTranslations(card);
            updateProviderUI().then(() => {
                updatePager();
                runSearch(1);
            });
            return true;
        }
    };
})();
