using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;

namespace EnhancedDownloader;

public static class EnhancedDownloaderAPI
{
    public static void Register()
    {
        API.RegisterAPICall(GetStatus, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
        API.RegisterAPICall(ListProviders, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
        API.RegisterAPICall(EnhancedDownloaderGetDownloadRoots, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
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
        return new JObject()
        {
            ["success"] = true,
            ["providers"] = new JArray(
                "civitai",
                "huggingface",
                "hartsy")
        };
    }

    public static async Task<JObject> EnhancedDownloaderGetDownloadRoots(Session session)
    {
        JObject roots = new();
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
}
