using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using EnhancedDownloader.Providers;

namespace EnhancedDownloader;

public static class EnhancedDownloaderAPI
{
    public static void Register()
    {
        API.RegisterAPICall(GetStatus, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
        API.RegisterAPICall(ListProviders, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
        API.RegisterAPICall(EnhancedDownloaderGetDownloadRoots, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
        API.RegisterAPICall(EnhancedDownloaderCivitaiSearch, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
        API.RegisterAPICall(EnhancedDownloaderHuggingFaceSearch, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
        API.RegisterAPICall(EnhancedDownloaderHuggingFaceFiles, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
        API.RegisterAPICall(EnhancedDownloaderHuggingFaceImage, false, EnhancedDownloaderExtension.PermEnhancedDownloaderBrowse);
    }

    public static async Task<JObject> GetStatus(Session session)
    {
        return new JObject()
        {
            ["success"] = true,
            ["status"] = "stub"
        };
    }

    public static async Task<JObject> ListProviders(Session session)
    {
        JArray providers = new(EnhancedDownloaderProviderRegistry.ProviderIds);
        return new JObject()
        {
            ["success"] = true,
            ["providers"] = providers
        };
    }

    public static async Task<JObject> EnhancedDownloaderGetDownloadRoots(Session session)
    {
        JObject roots = new JObject();
        foreach ((string key, T2IModelHandler handler) in Program.T2IModelSets)
        {
            roots[key] = handler.DownloadFolderPath ?? "";
        }
        return new JObject()
        {
            ["success"] = true,
            ["roots"] = roots
        };
    }

    public static async Task<JObject> EnhancedDownloaderCivitaiSearch(Session session,
        string query = "",
        int page = 1,
        int limit = 24,
        string cursor = "",
        string type = "",
        string baseModel = "",
        string sort = "Most Downloaded",
        bool includeNsfw = false)
    {
        return await CivitAIProvider.Instance.SearchAsync(session, query, page, limit, cursor, type, baseModel, sort, includeNsfw);
    }

    public static async Task<JObject> EnhancedDownloaderHuggingFaceSearch(Session session,
        string query = "",
        int limit = 24,
        string cursor = "")
    {
        return await HuggingFaceProvider.Instance.SearchAsync(session, query, limit, cursor);
    }

    public static async Task<JObject> EnhancedDownloaderHuggingFaceFiles(Session session,
        string modelId,
        int limit = 500)
    {
        return await HuggingFaceProvider.Instance.ListFilesAsync(session, modelId, limit);
    }

    public static async Task<JObject> EnhancedDownloaderHuggingFaceImage(Session session, string modelId)
    {
        return await HuggingFaceProvider.Instance.GetPreviewImageAsync(session, modelId);
    }
}
