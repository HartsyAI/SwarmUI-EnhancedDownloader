using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.Net.Http;
using System.Web;

namespace Hartsy.Extensions.Providers;

/// <summary>Provider implementation for searching and fetching models from the Hartsy API.</summary>
public class HartsyProvider : IEnhancedDownloaderProvider
{
    public static readonly HartsyProvider Instance = new();
    public string ProviderId => "hartsy";
    public string DisplayName => "Hartsy";
    public bool SupportsFilters => true;
    public bool SupportsNsfw => false;
    public const string BaseUrl = "https://hartsy.ai/api/external";
    public static readonly ProviderCache SearchCache = new(TimeSpan.FromSeconds(60));
    public static readonly ProviderCache FilterCache = new(TimeSpan.FromMinutes(5));
    public static readonly SemaphoreSlim RateLimiter = new(3, 3);
    public static readonly HashSet<string> AllowedSorts = ["created_at", "updated_at", "title", "downloads"];

    /// <summary>Retrieves the Hartsy API key from the user's stored credentials.</summary>
    public static string GetApiKey(Session session)
    {
        return session.User.GetGenericData("hartsy_api", "key");
    }

    /// <summary>Adds the Hartsy API key header to an outgoing HTTP request if available.</summary>
    public static void AddApiKeyHeader(HttpRequestMessage request, string apiKey)
    {
        if (!string.IsNullOrEmpty(apiKey))
        {
            request.Headers.Add("X-API-Key", ModelsAPI.TokenTextLimiter.TrimToMatches(apiKey));
        }
    }

    /// <inheritdoc/>
    public Task<JObject> SearchAsync(Session session, string query = "", int page = 1, int limit = 24, string cursor = "", string type = "", string baseModel = "", string sort = "", bool includeNsfw = false)
    {
        return SearchAsync(session, query, page, limit, cursor, type, baseModel, sort, includeNsfw, tags: "");
    }

    /// <summary>Searches Hartsy models with pagination, architecture filter, sort order, and optional tag filtering.</summary>
    public async Task<JObject> SearchAsync(Session session, string query, int page, int limit, string cursor, string type, string baseModel, string sort, bool includeNsfw, string tags)
    {
        page = Math.Clamp(page, 1, 500);
        limit = Math.Clamp(limit, 1, 100);
        string sortClean = AllowedSorts.Contains((sort ?? "").Trim().ToLowerInvariant()) ? sort.Trim().ToLowerInvariant() : "downloads";
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
            using HttpResponseMessage response = await ProviderHttpClient.Client.SendAsync(request);
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
            JObject data = responseJson["data"] as JObject ?? [];
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
                bool isNsfw = item.Value<bool?>("is_nsfw") ?? false;
                string subscriptionRequired = item.Value<string>("subscription_required") ?? "";
                JArray itemTags = item["tags"] as JArray ?? [];
                string openUrl = $"https://hartsy.ai/models/{modelId}";
                JObject resultItem = new()
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
                    ["uploadSource"] = uploadSource,
                    ["isNsfw"] = isNsfw,
                    ["subscriptionRequired"] = subscriptionRequired,
                    ["tags"] = itemTags
                };
                if (item["torrent"] is JObject torrentObj)
                {
                    resultItem["torrent"] = new JObject()
                    {
                        ["magnetLink"] = torrentObj.Value<string>("magnet_link") ?? "",
                        ["torrentUrl"] = torrentObj.Value<string>("torrent_url") ?? "",
                        ["infoHash"] = torrentObj.Value<string>("info_hash") ?? ""
                    };
                }
                results.Add(resultItem);
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

    /// <summary>Fetches available filter options (architectures, tags, upload sources) from the Hartsy API.</summary>
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
            using HttpResponseMessage response = await ProviderHttpClient.Client.SendAsync(request);
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
            JObject data = responseJson["data"] as JObject ?? [];
            JArray architectures = [];
            if (data["architectures"] is JArray archArray)
            {
                foreach (JObject arch in archArray.OfType<JObject>())
                {
                    string archId = arch.Value<string>("id") ?? "";
                    if (!string.IsNullOrEmpty(archId))
                    {
                        architectures.Add(new JObject()
                        {
                            ["id"] = archId,
                            ["displayName"] = arch.Value<string>("display_name") ?? archId,
                            ["modelCount"] = arch.Value<int?>("model_count") ?? 0
                        });
                    }
                }
            }
            JObject result = new()
            {
                ["success"] = true,
                ["architectures"] = architectures,
                ["tags"] = data["tags"] as JArray ?? [],
                ["uploadSources"] = data["upload_sources"] as JArray ?? [],
                ["subscriptionTiers"] = data["subscription_tiers"] as JArray ?? []
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

    /// <summary>Fetches download info for a specific model from the Hartsy API, which records analytics and provides hash/torrent data.</summary>
    public async Task<JObject> GetModelDownloadAsync(Session session, string modelId)
    {
        if (string.IsNullOrWhiteSpace(modelId))
        {
            return new JObject() { ["success"] = false, ["error"] = "Model ID is required." };
        }
        string apiKey = GetApiKey(session);
        string url = $"{BaseUrl}/models/{Uri.EscapeDataString(modelId)}/download";
        await RateLimiter.WaitAsync();
        try
        {
            using HttpRequestMessage request = new(HttpMethod.Get, url);
            AddApiKeyHeader(request, apiKey);
            using HttpResponseMessage response = await ProviderHttpClient.Client.SendAsync(request);
            string resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader Hartsy download info failed: {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["success"] = false, ["error"] = $"Hartsy error {(int)response.StatusCode}: {trimmed}" };
            }
            JObject responseJson = resp.ParseToJson();
            if (responseJson.Value<bool?>("success") != true)
            {
                string errorMsg = responseJson["error"]?.Value<string>("message") ?? "Unknown error";
                return new JObject() { ["success"] = false, ["error"] = $"Hartsy API error: {errorMsg}" };
            }
            JObject data = responseJson["data"] as JObject ?? [];
            JObject result = new()
            {
                ["success"] = true,
                ["modelId"] = data.Value<string>("model_id") ?? modelId,
                ["title"] = data.Value<string>("title") ?? "",
                ["fileName"] = data.Value<string>("file_name") ?? "",
                ["fileSize"] = data.Value<long?>("file_size"),
                ["downloadUrl"] = data.Value<string>("download_url") ?? "",
                ["hashSha256"] = data.Value<string>("hash_sha256") ?? "",
                ["downloadsCount"] = data.Value<long?>("downloads_count") ?? 0
            };
            if (data["torrent"] is JObject torrentObj)
            {
                result["torrent"] = new JObject()
                {
                    ["magnetLink"] = torrentObj.Value<string>("magnet_link") ?? "",
                    ["torrentUrl"] = torrentObj.Value<string>("torrent_url") ?? "",
                    ["infoHash"] = torrentObj.Value<string>("info_hash") ?? ""
                };
            }
            return result;
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader Hartsy download info failed: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = "Failed to contact Hartsy." };
        }
        finally
        {
            RateLimiter.Release();
        }
    }

    /// <summary>Fetches version variants (different architectures) for a specific model from the Hartsy API.</summary>
    public async Task<JObject> GetModelVersionsAsync(Session session, string modelId)
    {
        if (string.IsNullOrWhiteSpace(modelId))
        {
            return new JObject() { ["success"] = false, ["error"] = "Model ID is required." };
        }
        string apiKey = GetApiKey(session);
        string url = $"{BaseUrl}/models/{Uri.EscapeDataString(modelId)}/versions";
        await RateLimiter.WaitAsync();
        try
        {
            using HttpRequestMessage request = new(HttpMethod.Get, url);
            AddApiKeyHeader(request, apiKey);
            using HttpResponseMessage response = await ProviderHttpClient.Client.SendAsync(request);
            string resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader Hartsy versions failed: {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["success"] = false, ["error"] = $"Hartsy error {(int)response.StatusCode}: {trimmed}" };
            }
            JObject responseJson = resp.ParseToJson();
            if (responseJson.Value<bool?>("success") != true)
            {
                string errorMsg = responseJson["error"]?.Value<string>("message") ?? "Unknown error";
                return new JObject() { ["success"] = false, ["error"] = $"Hartsy API error: {errorMsg}" };
            }
            JObject data = responseJson["data"] as JObject ?? [];
            JArray versions = data["versions"] as JArray ?? [];
            JArray results = [];
            foreach (JObject ver in versions.OfType<JObject>())
            {
                results.Add(new JObject()
                {
                    ["id"] = ver.Value<string>("id") ?? "",
                    ["title"] = ver.Value<string>("title") ?? "",
                    ["versionLabel"] = ver.Value<string>("version_label") ?? "",
                    ["architecture"] = ver.Value<string>("architecture") ?? "",
                    ["fileName"] = ver.Value<string>("file_name") ?? "",
                    ["fileSize"] = ver.Value<long?>("file_size"),
                    ["description"] = ver.Value<string>("description") ?? "",
                    ["thumbnailUrl"] = ver.Value<string>("thumbnail_url") ?? "",
                    ["createdAt"] = ver.Value<string>("created_at") ?? ""
                });
            }
            return new JObject()
            {
                ["success"] = true,
                ["parentModelId"] = data.Value<string>("parent_model_id") ?? modelId,
                ["versions"] = results
            };
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader Hartsy versions failed: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = "Failed to contact Hartsy." };
        }
        finally
        {
            RateLimiter.Release();
        }
    }
}
