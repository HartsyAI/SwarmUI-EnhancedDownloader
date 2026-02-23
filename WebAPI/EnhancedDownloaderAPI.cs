using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.WebAPI;
using Hartsy.Extensions.Providers;

namespace Hartsy.Extensions;

public static class EnhancedDownloaderAPI
{
    private static JObject _cachedDownloadRoots;
    private static long _cachedDownloadRootsTimestamp;
    private const long DownloadRootsCacheTtlMs = 30_000;
    private static readonly object _rootsLock = new();

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

    public static Task<JObject> EnhancedDownloaderGetDownloadRoots(Session session)
    {
        if (_cachedDownloadRoots is not null && Environment.TickCount64 - _cachedDownloadRootsTimestamp < DownloadRootsCacheTtlMs)
        {
            return Task.FromResult(_cachedDownloadRoots);
        }
        lock (_rootsLock)
        {
            if (_cachedDownloadRoots is not null && Environment.TickCount64 - _cachedDownloadRootsTimestamp < DownloadRootsCacheTtlMs)
            {
                return Task.FromResult(_cachedDownloadRoots);
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
            _cachedDownloadRoots = result;
            _cachedDownloadRootsTimestamp = Environment.TickCount64;
            return Task.FromResult(result);
        }
    }

    public static async Task<JObject> EnhancedDownloaderCivitaiSearch(Session session,
        string query = "", int page = 1, int limit = 24, string cursor = "",
        string type = "", string baseModel = "", string sort = "Most Downloaded",
        bool includeNsfw = false)
    {
        return await CivitAIProvider.Instance.SearchAsync(session, query, page, limit, cursor, type, baseModel, sort, includeNsfw);
    }

    public static async Task<JObject> EnhancedDownloaderHuggingFaceSearch(Session session,
        string query = "", int limit = 24, string cursor = "")
    {
        return await HuggingFaceProvider.Instance.SearchAsync(session, query, 1, limit, cursor);
    }

    public static async Task<JObject> EnhancedDownloaderHuggingFaceFiles(Session session,
        string modelId, int limit = 500)
    {
        return await HuggingFaceProvider.Instance.ListFilesAsync(session, modelId, limit);
    }

    public static async Task<JObject> EnhancedDownloaderHuggingFaceImage(Session session, string modelId)
    {
        return await HuggingFaceProvider.Instance.GetPreviewImageAsync(session, modelId);
    }

    public static async Task<JObject> EnhancedDownloaderHartsySearch(Session session,
        string query = "", int page = 1, int limit = 24,
        string architecture = "", string sort = "popular", string tags = "")
    {
        return await HartsyProvider.Instance.SearchAsync(session, query, page, limit, "", "", architecture, sort, false, tags);
    }

    public static async Task<JObject> EnhancedDownloaderHartsyFilterOptions(Session session)
    {
        return await HartsyProvider.Instance.GetFilterOptionsAsync(session);
    }

    public static Task<JObject> EnhancedDownloaderGetFeaturedModels(Session session)
    {
        return Task.FromResult(FeaturedModels.GetFeatured());
    }
}
