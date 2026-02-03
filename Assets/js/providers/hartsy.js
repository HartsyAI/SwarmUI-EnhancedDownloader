(function () {
    'use strict';

    window.EnhancedDownloader = window.EnhancedDownloader || {};
    window.EnhancedDownloader.Providers = window.EnhancedDownloader.Providers || {};

    // Stub provider placeholder.
    window.EnhancedDownloader.Providers.hartsy = {
        id: 'hartsy',
        displayName: 'Hartsy',
        supportsFilters: false,
        supportsNsfw: false,

        search: async function () {
            return { error: 'Hartsy provider is not implemented yet.' };
        }
    };
})();
