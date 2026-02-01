using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Utils;
using SwarmUI.WebAPI;

namespace EnhancedDownloader;

public static class EnhancedDownloaderAPI
{
    public static void Register()
    {
        API.RegisterAPICall(GetStatus, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
        API.RegisterAPICall(ListProviders, false, EnhancedDownloaderExtension.PermEnhancedDownloader);
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
}
