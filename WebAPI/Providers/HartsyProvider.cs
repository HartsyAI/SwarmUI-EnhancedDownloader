using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using System.Net.Http;
using System.Web;

namespace EnhancedDownloader.Providers;

public class HartsyProvider : IEnhancedDownloaderProvider
{
    public static readonly HartsyProvider Instance = new();

    public string ProviderId => "hartsy";

    private const string DefaultBaseUrl = "https://dev.hartsy.ai";

    private static string GetBaseUrl(Session session)
    {
        string customUrl = session.User.GetGenericData("hartsy_api", "url");
        if (!string.IsNullOrWhiteSpace(customUrl))
        {
            return customUrl.TrimEnd('/');
        }
        return DefaultBaseUrl;
    }

    private static void AddApiKeyHeader(HttpRequestMessage request, Session session)
    {
        string apiKey = session.User.GetGenericData("hartsy_api", "key");
        if (!string.IsNullOrEmpty(apiKey))
        {
            request.Headers.Add("Authorization", $"Bearer {apiKey}");
        }
    }

    public async Task<JObject> SearchAsync(Session session,
        string query = "",
        int page = 1,
        int limit = 24,
        string architecture = "",
        string sort = "popular",
        string tags = "")
    {
        page = Math.Clamp(page, 1, 500);
        limit = Math.Clamp(limit, 1, 100);

        string sortClean = (sort ?? "").Trim().ToLowerInvariant();
        HashSet<string> allowedSorts = ["popular", "newest", "downloads"];
        if (string.IsNullOrWhiteSpace(sortClean) || !allowedSorts.Contains(sortClean))
        {
            sortClean = "popular";
        }

        string baseUrl = GetBaseUrl(session);
        string url = $"{baseUrl}/api/home/models?page={page}&pageSize={limit}&sort={HttpUtility.UrlEncode(sortClean)}";

        if (!string.IsNullOrWhiteSpace(query))
        {
            url += $"&search={HttpUtility.UrlEncode(query)}";
        }
        if (!string.IsNullOrWhiteSpace(architecture) && architecture != "All")
        {
            url += $"&architecture={HttpUtility.UrlEncode(architecture)}";
        }
        if (!string.IsNullOrWhiteSpace(tags))
        {
            url += $"&tags={HttpUtility.UrlEncode(tags)}";
        }
        // Exclude API-only models (not downloadable)
        url += "&isApiModel=false";

        string resp;
        try
        {
            using HttpRequestMessage request = new(HttpMethod.Get, url);
            AddApiKeyHeader(request, session);
            using HttpResponseMessage response = await Utilities.UtilWebClient.SendAsync(request);
            resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader Hartsy search failed for '{url}': {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["error"] = $"Hartsy error {(int)response.StatusCode}: {trimmed}" };
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader Hartsy search failed for '{url}': {ex.ReadableString()}");
            return new JObject() { ["error"] = "Failed to contact Hartsy." };
        }

        JObject data;
        try
        {
            data = resp.ParseToJson();
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader Hartsy search returned invalid JSON: {ex.ReadableString()}");
            return new JObject() { ["error"] = "Hartsy returned invalid data." };
        }

        if (data.Value<bool?>("success") != true)
        {
            string errorMsg = data.Value<string>("error") ?? "Unknown error";
            return new JObject() { ["error"] = $"Hartsy API error: {errorMsg}" };
        }

        JArray items = data["items"] as JArray ?? [];
        bool hasMore = data.Value<bool?>("hasMore") ?? false;
        int currentPage = data.Value<int?>("page") ?? page;
        int pageSize = data.Value<int?>("pageSize") ?? limit;

        JArray results = [];
        foreach (JObject item in items.OfType<JObject>())
        {
            string modelId = item.Value<string>("id") ?? "";
            string name = item.Value<string>("title") ?? "";
            string description = item.Value<string>("description") ?? "";
            string baseModel = item.Value<string>("baseArchitecture") ?? "";
            string creator = item.Value<string>("username") ?? "";
            string image = item.Value<string>("thumbnailUrl") ?? item.Value<string>("imageUrl") ?? "";
            string externalUrl = item.Value<string>("externalUrl") ?? "";
            string detailUrl = item.Value<string>("detailUrl") ?? "";
            long? fileSize = item.Value<long?>("fileSize");
            string uploadSource = item.Value<string>("uploadSource") ?? "";

            // Get download count from actionCounts
            long downloads = 0;
            if (item["actionCounts"] is JObject actionCounts)
            {
                downloads = actionCounts.Value<long?>("download") ?? actionCounts.Value<long?>("Download") ?? 0;
            }

            // Map contentType enum to display type
            string contentType = item.Value<string>("contentType") ?? "model";
            string displayType = MapContentType(contentType);

            // Build open URL - prefer detail URL, fallback to external
            string openUrl = !string.IsNullOrWhiteSpace(detailUrl) ? detailUrl : externalUrl;
            if (string.IsNullOrWhiteSpace(openUrl) && !string.IsNullOrWhiteSpace(modelId))
            {
                openUrl = $"{baseUrl}/models/{modelId}";
            }

            // Download URL - use external URL if it points to a downloadable source
            string downloadUrl = "";
            if (!string.IsNullOrWhiteSpace(externalUrl))
            {
                // Check if external URL is a direct download link
                if (externalUrl.Contains("civitai.com") || externalUrl.Contains("huggingface.co"))
                {
                    downloadUrl = externalUrl;
                }
            }

            results.Add(new JObject()
            {
                ["modelId"] = modelId,
                ["modelVersionId"] = "",
                ["name"] = name,
                ["type"] = displayType,
                ["description"] = description,
                ["creator"] = creator,
                ["downloads"] = downloads,
                ["versionName"] = "",
                ["baseModel"] = baseModel,
                ["image"] = image,
                ["downloadUrl"] = downloadUrl,
                ["downloadId"] = modelId,
                ["fileName"] = "",
                ["fileSize"] = fileSize is null ? null : (JToken)fileSize,
                ["openUrl"] = openUrl,
                ["uploadSource"] = uploadSource
            });
        }

        // Calculate total pages estimate (Hartsy uses hasMore flag)
        int totalPages = hasMore ? currentPage + 1 : currentPage;
        int totalItems = results.Count + (hasMore ? limit : 0);

        return new JObject()
        {
            ["success"] = true,
            ["mode"] = "page",
            ["page"] = currentPage,
            ["totalPages"] = totalPages,
            ["totalItems"] = totalItems,
            ["hasMore"] = hasMore,
            ["nextCursor"] = null,
            ["items"] = results
        };
    }

    public async Task<JObject> GetFilterOptionsAsync(Session session)
    {
        string baseUrl = GetBaseUrl(session);
        string url = $"{baseUrl}/api/home/models/filter-options";

        string resp;
        try
        {
            using HttpRequestMessage request = new(HttpMethod.Get, url);
            AddApiKeyHeader(request, session);
            using HttpResponseMessage response = await Utilities.UtilWebClient.SendAsync(request);
            resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                Logs.Warning($"EnhancedDownloader Hartsy filter options failed: {(int)response.StatusCode}");
                return new JObject() { ["error"] = "Failed to load filter options." };
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader Hartsy filter options failed: {ex.ReadableString()}");
            return new JObject() { ["error"] = "Failed to contact Hartsy." };
        }

        JObject data;
        try
        {
            data = resp.ParseToJson();
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader Hartsy filter options returned invalid JSON: {ex.ReadableString()}");
            return new JObject() { ["error"] = "Hartsy returned invalid data." };
        }

        if (data.Value<bool?>("success") != true)
        {
            return new JObject() { ["error"] = "Failed to load filter options." };
        }

        JArray architectures = data["architectures"] as JArray ?? [];
        JArray tags = data["tags"] as JArray ?? [];
        JArray uploadSources = data["uploadSources"] as JArray ?? [];

        return new JObject()
        {
            ["success"] = true,
            ["architectures"] = architectures,
            ["tags"] = tags,
            ["uploadSources"] = uploadSources
        };
    }

    private static string MapContentType(string contentType)
    {
        return (contentType ?? "").ToLowerInvariant() switch
        {
            "model" => "Checkpoint",
            "lora" => "LoRA",
            "preset" => "Preset",
            "workflow" => "Workflow",
            "images" => "Image",
            "dataset" => "Dataset",
            "wildcard" => "Wildcard",
            _ => contentType ?? "Model"
        };
    }
}
