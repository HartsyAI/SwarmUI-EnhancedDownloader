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
    public string DisplayName => "Hartsy";
    public bool SupportsFilters => true;
    public bool SupportsNsfw => false;

    private const string DefaultBaseUrl = "https://dev.hartsy.ai";

    private static readonly ProviderCache SearchCache = new(TimeSpan.FromSeconds(60));
    private static readonly ProviderCache FilterCache = new(TimeSpan.FromMinutes(5));
    private static readonly SemaphoreSlim RateLimiter = new(3, 3);

    private static readonly HashSet<string> AllowedSorts = ["popular", "newest", "downloads"];

    private static string GetApiKey(Session session)
    {
        return session.User.GetGenericData("hartsy_api", "key");
    }

    private static void AddApiKeyHeader(HttpRequestMessage request, string apiKey)
    {
        if (!string.IsNullOrEmpty(apiKey))
        {
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        }
    }

    public Task<JObject> SearchAsync(Session session,
        string query = "", int page = 1, int limit = 24, string cursor = "",
        string type = "", string baseModel = "", string sort = "", bool includeNsfw = false)
    {
        return SearchAsync(session, query, page, limit, cursor, type, baseModel, sort, includeNsfw, tags: "");
    }

    public async Task<JObject> SearchAsync(Session session,
        string query, int page, int limit, string cursor,
        string type, string baseModel, string sort, bool includeNsfw,
        string tags)
    {
        page = Math.Clamp(page, 1, 500);
        limit = Math.Clamp(limit, 1, 100);
        string sortClean = AllowedSorts.Contains((sort ?? "").Trim().ToLowerInvariant())
            ? sort.Trim().ToLowerInvariant() : "popular";

        // Map baseModel parameter to architecture for Hartsy
        string architecture = baseModel;
        string tagsClean = (tags ?? "").Trim();

        string apiKey = GetApiKey(session);
        bool hasApiKey = !string.IsNullOrEmpty(apiKey);
        string cacheKey = $"hartsy:{query}:{page}:{limit}:{architecture}:{sortClean}:{tagsClean}:{hasApiKey}";
        if (SearchCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }

        UrlBuilder builder = new($"{BaseUrl}/api/v1/models");
        builder.Add("page", page);
        builder.Add("pageSize", limit);
        builder.Add("sort", sortClean);
        if (!string.IsNullOrWhiteSpace(query))
        {
            builder.Add("search", query);
        }
        if (!string.IsNullOrWhiteSpace(architecture) && architecture != "All")
        {
            builder.Add("architecture", architecture);
        }
        if (!string.IsNullOrWhiteSpace(tagsClean))
        {
            builder.Add("tags", tagsClean);
        }
        builder.Add("isApiModel", "false");
        string url = builder.ToString();

        await RateLimiter.WaitAsync();
        try
        {
            using HttpRequestMessage request = new(HttpMethod.Get, url);
            AddApiKeyHeader(request, apiKey);
            using HttpResponseMessage response = await Utilities.UtilWebClient.SendAsync(request);
            string resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader Hartsy search failed: {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["success"] = false, ["error"] = $"Hartsy error {(int)response.StatusCode}: {trimmed}" };
            }

            JObject data = resp.ParseToJson();
            if (data.Value<bool?>("success") != true)
            {
                string errorMsg = data.Value<string>("error") ?? "Unknown error";
                return new JObject() { ["success"] = false, ["error"] = $"Hartsy API error: {errorMsg}" };
            }

            JArray items = data["items"] as JArray ?? [];
            bool hasMore = data.Value<bool?>("hasMore") ?? false;
            int currentPage = data.Value<int?>("page") ?? page;

            JArray results = [];
            foreach (JObject item in items.OfType<JObject>())
            {
                string modelId = item.Value<string>("id") ?? "";
                string name = item.Value<string>("title") ?? "";
                string description = item.Value<string>("description") ?? "";
                string itemBaseModel = item.Value<string>("baseArchitecture") ?? "";
                string creator = item.Value<string>("username") ?? "";
                string image = item.Value<string>("thumbnailUrl") ?? item.Value<string>("imageUrl") ?? "";
                string externalUrl = item.Value<string>("externalUrl") ?? "";
                string detailUrl = item.Value<string>("detailUrl") ?? "";
                long? fileSize = item.Value<long?>("fileSize");
                string uploadSource = item.Value<string>("uploadSource") ?? "";

                long downloads = 0;
                if (item["actionCounts"] is JObject actionCounts)
                {
                    downloads = actionCounts.Value<long?>("download") ?? actionCounts.Value<long?>("Download") ?? 0;
                }

                string displayType = MapContentType(item.Value<string>("contentType") ?? "model");
                string openUrl = !string.IsNullOrWhiteSpace(detailUrl) ? detailUrl : externalUrl;
                if (string.IsNullOrWhiteSpace(openUrl) && !string.IsNullOrWhiteSpace(modelId))
                {
                    openUrl = $"{BaseUrl}/models/{modelId}";
                }

                string downloadUrl = "";
                if (!string.IsNullOrWhiteSpace(externalUrl)
                    && (externalUrl.Contains("civitai.com") || externalUrl.Contains("huggingface.co")))
                {
                    downloadUrl = externalUrl;
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
                    ["baseModel"] = itemBaseModel,
                    ["image"] = image,
                    ["downloadUrl"] = downloadUrl,
                    ["downloadId"] = modelId,
                    ["fileName"] = "",
                    ["fileSize"] = fileSize is null ? null : (JToken)fileSize,
                    ["openUrl"] = openUrl,
                    ["uploadSource"] = uploadSource
                });
            }

            int totalPages = hasMore ? currentPage + 1 : currentPage;
            int totalItems = results.Count + (hasMore ? limit : 0);

            JObject result = new()
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
            SearchCache.Set(cacheKey, result);
            return result;
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader Hartsy search failed: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = "Failed to contact Hartsy." };
        }
        finally
        {
            RateLimiter.Release();
        }
    }

    public async Task<JObject> GetFilterOptionsAsync(Session session)
    {
        string cacheKey = "hartsy:filters";
        if (FilterCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }

        string apiKey = GetApiKey(session);
        string url = $"{BaseUrl}/api/v1/models/filter-options";

        await RateLimiter.WaitAsync();
        try
        {
            using HttpRequestMessage request = new(HttpMethod.Get, url);
            AddApiKeyHeader(request, apiKey);
            using HttpResponseMessage response = await Utilities.UtilWebClient.SendAsync(request);
            string resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                Logs.Warning($"EnhancedDownloader Hartsy filter options failed: {(int)response.StatusCode}");
                return new JObject() { ["success"] = false, ["error"] = "Failed to load filter options." };
            }

            JObject data = resp.ParseToJson();
            if (data.Value<bool?>("success") != true)
            {
                return new JObject() { ["success"] = false, ["error"] = "Failed to load filter options." };
            }

            JObject result = new()
            {
                ["success"] = true,
                ["architectures"] = data["architectures"] as JArray ?? [],
                ["tags"] = data["tags"] as JArray ?? [],
                ["uploadSources"] = data["uploadSources"] as JArray ?? []
            };
            FilterCache.Set(cacheKey, result);
            return result;
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader Hartsy filter options failed: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = "Failed to contact Hartsy." };
        }
        finally
        {
            RateLimiter.Release();
        }
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
