# SwarmUI Enhanced Downloader
===========================================================================

![Enhanced Downloader](url_to_image_placeholder)

## Table of Contents
-----------------

1. [Introduction](#introduction)
2. [Screenshots (TODO)](#screenshots-todo)
3. [Features](#features)
4. [Installation](#installation)
5. [Usage](#usage)
6. [Configuration](#configuration)
7. [Providers](#providers)
8. [Technical Architecture](#technical-architecture)
9. [Permissions](#permissions)
10. [Troubleshooting](#troubleshooting)
11. [Contributing](#contributing)
12. [License](#license)
13. [Credits](#credits)

## Introduction
---------------

The Enhanced Downloader extension for SwarmUI replaces the default model download experience with a full-featured model browser. Search, preview, and download models from multiple providers — all without leaving SwarmUI.

Instead of copy-pasting download URLs manually, you can browse model repositories directly from the **Utilities > Download Models** tab, view model cards with images and metadata, filter by type and architecture, and download to the correct folder with one click.

> [!NOTE]
> This extension enhances SwarmUI's built-in download utility. It does not replace it — the manual URL download workflow remains fully available alongside the browser.

## Screenshots (TODO)
-------------------

- **TODO**: Add a screenshot of the full Enhanced Downloader tab showing the two-column layout (manual download on left, model browser on right).
- **TODO**: Add a screenshot of the Hartsy provider browser with search results and filter options.
- **TODO**: Add a screenshot of the CivitAI provider browser showing type/base model filters and NSFW toggle.
- **TODO**: Add a screenshot of the Hugging Face provider browser showing model cards with file listings.
- **TODO**: Add a screenshot of the model popover/detail card that appears when clicking a model result.
- **TODO**: Add a screenshot of the folder selector with recent folders and the "New Folder" option.
- **TODO**: Add a screenshot of the destination path preview breadcrumbs during a download.
- **TODO**: Add a screenshot of the 401 Unauthorized error message with the "Open User Settings" link.

## Features
------------

### Model Browser
- **Multi-provider search** — Browse models from Hartsy, CivitAI, and Hugging Face in a unified interface
- **Provider switching** — Toggle between providers with a single click; each provider retains its own search state
- **Search with filters** — Filter by model type, base architecture, sort order, and tags (provider-dependent)
- **Pagination** — Page-based and cursor-based pagination depending on the provider
- **Model cards** — Visual cards with thumbnail, title, creator, download count, base model, and type badges
- **Model popovers** — Click a card to see full details, description, download options, and action buttons

### Enhanced Download UI
- **Two-column layout** — Manual URL download on the left, model browser on the right
- **Recent folders** — The folder selector remembers your last 12 download destinations
- **New folder creation** — Create custom subfolders directly from the dropdown
- **Destination preview** — Live breadcrumb path showing exactly where the file will be saved
- **Clipboard paste** — One-click paste button for the URL input
- **401 error recovery** — When a download fails with 401 Unauthorized, shows a helpful message with a link to User Settings to configure API keys, plus a Retry button

### Provider Capabilities

| Provider | Search | Filters | NSFW | Pagination | API Key |
|----------|--------|---------|------|------------|---------|
| **Hartsy** | Yes | Architecture, tags, sort | No | Page-based | Optional |
| **CivitAI** | Yes | Type, base model, sort | Yes | Cursor + page | Optional |
| **Hugging Face** | Yes | No | No | Cursor-based | No |

### Performance
- **Response caching** — Search results cached for 60 seconds to avoid redundant API calls
- **Image caching** — Hugging Face preview images cached for 5 minutes with automatic eviction at 100 entries
- **Rate limiting** — Concurrent request limits per provider (3 for CivitAI/Hartsy, 5 for Hugging Face)
- **Download roots caching** — Model folder paths cached for 30 seconds with thread-safe access

## Installation
--------------

### Preferred Method (Via SwarmUI)

1. Open your SwarmUI instance
2. Navigate to `Server > Extensions`
3. Find "Enhanced Downloader"
4. Click Install
5. Restart SwarmUI when prompted

### Manual Installation

1. Close SwarmUI
2. Clone this repository into `SwarmUI/src/Extensions/SwarmUI-EnhancedDownloader/`
3. Restart SwarmUI (the build process will compile the extension automatically)
4. Go to `Server > Extensions` and verify it is enabled

## Usage
--------

### Browsing Models

1. Open the **Utilities** tab in SwarmUI
2. Click **Download Models**
3. The model browser appears on the right side of the page
4. Select a provider from the tabs at the top (Hartsy, CivitAI, or Hugging Face)
5. Type a search query or browse the default results
6. Use the filter dropdowns (if available for the selected provider) to narrow results
7. Click a model card to open the detail popover

### Downloading a Model

**From the browser:**
1. Click a model card to open its popover
2. Click the **Download** button (or select a specific file version for HuggingFace models)
3. The download URL is automatically loaded into the manual downloader on the left
4. Select or create a destination folder
5. The download begins via SwarmUI's built-in download system

**From a URL:**
1. Paste a model URL into the URL input on the left (or use the Paste button)
2. Select a destination folder from the dropdown
3. Click Download

### Managing Folders

- The folder dropdown shows all available model type folders from your SwarmUI configuration
- Recently used folders appear at the top of the dropdown for quick access
- Select **New Folder** to create a custom subfolder within any model directory
- The destination path preview (breadcrumbs) updates in real-time as you change selections

## Configuration
----------------

### API Keys (Optional)

Some providers support optional API keys for accessing gated or private models.

1. Open the **User** tab in SwarmUI
2. Navigate to **User Settings**
3. Enter your API keys:
   - **CivitAI API Key** — Allows downloading gated models and increases rate limits
   - **Hartsy API Key** — Enables authenticated access to the Hartsy API

> [!WARNING]
> Never share your API keys. They are stored in your SwarmUI user data and are only sent to the respective provider APIs.

### NSFW Filtering

NSFW results from CivitAI are hidden by default. To enable them:

1. The `enhanced_downloader_nsfw` permission must be granted to your user/group
2. Toggle the NSFW switch in the CivitAI browser filters

### Hartsy Custom URL

For development or self-hosted Hartsy instances, a custom base URL can be configured per-user via the `hartsy_api` → `url` user data key.

## Providers
-----------

### Hartsy

[Hartsy](https://hartsy.ai) is a curated model repository. The Enhanced Downloader uses the Hartsy API to search and browse available models.

**Filters:**
- **Architecture** — Filter by model architecture (e.g., SDXL, SD 1.5, Flux)
- **Tags** — Filter by content tags
- **Sort** — Popular, Newest, or Downloads

**Notes:**
- Hartsy is the default provider when the browser loads
- Models hosted externally (CivitAI, Hugging Face) will link to their original source for download
- Filter options (architectures, tags) are fetched dynamically from the Hartsy API

### CivitAI

[CivitAI](https://civitai.com) is the largest community model repository. The Enhanced Downloader searches the CivitAI v1 API.

**Filters:**
- **Type** — Checkpoint, LoRA, VAE, Controlnet, Upscaler, etc.
- **Base Model** — SD 1.5, SDXL, Flux, etc.
- **Sort** — Most Downloaded, Highest Rated, Newest
- **NSFW** — Toggle (requires permission)

**Notes:**
- Browse mode uses page-based pagination; search mode uses cursor-based pagination
- An API key unlocks access to gated models and higher rate limits
- File selection prioritizes `.safetensors` format

### Hugging Face

[Hugging Face](https://huggingface.co) hosts a wide range of machine learning models. The Enhanced Downloader searches the Hugging Face Hub API.

**Features:**
- Search by model name or keyword
- View all downloadable files within a model repository
- Preview images are fetched automatically (thumbnails, README images)
- Click to select a specific file for download

**Notes:**
- No filter support (Hugging Face API limitations)
- Preview images use a multi-strategy fetch: common filenames first, then API siblings, then README parsing
- File listings show size and filter to model-relevant extensions (`.safetensors`, `.gguf`, `.ckpt`, etc.)

## Technical Architecture
----------------------

### Extension Structure

```
SwarmUI-EnhancedDownloader/
├── Assets/
│   ├── css/
│   │   └── enhanced_downloader.css          # Extension styles (SwarmUI theme-aware)
│   └── js/
│       ├── components/
│       │   ├── model_browser.js             # Browser orchestrator (search, pagination, provider tabs)
│       │   ├── model_card.js                # Card rendering and layout
│       │   └── model_popover.js             # Detail popover with actions
│       ├── providers/
│       │   ├── civitai.js                   # CivitAI client (search, download, card click)
│       │   ├── hartsy.js                    # Hartsy client (search, filters, download)
│       │   └── huggingface.js               # Hugging Face client (search, files, images)
│       ├── enhanced_downloader.js           # Main entry (layout, folder UI, URL UI, 401 handling)
│       └── enhanced_downloader_utils.js     # Shared utilities (async API, URL loading, metadata)
├── WebAPI/
│   ├── EnhancedDownloaderAPI.cs             # API endpoint registration
│   └── Providers/
│       ├── CivitAIProvider.cs               # CivitAI search provider
│       ├── EnhancedDownloaderProviderRegistry.cs  # Static provider registry
│       ├── HartsyProvider.cs                # Hartsy search provider
│       ├── HuggingFaceProvider.cs           # Hugging Face search + files + images
│       ├── IEnhancedDownloaderProvider.cs   # Provider interface
│       └── ProviderHelpers.cs               # Cache, result builder, URL builder, file helpers
├── EnhancedDownloaderExtension.cs           # Extension entry point
└── SwarmUI-EnhancedDownloader.csproj        # Project file
```

### Design Patterns

- **Provider pattern** — Each model source implements `IEnhancedDownloaderProvider` on the backend and a matching JS provider object on the frontend
- **Singleton instances** — Providers are stateless singletons registered in `EnhancedDownloaderProviderRegistry`
- **Normalized results** — `ModelResultBuilder` transforms provider-specific JSON into a unified card format
- **Cache with TTL** — `ProviderCache` wraps `ConcurrentDictionary` with time-based expiry and lazy pruning
- **Rate limiting** — `SemaphoreSlim` per provider prevents API abuse
- **SwarmUI integration** — Uses SwarmUI's `Utilities.UtilWebClient`, `Logs`, `escapeHtml()`, `genericRequest()`, CSS variables, and permission system

### API Endpoints

| Endpoint | Permission | Description |
|----------|-----------|-------------|
| `ListProviders` | `enhanced_downloader` | Returns available providers and their capabilities |
| `EnhancedDownloaderGetDownloadRoots` | `enhanced_downloader` | Returns model folder paths for each model type |
| `EnhancedDownloaderCivitaiSearch` | `enhanced_downloader_browse` | Searches CivitAI models |
| `EnhancedDownloaderHuggingFaceSearch` | `enhanced_downloader_browse` | Searches Hugging Face models |
| `EnhancedDownloaderHuggingFaceFiles` | `enhanced_downloader_browse` | Lists files in a Hugging Face repo |
| `EnhancedDownloaderHuggingFaceImage` | `enhanced_downloader_browse` | Fetches preview image for a Hugging Face model |
| `EnhancedDownloaderHartsySearch` | `enhanced_downloader_browse` | Searches Hartsy models |
| `EnhancedDownloaderHartsyFilterOptions` | `enhanced_downloader_browse` | Fetches Hartsy filter options (architectures, tags) |

## Permissions
-----------

This extension registers three permissions, all defaulting to the **POWERUSERS** group:

| Permission | Description |
|-----------|-------------|
| `enhanced_downloader` | Base access to the Enhanced Downloader extension |
| `enhanced_downloader_browse` | Permission to search and browse models across providers |
| `enhanced_downloader_nsfw` | Permission to include NSFW results (CivitAI only) |

Permissions can be configured in `Server > Users & Permissions`.

## Troubleshooting
-----------------

### 401 Unauthorized on Download

**Problem:** Download fails with a 401 error

**Solution:**
1. The enhanced error message will show a link to **User Settings**
2. Click the link and add your API key for the relevant provider (CivitAI, Hartsy)
3. Click the **Retry** button on the failed download

### No Search Results

**Problem:** Browser shows no results for a search query

**Solution:**
- Check your network connection
- Try a different search term
- Check SwarmUI logs for API error messages
- For CivitAI, verify your API key if searching for gated content

### Browser Not Appearing

**Problem:** The model browser panel is missing from the Download Models page

**Solution:**
1. Verify the extension is enabled in `Server > Extensions`
2. Restart SwarmUI after enabling
3. Hard-refresh the browser (`Ctrl + Shift + R`)
4. Check the browser console for JavaScript errors

### Missing Preview Images

**Problem:** Model cards show no thumbnail

**Solution:**
- Hugging Face images are fetched lazily and may not be available for all models
- CivitAI images depend on model authors uploading them
- Check the browser console for image fetch errors

## Contributing
--------------

Contributions welcome! Focus areas:
- Additional provider integrations
- Improved model metadata display
- Download queue management
- Better error messages and user guidance

## License
-------

MIT License

## Credits
-------

- [SwarmUI](https://github.com/mcmonkeyprojects/SwarmUI) by mcmonkey
- [CivitAI](https://civitai.com) for their public model API
- [Hugging Face](https://huggingface.co) for the Hub API
- [Hartsy AI](https://hartsy.ai) for the Hartsy model platform
- The [Hartsy Discord Community](https://discord.gg/nWfCupjhbm) for testing and feedback

---

**Last Updated:** February 2026
**Extension Version:** 1.0.0
