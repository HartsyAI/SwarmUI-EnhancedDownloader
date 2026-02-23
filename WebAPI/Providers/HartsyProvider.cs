using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using System.Net.Http;
using System.Web;

namespace Hartsy.Extensions.Providers;

public class HartsyProvider : IEnhancedDownloaderProvider
{
    public static readonly HartsyProvider Instance = new();

    public string ProviderId => "hartsy";
    public string DisplayName => "Hartsy";
    public bool SupportsFilters => true;
    public bool SupportsNsfw => false;

    private const string BaseUrl = "https://hartsy.ai/api/external";

    private static readonly ProviderCache SearchCache = new(TimeSpan.FromSeconds(60));
    private static readonly ProviderCache FilterCache = new(TimeSpan.FromMinutes(5));
    private static readonly SemaphoreSlim RateLimiter = new(3, 3);

    private static readonly HashSet<string> AllowedSorts = ["created_at", "updated_at", "title", "downloads"];

    private static string GetApiKey(Session session)
    {
        return session.User.GetGenericData("hartsy_api", "key");
    }

    private static void AddApiKeyHeader(HttpRequestMessage request, string apiKey)
    {
        if (!string.IsNullOrEmpty(apiKey))
        {
            request.Headers.Add("X-API-Key", apiKey);
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
            ? sort.Trim().ToLowerInvariant() : "downloads";

        // Map baseModel parameter to architecture for Hartsy
        string architecture = baseModel;
        string tagsClean = (tags ?? "").Trim();

        string apiKey = GetApiKey(session);
        bool hasApiKey = !string.IsNullOrEmpty(apiKey);
        string cacheKey = $"hartsy:{session.User.UserID}:{query}:{page}:{limit}:{architecture}:{sortClean}:{tagsClean}:{hasApiKey}";
        if (SearchCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }

        UrlBuilder builder = new($"{BaseUrl}/models");
        builder.Add("page", page);
        builder.Add("pageSize", limit);
        builder.Add("sort", sortClean);
        builder.Add("sortOrder", "desc");
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

            JObject responseJson = resp.ParseToJson();
            if (responseJson.Value<bool?>("success") != true)
            {
                string errorMsg = responseJson["error"]?.Value<string>("message") ?? "Unknown error";
                return new JObject() { ["success"] = false, ["error"] = $"Hartsy API error: {errorMsg}" };
            }

            JObject data = responseJson["data"] as JObject ?? new JObject();
            JArray items = data["items"] as JArray ?? [];
            bool hasMore = data.Value<bool?>("has_next") ?? false;
            int currentPage = data.Value<int?>("page") ?? page;
            int totalPages = data.Value<int?>("total_pages") ?? (hasMore ? currentPage + 1 : currentPage);
            int totalItems = data.Value<int?>("total_count") ?? 0;

            JArray results = [];
            foreach (JObject item in items.OfType<JObject>())
            {
                string modelId = item.Value<string>("id") ?? "";
                string name = item.Value<string>("title") ?? "";
                string description = item.Value<string>("description") ?? "";
                string itemBaseModel = item.Value<string>("architecture") ?? "";
                string creator = item.Value<string>("author") ?? "";
                string image = item.Value<string>("thumbnail_url") ?? "";
                string modelUrl = item.Value<string>("model_url") ?? "";
                long? fileSize = item.Value<long?>("file_size");
                string uploadSource = item.Value<string>("uploaded_from") ?? "";
                string fileName = item.Value<string>("file_name") ?? "";
                long downloads = item.Value<long?>("downloads_count") ?? 0;

                string openUrl = $"https://hartsy.ai/models/{modelId}";

                results.Add(new JObject()
                {
                    ["modelId"] = modelId,
                    ["modelVersionId"] = "",
                    ["name"] = name,
                    ["type"] = "Checkpoint",
                    ["description"] = description,
                    ["creator"] = creator,
                    ["downloads"] = downloads,
                    ["versionName"] = "",
                    ["baseModel"] = itemBaseModel,
                    ["image"] = image,
                    ["downloadUrl"] = modelUrl,
                    ["downloadId"] = modelId,
                    ["fileName"] = fileName,
                    ["fileSize"] = fileSize is null ? null : (JToken)fileSize,
                    ["openUrl"] = openUrl,
                    ["uploadSource"] = uploadSource
                });
            }

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
        string url = $"{BaseUrl}/models/filter-options";

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

            JObject responseJson = resp.ParseToJson();
            if (responseJson.Value<bool?>("success") != true)
            {
                return new JObject() { ["success"] = false, ["error"] = "Failed to load filter options." };
            }

            JObject data = responseJson["data"] as JObject ?? new JObject();

            // Extract architecture IDs from the objects
            JArray architectureIds = [];
            if (data["architectures"] is JArray archArray)
            {
                foreach (JObject arch in archArray.OfType<JObject>())
                {
                    string archId = arch.Value<string>("id") ?? "";
                    if (!string.IsNullOrEmpty(archId))
                    {
                        architectureIds.Add(archId);
                    }
                }
            }

            JObject result = new()
            {
                ["success"] = true,
                ["architectures"] = architectureIds,
                ["tags"] = data["tags"] as JArray ?? [],
                ["uploadSources"] = data["upload_sources"] as JArray ?? []
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
}
