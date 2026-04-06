using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.WebAPI;
using Hartsy.Extensions.Providers;

namespace Hartsy.Extensions;

/// <summary>Registers and routes all Enhanced Downloader API endpoints.</summary>
public static class EnhancedDownloaderAPI
{
    public static JObject CachedDownloadRoots;
    public static long CachedDownloadRootsTimestamp;
    public const long DownloadRootsCacheTtlMs = 30_000;
    public static readonly object RootsLock = new();

    /// <summary>Registers all Enhanced Downloader API call handlers with the SwarmUI API system.</summary>
    public static void Register()
    {
        API.RegisterAPICall(ListProviders, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
        API.RegisterAPICall(EnhancedDownloaderGetDownloadRoots, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
        API.RegisterAPICall(EnhancedDownloaderGetFeaturedModels, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
        API.RegisterAPICall(EnhancedDownloaderCivitaiSearch, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
        API.RegisterAPICall(EnhancedDownloaderHuggingFaceSearch, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
        API.RegisterAPICall(EnhancedDownloaderHuggingFaceFiles, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
        API.RegisterAPICall(EnhancedDownloaderHuggingFaceImage, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
        API.RegisterAPICall(EnhancedDownloaderHartsySearch, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
        API.RegisterAPICall(EnhancedDownloaderHartsyFilterOptions, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
    }

    /// <summary>Returns a list of all registered download providers with their capabilities.</summary>
    [API.APIDescription("Returns a list of all registered download providers with their capabilities.", "\"success\": true, \"providers\": [{ \"id\": \"civitai\", \"displayName\": \"CivitAI\", ... }]")]
    public static Task<JObject> ListProviders(Session session)
    {
        JArray providers = [];
        foreach (IEnhancedDownloaderProvider p in EnhancedDownloaderProviderRegistry.Providers)
        {
            providers.Add(new JObject()
            {
                ["id"] = p.ProviderId,
                ["displayName"] = p.DisplayName,
                ["supportsFilters"] = p.SupportsFilters,
                ["supportsNsfw"] = p.SupportsNsfw
            });
        }
        return Task.FromResult(new JObject()
        {
            ["success"] = true,
            ["providers"] = providers
        });
    }

    /// <summary>Returns a cached mapping of model type keys to their filesystem download folder paths.</summary>
    [API.APIDescription("Returns a cached mapping of model type keys to their filesystem download folder paths.", "\"success\": true, \"roots\": { \"Stable-Diffusion\": \"path/to/models\", ... }")]
    public static Task<JObject> EnhancedDownloaderGetDownloadRoots(Session session)
    {
        if (CachedDownloadRoots is not null && Environment.TickCount64 - CachedDownloadRootsTimestamp < DownloadRootsCacheTtlMs)
        {
            return Task.FromResult(CachedDownloadRoots);
        }
        lock (RootsLock)
        {
            if (CachedDownloadRoots is not null && Environment.TickCount64 - CachedDownloadRootsTimestamp < DownloadRootsCacheTtlMs)
            {
                return Task.FromResult(CachedDownloadRoots);
            }
            JObject roots = new();
            foreach ((string key, T2IModelHandler handler) in Program.T2IModelSets)
            {
                roots[key] = handler.DownloadFolderPath ?? "";
            }
            JObject result = new()
            {
                ["success"] = true,
                ["roots"] = roots
            };
            CachedDownloadRoots = result;
            CachedDownloadRootsTimestamp = Environment.TickCount64;
            return Task.FromResult(result);
        }
    }

    /// <summary>Searches CivitAI for models matching the given query and filters.</summary>
    [API.APIDescription("Searches CivitAI for models matching the given query and filters.", "\"success\": true, \"items\": [...]")]
    public static async Task<JObject> EnhancedDownloaderCivitaiSearch(Session session,
        [API.APIParameter("Search query text.")] string query = "",
        [API.APIParameter("Page number for pagination.")] int page = 1,
        [API.APIParameter("Maximum results per page.")] int limit = 24,
        [API.APIParameter("Cursor for cursor-based pagination.")] string cursor = "",
        [API.APIParameter("Model type filter (e.g. Checkpoint, LORA).")] string type = "",
        [API.APIParameter("Base model filter (e.g. SDXL, Flux.1 D).")] string baseModel = "",
        [API.APIParameter("Sort order (Highest Rated, Most Downloaded, Newest).")] string sort = "Most Downloaded",
        [API.APIParameter("Whether to include NSFW results.")] bool includeNsfw = false)
    {
        return await CivitAIProvider.Instance.SearchAsync(session, query, page, limit, cursor, type, baseModel, sort, includeNsfw);
    }

    /// <summary>Searches Hugging Face for models matching the given query.</summary>
    [API.APIDescription("Searches Hugging Face for models matching the given query.", "\"success\": true, \"items\": [...]")]
    public static async Task<JObject> EnhancedDownloaderHuggingFaceSearch(Session session,
        [API.APIParameter("Search query text.")] string query = "",
        [API.APIParameter("Maximum results per page.")] int limit = 24,
        [API.APIParameter("Cursor for pagination.")] string cursor = "")
    {
        return await HuggingFaceProvider.Instance.SearchAsync(session, query, 1, limit, cursor);
    }

    /// <summary>Lists downloadable files for a specific Hugging Face model repository.</summary>
    [API.APIDescription("Lists downloadable files for a specific Hugging Face model repository.", "\"success\": true, \"files\": [{ \"fileName\": \"...\", \"downloadUrl\": \"...\", \"fileSize\": 123 }]")]
    public static async Task<JObject> EnhancedDownloaderHuggingFaceFiles(Session session,
        [API.APIParameter("The Hugging Face model ID (e.g. user/repo).")] string modelId,
        [API.APIParameter("Maximum number of files to return.")] int limit = 500)
    {
        return await HuggingFaceProvider.Instance.ListFilesAsync(session, modelId, limit);
    }

    /// <summary>Fetches a preview image for a Hugging Face model.</summary>
    [API.APIDescription("Fetches a preview image for a Hugging Face model.", "\"success\": true, \"image\": \"data:image/png;base64,...\"")]
    public static async Task<JObject> EnhancedDownloaderHuggingFaceImage(Session session,
        [API.APIParameter("The Hugging Face model ID (e.g. user/repo).")] string modelId)
    {
        return await HuggingFaceProvider.Instance.GetPreviewImageAsync(session, modelId);
    }

    /// <summary>Searches Hartsy for models matching the given query, architecture, and tags.</summary>
    [API.APIDescription("Searches Hartsy for models matching the given query, architecture, and tags.", "\"success\": true, \"items\": [...]")]
    public static async Task<JObject> EnhancedDownloaderHartsySearch(Session session,
        [API.APIParameter("Search query text.")] string query = "",
        [API.APIParameter("Page number for pagination.")] int page = 1,
        [API.APIParameter("Maximum results per page.")] int limit = 24,
        [API.APIParameter("Architecture filter.")] string architecture = "",
        [API.APIParameter("Sort order.")] string sort = "popular",
        [API.APIParameter("Comma-separated tag filter.")] string tags = "")
    {
        return await HartsyProvider.Instance.SearchAsync(session, query, page, limit, "", "", architecture, sort, false, tags);
    }

    /// <summary>Returns available filter options (architectures, tags) from the Hartsy API.</summary>
    [API.APIDescription("Returns available filter options (architectures, tags) from the Hartsy API.", "\"success\": true, \"architectures\": [...], \"tags\": [...]")]
    public static async Task<JObject> EnhancedDownloaderHartsyFilterOptions(Session session)
    {
        return await HartsyProvider.Instance.GetFilterOptionsAsync(session);
    }

    /// <summary>Returns the curated list of featured/recommended models.</summary>
    [API.APIDescription("Returns the curated list of featured/recommended models.", "\"success\": true, \"models\": [...]")]
    public static Task<JObject> EnhancedDownloaderGetFeaturedModels(Session session)
    {
        return Task.FromResult(FeaturedModels.GetFeatured());
    }
}
