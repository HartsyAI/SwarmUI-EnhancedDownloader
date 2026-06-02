using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.Collections.Specialized;
using System.Net.Http;
using System.Web;

namespace Hartsy.Extensions.Providers;

/// <summary>Provider implementation for searching and fetching models from the CivitAI API.</summary>
public class CivitAIProvider : IEnhancedDownloaderProvider
{
    public static readonly CivitAIProvider Instance = new();

    public string ProviderId => "civitai";
    public string DisplayName => "CivitAI";
    public bool SupportsFilters => true;
    public bool SupportsNsfw => true;

    public static readonly ProviderCache SearchCache = new(TimeSpan.FromSeconds(60));
    public static readonly ProviderCache TagCache = new(TimeSpan.FromMinutes(5));
    public static readonly ProviderCache VersionCache = new(TimeSpan.FromMinutes(2));
    public static readonly ProviderCache ImagesCache = new(TimeSpan.FromMinutes(5));
    public static readonly SemaphoreSlim RateLimiter = new(3, 3);
    public static readonly HashSet<string> AllowedSorts = ["Highest Rated", "Most Downloaded", "Newest", "Oldest", "Most Liked", "Most Discussed", "Most Collected"];
    public static readonly HashSet<string> AllowedPeriods = ["AllTime", "Year", "Month", "Week", "Day"];
    public const string SfwHost = "civitai.com";
    public const string NsfwHost = "civitai.red";

    /// <summary>Returns the correct CivitAI API host based on whether NSFW is requested and permitted.</summary>
    public static string GetApiHost(bool includeNsfw)
    {
        return includeNsfw ? NsfwHost : SfwHost;
    }

    /// <inheritdoc/>
    public Task<JObject> SearchAsync(Session session, string query = "", int page = 1, int limit = 24, string cursor = "", string type = "", string baseModel = "", string sort = "", bool includeNsfw = false)
    {
        return SearchAsync(session, query, page, limit, cursor, type, baseModel, sort, includeNsfw, period: "", username: "", tag: "", supportsGeneration: false, fromPlatform: false);
    }

    /// <summary>Searches CivitAI with full filter set including period and creator username.</summary>
    public Task<JObject> SearchAsync(Session session, string query, int page, int limit, string cursor, string type, string baseModel, string sort, bool includeNsfw, string period, string username)
    {
        return SearchAsync(session, query, page, limit, cursor, type, baseModel, sort, includeNsfw, period, username, tag: "", supportsGeneration: false, fromPlatform: false);
    }

    /// <summary>Searches CivitAI with the complete filter set including tag, generation-ready, and trained-on-Civitai filters.</summary>
    public async Task<JObject> SearchAsync(Session session, string query, int page, int limit, string cursor, string type, string baseModel, string sort, bool includeNsfw, string period, string username, string tag, bool supportsGeneration, bool fromPlatform)
    {
        if (includeNsfw && !session.User.HasPermission(EnhancedDownloaderExtension.PermEnhancedDownloaderNSFW))
        {
            includeNsfw = false;
        }
        page = Math.Clamp(page, 1, 500);
        limit = Math.Clamp(limit, 1, 100);
        string sortClean = AllowedSorts.Contains((sort ?? "").Trim()) ? sort.Trim() : "Most Downloaded";
        string periodClean = AllowedPeriods.Contains((period ?? "").Trim()) ? period.Trim() : "";
        string typeClean = (type ?? "").Trim();
        if (typeClean == "ControlNet")
        {
            typeClean = "Controlnet";
        }
        string queryClean = (query ?? "").Trim();
        string usernameClean = (username ?? "").Trim();
        if (queryClean.StartsWith('@'))
        {
            int space = queryClean.IndexOf(' ');
            if (space < 0)
            {
                usernameClean = queryClean[1..].Trim();
                queryClean = "";
            }
            else
            {
                usernameClean = queryClean[1..space].Trim();
                queryClean = queryClean[(space + 1)..].Trim();
            }
        }
        string tagClean = (tag ?? "").Trim();
        bool isQueryMode = !string.IsNullOrWhiteSpace(queryClean);
        string civitaiApiKey = session.User.GetGenericData("civitai_api", "key");
        bool hasApiKey = !string.IsNullOrEmpty(civitaiApiKey);
        string cacheKey = $"civitai:{session.User.UserID}:{queryClean}:{page}:{limit}:{cursor}:{typeClean}:{baseModel}:{sortClean}:{periodClean}:{usernameClean}:{tagClean}:{supportsGeneration}:{fromPlatform}:{includeNsfw}:{hasApiKey}";
        if (SearchCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }
        string url = BuildSearchUrl(queryClean, page, limit, cursor, typeClean, baseModel, sortClean, includeNsfw, isQueryMode, periodClean, usernameClean, tagClean, supportsGeneration, fromPlatform);
        JObject data = await FetchJsonAsync(url, "CivitAI search", civitaiApiKey);
        if (data.ContainsKey("error"))
        {
            return data;
        }
        JArray items = data["items"] as JArray ?? [];
        JObject meta = data["metadata"] as JObject ?? [];
        int currentPage = meta.Value<int?>("currentPage") ?? page;
        int totalPages = meta.Value<int?>("totalPages") ?? 1;
        int totalItems = meta.Value<int?>("totalItems") ?? items.Count;
        string nextCursor = isQueryMode ? ExtractNextCursor(meta) : null;
        JArray results = [];
        foreach (JObject item in items.OfType<JObject>())
        {
            JObject bestVersion = (item["modelVersions"] as JArray)?.OfType<JObject>().FirstOrDefault();
            results.Add(ModelResultBuilder.FromCivitAI(item, bestVersion));
        }
        if (isQueryMode && results.Count < limit && !string.IsNullOrWhiteSpace(nextCursor) && long.TryParse(nextCursor.Trim(), out long nextCursorAsId) && results.OfType<JObject>().All(r => (r.Value<long?>("modelId") ?? 0) != nextCursorAsId))
        {
            JObject extra = await TryFetchCursorModel(nextCursorAsId, civitaiApiKey, queryClean, typeClean, includeNsfw);
            if (extra is not null)
            {
                results.Add(extra);
                nextCursor = null;
            }
        }
        JObject result = new()
        {
            ["success"] = true,
            ["mode"] = isQueryMode ? "cursor" : "page",
            ["page"] = currentPage,
            ["totalPages"] = totalPages,
            ["totalItems"] = totalItems,
            ["nextCursor"] = nextCursor,
            ["items"] = results
        };
        SearchCache.Set(cacheKey, result);
        return result;
    }

    /// <summary>Constructs the CivitAI API search URL with all query parameters. Routes to civitai.red when NSFW is requested.</summary>
    public static string BuildSearchUrl(string query, int page, int limit, string cursor, string type, string baseModel, string sort, bool includeNsfw, bool isQueryMode, string period, string username, string tag, bool supportsGeneration, bool fromPlatform)
    {
        UrlBuilder builder = new($"https://{GetApiHost(includeNsfw)}/api/v1/models");
        builder.Add("limit", limit);
        if (!isQueryMode)
        {
            builder.Add("page", page);
        }
        if (isQueryMode && !string.IsNullOrWhiteSpace(cursor))
        {
            builder.Add("cursor", cursor);
        }
        if (isQueryMode)
        {
            builder.Add("query", query);
        }
        if (!string.IsNullOrWhiteSpace(type) && type != "All")
        {
            builder.Add("types", type);
        }
        if (!string.IsNullOrWhiteSpace(baseModel) && baseModel != "All")
        {
            builder.Add("baseModels", baseModel);
        }
        if (!string.IsNullOrWhiteSpace(username))
        {
            builder.Add("username", username);
        }
        if (!string.IsNullOrWhiteSpace(period))
        {
            builder.Add("period", period);
        }
        if (!string.IsNullOrWhiteSpace(tag))
        {
            builder.Add("tag", tag);
        }
        if (supportsGeneration)
        {
            builder.AddIf(true, "supportsGeneration", true);
        }
        if (fromPlatform)
        {
            builder.AddIf(true, "fromPlatform", true);
        }
        builder.Add("sort", sort);
        builder.Add("primaryFileOnly", "true");
        if (includeNsfw)
        {
            builder.AddIf(true, "nsfw", true);
        }
        return builder.ToString();
    }

    /// <summary>Extracts the next-page cursor from CivitAI response metadata.</summary>
    public static string ExtractNextCursor(JObject meta)
    {
        string nextCursor = meta.Value<string>("nextCursor");
        if (!string.IsNullOrWhiteSpace(nextCursor))
        {
            return nextCursor;
        }
        string nextPage = meta.Value<string>("nextPage") ?? "";
        if (string.IsNullOrWhiteSpace(nextPage))
        {
            return null;
        }
        try
        {
            Uri nextUri = new(nextPage);
            NameValueCollection qs = HttpUtility.ParseQueryString(nextUri.Query);
            return qs.Get("cursor");
        }
        catch (Exception ex)
        {
            Logs.Verbose($"EnhancedDownloader CivitAI ExtractNextCursor failed for '{nextPage}': {ex.ReadableString()}");
            return null;
        }
    }

    /// <summary>Sends a rate-limited GET request to the given URL and returns the parsed JSON response.</summary>
    public static async Task<JObject> FetchJsonAsync(string url, string label, string apiKey = null)
    {
        await RateLimiter.WaitAsync();
        try
        {
            using HttpRequestMessage request = new(HttpMethod.Get, url);
            if (!string.IsNullOrEmpty(apiKey))
            {
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", ModelsAPI.TokenTextLimiter.TrimToMatches(apiKey));
            }
            using HttpResponseMessage response = await ProviderHttpClient.Client.SendAsync(request);
            string resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader {label} failed: {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["success"] = false, ["error"] = $"CivitAI error {(int)response.StatusCode}: {trimmed}" };
            }
            return resp.ParseToJson();
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader {label} failed: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = "Failed to contact CivitAI." };
        }
        finally
        {
            RateLimiter.Release();
        }
    }

    /// <summary>Fetches CivitAI tag suggestions for autocomplete. Cached for 5 minutes per query prefix.</summary>
    public async Task<JObject> GetTagsAsync(Session session, string query, int limit = 20)
    {
        limit = Math.Clamp(limit, 1, 200);
        string queryClean = (query ?? "").Trim();
        string cacheKey = $"tags:{queryClean}:{limit}";
        if (TagCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }
        string apiKey = session.User.GetGenericData("civitai_api", "key");
        UrlBuilder builder = new($"https://{SfwHost}/api/v1/tags");
        builder.Add("limit", limit);
        if (!string.IsNullOrWhiteSpace(queryClean))
        {
            builder.Add("query", queryClean);
        }
        JObject data = await FetchJsonAsync(builder.ToString(), "CivitAI tags", apiKey);
        if (data.ContainsKey("error"))
        {
            return data;
        }
        JArray items = data["items"] as JArray ?? [];
        JArray tags = [];
        foreach (JObject item in items.OfType<JObject>())
        {
            string name = item.Value<string>("name") ?? "";
            if (string.IsNullOrWhiteSpace(name))
            {
                continue;
            }
            tags.Add(new JObject()
            {
                ["name"] = name,
                ["modelCount"] = item.Value<int?>("modelCount") ?? 0
            });
        }
        JObject result = new()
        {
            ["success"] = true,
            ["tags"] = tags
        };
        TagCache.Set(cacheKey, result);
        return result;
    }

    /// <summary>Fetches example images (with prompt metadata) for a specific model version. Cached for 5 minutes.</summary>
    public async Task<JObject> GetExampleImagesAsync(Session session, long modelVersionId, int limit = 6, bool includeNsfw = false)
    {
        if (modelVersionId <= 0)
        {
            return new JObject() { ["success"] = false, ["error"] = "Model version ID is required." };
        }
        if (includeNsfw && !session.User.HasPermission(EnhancedDownloaderExtension.PermEnhancedDownloaderNSFW))
        {
            includeNsfw = false;
        }
        limit = Math.Clamp(limit, 1, 50);
        string cacheKey = $"images:{modelVersionId}:{limit}:{includeNsfw}";
        if (ImagesCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }
        string apiKey = session.User.GetGenericData("civitai_api", "key");
        UrlBuilder builder = new($"https://{GetApiHost(includeNsfw)}/api/v1/images");
        builder.Add("modelVersionId", modelVersionId.ToString());
        builder.Add("limit", limit);
        builder.Add("sort", "Most Reactions");
        if (includeNsfw)
        {
            builder.AddIf(true, "nsfw", true);
        }
        JObject data = await FetchJsonAsync(builder.ToString(), $"CivitAI images for version {modelVersionId}", apiKey);
        if (data.ContainsKey("error"))
        {
            return data;
        }
        JArray items = data["items"] as JArray ?? [];
        JArray examples = [];
        foreach (JObject item in items.OfType<JObject>())
        {
            string imgUrl = item.Value<string>("url") ?? "";
            if (string.IsNullOrWhiteSpace(imgUrl))
            {
                continue;
            }
            JObject meta = item["meta"] as JObject;
            examples.Add(new JObject()
            {
                ["url"] = imgUrl,
                ["width"] = item.Value<int?>("width") ?? 0,
                ["height"] = item.Value<int?>("height") ?? 0,
                ["nsfwLevel"] = item.Value<int?>("nsfwLevel") ?? 0,
                ["prompt"] = meta?.Value<string>("prompt") ?? "",
                ["negativePrompt"] = meta?.Value<string>("negativePrompt") ?? "",
                ["seed"] = meta?.Value<long?>("seed"),
                ["sampler"] = meta?.Value<string>("sampler") ?? "",
                ["cfgScale"] = meta?.Value<double?>("cfgScale"),
                ["steps"] = meta?.Value<int?>("steps")
            });
        }
        JObject result = new()
        {
            ["success"] = true,
            ["images"] = examples
        };
        ImagesCache.Set(cacheKey, result);
        return result;
    }

    /// <summary>Pre-flight check on a model version: returns auth/early-access state via the /mini/{id} endpoint.</summary>
    public async Task<JObject> CheckVersionAsync(Session session, long modelVersionId)
    {
        if (modelVersionId <= 0)
        {
            return new JObject() { ["success"] = false, ["error"] = "Model version ID is required." };
        }
        string cacheKey = $"mini:{modelVersionId}";
        if (VersionCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }
        string apiKey = session.User.GetGenericData("civitai_api", "key");
        string url = $"https://{SfwHost}/api/v1/model-versions/mini/{modelVersionId}";
        JObject data = await FetchJsonAsync(url, $"CivitAI mini check {modelVersionId}", apiKey);
        if (data.ContainsKey("error"))
        {
            return data;
        }
        string earlyAccessEndsAt = data.Value<string>("earlyAccessEndsAt") ?? "";
        bool inEarlyAccess = false;
        if (!string.IsNullOrWhiteSpace(earlyAccessEndsAt) && DateTime.TryParse(earlyAccessEndsAt, out DateTime endsDt) && endsDt > DateTime.UtcNow)
        {
            inEarlyAccess = true;
        }
        JObject result = new()
        {
            ["success"] = true,
            ["modelVersionId"] = modelVersionId,
            ["modelName"] = data.Value<string>("modelName") ?? "",
            ["versionName"] = data.Value<string>("versionName") ?? "",
            ["baseModel"] = data.Value<string>("baseModel") ?? "",
            ["requireAuth"] = data.Value<bool?>("requireAuth") ?? false,
            ["canGenerate"] = data.Value<bool?>("canGenerate") ?? false,
            ["checkPermission"] = data.Value<bool?>("checkPermission") ?? false,
            ["earlyAccessEndsAt"] = earlyAccessEndsAt,
            ["inEarlyAccess"] = inEarlyAccess,
            ["freeTrialLimit"] = data.Value<int?>("freeTrialLimit"),
            ["air"] = data.Value<string>("air") ?? "",
            ["hasApiKey"] = !string.IsNullOrEmpty(apiKey)
        };
        VersionCache.Set(cacheKey, result);
        return result;
    }

    /// <summary>Attempts to fetch a single model by ID when the cursor points to it, returning null if it doesn't match filters.</summary>
    public static async Task<JObject> TryFetchCursorModel(long modelId, string apiKey, string query, string type, bool includeNsfw)
    {
        try
        {
            string url = $"https://{GetApiHost(includeNsfw)}/api/v1/models/{modelId}";
            JObject modelObj = await FetchJsonAsync(url, $"CivitAI by-ID {modelId}", apiKey);
            if (modelObj.ContainsKey("error"))
            {
                return null;
            }
            string modelName = modelObj.Value<string>("name") ?? "";
            string modelType = modelObj.Value<string>("type") ?? "";
            bool matchesType = string.IsNullOrWhiteSpace(type) || type == "All" || string.Equals(modelType, type, StringComparison.OrdinalIgnoreCase);
            bool matchesQuery = modelName.Contains(query.Trim(), StringComparison.OrdinalIgnoreCase);
            if (!matchesType || !matchesQuery)
            {
                return null;
            }
            JObject bestVersion = (modelObj["modelVersions"] as JArray)?.OfType<JObject>().FirstOrDefault();
            return ModelResultBuilder.FromCivitAI(modelObj, bestVersion, modelId);
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader CivitAI by-ID fetch failed for '{modelId}': {ex.ReadableString()}");
            return null;
        }
    }
}
