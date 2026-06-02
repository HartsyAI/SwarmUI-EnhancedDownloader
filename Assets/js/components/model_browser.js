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

    const defaultBaseModelOptions = [
        { value: 'All', label: 'All' },
        { value: 'SD 1.5', label: 'SD 1.5' },
        { value: 'SDXL 1.0', label: 'SDXL 1.0' },
        { value: 'Pony', label: 'Pony' },
        { value: 'Illustrious', label: 'Illustrious' },
        { value: 'Flux.1 D', label: 'Flux.1 D' }
    ];
    const civitaiTypeOptions = [
        { value: 'All', label: 'All' },
        { value: 'Checkpoint', label: 'Checkpoint' },
        { value: 'LORA', label: 'LoRA' },
        { value: 'LoCon', label: 'LoCon' },
        { value: 'LyCORIS', label: 'LyCORIS' },
        { value: 'TextualInversion', label: 'Textual Inversion' },
        { value: 'ControlNet', label: 'ControlNet' },
        { value: 'VAE', label: 'VAE' }
    ];
    const defaultSortOptions = [
        { value: 'Most Downloaded', label: 'Most Downloaded' },
        { value: 'Newest', label: 'Newest' },
        { value: 'Highest Rated', label: 'Highest Rated' }
    ];
    const hartsySortOptions = [
        { value: 'downloads', label: 'Most Downloads' },
        { value: 'created_at', label: 'Newest' },
        { value: 'updated_at', label: 'Recently Updated' },
        { value: 'title', label: 'Title' }
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
                            <option value="All" class="translate">All</option>
                            <option value="Checkpoint">Checkpoint</option>
                            <option value="LORA" selected>LoRA</option>
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
                        <select class="auto-dropdown ed-period" autocomplete="off" style="display:none">
                            <option value="AllTime" selected>All Time</option>
                        </select>
                        <label class="enhanced-downloader-toggle"><input type="checkbox" class="ed-nsfw" /> <span class="translate">NSFW</span></label>
                    </div>
                    <div class="enhanced-downloader-browser-row ed-civitai-row" style="display:none">
                        <span class="translate">Tag</span>:
                        <input type="text" class="auto-text ed-tag" list="ed-tag-suggestions" placeholder="Type a tag..." autocomplete="off" />
                        <datalist id="ed-tag-suggestions"></datalist>
                        <label class="enhanced-downloader-toggle"><input type="checkbox" class="ed-gen-only" /> <span class="translate">Generation-Ready</span></label>
                        <label class="enhanced-downloader-toggle"><input type="checkbox" class="ed-from-platform" /> <span class="translate">Trained on Civitai</span></label>
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
            const periodFilter = card.querySelector('.ed-period');
            const nsfwToggle = card.querySelector('.ed-nsfw');
            const civitaiRow = card.querySelector('.ed-civitai-row');
            const tagInput = card.querySelector('.ed-tag');
            const tagSuggestions = card.querySelector('#ed-tag-suggestions');
            const genOnlyToggle = card.querySelector('.ed-gen-only');
            const fromPlatformToggle = card.querySelector('.ed-from-platform');
            const statusEl = card.querySelector('.enhanced-downloader-browser-status');
            const resultsEl = card.querySelector('.enhanced-downloader-browser-results');
            const prevBtn = card.querySelector('.ed-prev');
            const nextBtn = card.querySelector('.ed-next');
            const pageInfo = card.querySelector('.ed-pageinfo');

            for (const p of providers) {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.displayName || p.id;
                if (p.id === 'hartsy') opt.selected = true;
                providerSelect.appendChild(opt);
            }

            const state = {
                inflight: false,
                providerId: providerSelect.value || providers[0].id,
                cursor: '', cursorStack: [], hasNextCursor: false, nextCursor: '',
                page: 1, totalPages: 1, hasMore: false,
                lastQuery: '', lastType: 'LORA', lastBaseModel: 'All',
                lastSort: 'Most Downloaded', lastPeriod: 'AllTime', lastIncludeNsfw: false,
                lastTag: '', lastSupportsGeneration: false, lastFromPlatform: false
            };

            const isProviderCursorPaged = () => {
                const prov = getProvider(state.providerId);
                if (!prov) return false;
                if (prov.id === 'hartsy') return false;
                if (prov.id !== 'civitai') return true;
                return !!(state.lastQuery && state.lastQuery.trim().length);
            };

            const updateProviderUI = async () => {
                const prov = getProvider(state.providerId);
                const isFilterable = !!(prov && prov.supportsFilters);
                const isNsfw = !!(prov && prov.supportsNsfw);

                if (prov && prov.id === 'huggingface') {
                    query.placeholder = 'Search Hugging Face...';
                } else if (prov && prov.id === 'hartsy') {
                    query.placeholder = 'Search Hartsy...';
                } else {
                    query.placeholder = 'Search...';
                }

                typeFilter.disabled = !(prov && (prov.id === 'civitai' || prov.id === 'hartsy' || prov.id === 'huggingface'));
                baseModelFilter.disabled = !isFilterable;
                if (prov && prov.id === 'hartsy' && prov.getArchitectureOptions) {
                    try {
                        const archOptions = await prov.getArchitectureOptions();
                        const formatted = archOptions.map(a => (typeof a === 'string') ? { value: a, label: a } : a);
                        populateSelect(baseModelFilter, formatted, 'All');
                    } catch {
                        populateSelect(baseModelFilter, [{ value: 'All', label: 'All' }], 'All');
                    }
                } else if (prov && prov.id === 'civitai') {
                    populateSelect(typeFilter, civitaiTypeOptions, state.lastType || 'LORA');
                    populateSelect(baseModelFilter, defaultBaseModelOptions, state.lastBaseModel || 'All');
                } else if (prov && prov.id === 'huggingface') {
                    populateSelect(typeFilter, prov.getPipelineTagOptions ? prov.getPipelineTagOptions() : [], 'All');
                    populateSelect(baseModelFilter, prov.getLibraryOptions ? prov.getLibraryOptions() : [], 'All');
                }

                sortFilter.disabled = !isFilterable;
                if (prov && prov.id === 'hartsy') {
                    populateSelect(sortFilter, hartsySortOptions, 'downloads');
                } else if (prov && prov.id === 'civitai') {
                    const civitaiSorts = prov.getSortOptions ? prov.getSortOptions() : defaultSortOptions;
                    populateSelect(sortFilter, civitaiSorts, state.lastSort || 'Most Downloaded');
                } else if (prov && prov.id === 'huggingface') {
                    populateSelect(sortFilter, prov.getSortOptions ? prov.getSortOptions() : [], 'trending');
                }

                const supportsPeriod = !!(prov && prov.supportsPeriod);
                periodFilter.style.display = supportsPeriod ? '' : 'none';
                periodFilter.disabled = !supportsPeriod;
                if (supportsPeriod && prov.getPeriodOptions) {
                    populateSelect(periodFilter, prov.getPeriodOptions(), state.lastPeriod || 'AllTime');
                }

                civitaiRow.style.display = (prov && prov.id === 'civitai') ? '' : 'none';

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

            const runSearch = async (setPage = null) => {
                if (state.inflight) return;
                const prov = getProvider(state.providerId);
                if (!prov) return;

                const newQuery = query.value || '';
                const newType = typeFilter.value || 'All';
                const newBaseModel = baseModelFilter.value || 'All';
                const newSort = sortFilter.value || 'Most Downloaded';
                const newPeriod = periodFilter.value || 'AllTime';
                const newNsfw = !!nsfwToggle.checked;
                const isCivitai = prov.id === 'civitai';
                const newTag = isCivitai ? (tagInput.value || '').trim() : '';
                const newGenOnly = isCivitai && !!genOnlyToggle.checked;
                const newFromPlatform = isCivitai && !!fromPlatformToggle.checked;
                const filterable = !!prov.supportsFilters;
                const periodable = !!prov.supportsPeriod;

                const filtersChanged =
                    state.lastQuery !== newQuery
                    || (filterable && state.lastType !== newType)
                    || (filterable && state.lastBaseModel !== newBaseModel)
                    || (filterable && state.lastSort !== newSort)
                    || (periodable && state.lastPeriod !== newPeriod)
                    || (prov.supportsNsfw && state.lastIncludeNsfw !== newNsfw)
                    || (isCivitai && state.lastTag !== newTag)
                    || (isCivitai && state.lastSupportsGeneration !== newGenOnly)
                    || (isCivitai && state.lastFromPlatform !== newFromPlatform);

                state.lastQuery = newQuery;
                if (filterable) {
                    state.lastType = newType;
                    state.lastBaseModel = newBaseModel;
                    state.lastSort = newSort;
                }
                if (periodable) {
                    state.lastPeriod = newPeriod;
                }
                state.lastIncludeNsfw = prov.supportsNsfw ? newNsfw : false;
                if (isCivitai) {
                    state.lastTag = newTag;
                    state.lastSupportsGeneration = newGenOnly;
                    state.lastFromPlatform = newFromPlatform;
                } else {
                    state.lastTag = '';
                    state.lastSupportsGeneration = false;
                    state.lastFromPlatform = false;
                }

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
                        period: state.lastPeriod,
                        includeNsfw: state.lastIncludeNsfw,
                        tag: state.lastTag,
                        supportsGeneration: state.lastSupportsGeneration,
                        fromPlatform: state.lastFromPlatform
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
                        const total = resp.totalItems || 0;
                        let statusText = `Found ${total} results`;
                        if (total === 0 && state.providerId === 'civitai' && !state.lastIncludeNsfw && prov.supportsNsfw && !nsfwToggle.disabled) {
                            statusText += ' — no SFW matches; enable NSFW to search civitai.red.';
                        }
                        statusEl.textContent = statusText;
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
            periodFilter.onchange = () => runSearch(1);
            nsfwToggle.onchange = () => runSearch(1);
            genOnlyToggle.onchange = () => runSearch(1);
            fromPlatformToggle.onchange = () => runSearch(1);
            tagInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); runSearch(1); }
            });
            tagInput.addEventListener('change', () => runSearch(1));

            let tagSuggestTimer = null;
            tagInput.addEventListener('input', () => {
                const prov = getProvider(state.providerId);
                if (!prov || prov.id !== 'civitai' || typeof prov.suggestTags !== 'function') return;
                if (tagSuggestTimer) clearTimeout(tagSuggestTimer);
                tagSuggestTimer = setTimeout(async () => {
                    const term = (tagInput.value || '').trim();
                    if (term.length < 2) {
                        while (tagSuggestions.firstChild) tagSuggestions.removeChild(tagSuggestions.firstChild);
                        return;
                    }
                    const tags = await prov.suggestTags(term);
                    while (tagSuggestions.firstChild) tagSuggestions.removeChild(tagSuggestions.firstChild);
                    for (const t of tags) {
                        if (!t || !t.name) continue;
                        const opt = document.createElement('option');
                        opt.value = t.name;
                        if (t.modelCount) opt.label = `${t.name} (${t.modelCount})`;
                        tagSuggestions.appendChild(opt);
                    }
                }, 250);
            });

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
