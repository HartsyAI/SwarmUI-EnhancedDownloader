using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.Collections.Specialized;
using System.Net.Http;
using System.Web;

namespace Hartsy.Extensions.Providers;

public class CivitAIProvider : IEnhancedDownloaderProvider
{
    public static readonly CivitAIProvider Instance = new();

    public string ProviderId => "civitai";
    public string DisplayName => "CivitAI";
    public bool SupportsFilters => true;
    public bool SupportsNsfw => true;

    private static readonly ProviderCache SearchCache = new(TimeSpan.FromSeconds(60));
    private static readonly SemaphoreSlim RateLimiter = new(3, 3);

    private static readonly HashSet<string> AllowedSorts = ["Highest Rated", "Most Downloaded", "Newest"];

    public async Task<JObject> SearchAsync(Session session,
        string query = "", int page = 1, int limit = 24, string cursor = "",
        string type = "", string baseModel = "", string sort = "", bool includeNsfw = false)
    {
        if (includeNsfw && !session.User.HasPermission(EnhancedDownloaderExtension.PermEnhancedDownloaderNSFW))
        {
            includeNsfw = false;
        }
        page = Math.Clamp(page, 1, 500);
        limit = Math.Clamp(limit, 1, 100);
        string sortClean = AllowedSorts.Contains((sort ?? "").Trim()) ? sort.Trim() : "Most Downloaded";
        string typeClean = (type ?? "").Trim();
        if (typeClean == "ControlNet")
        {
            typeClean = "Controlnet";
        }

        bool isQueryMode = !string.IsNullOrWhiteSpace(query);
        string civitaiApiKey = session.User.GetGenericData("civitai_api", "key");
        bool hasApiKey = !string.IsNullOrEmpty(civitaiApiKey);
        string cacheKey = $"civitai:{session.User.UserID}:{query}:{page}:{limit}:{cursor}:{typeClean}:{baseModel}:{sortClean}:{includeNsfw}:{hasApiKey}";
        if (SearchCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }
        string url = BuildSearchUrl(query, page, limit, cursor, typeClean, baseModel, sortClean, includeNsfw, isQueryMode);

        JObject data = await FetchJsonAsync(url, "CivitAI search", civitaiApiKey);
        if (data.ContainsKey("error"))
        {
            return data;
        }

        JArray items = data["items"] as JArray ?? [];
        JObject meta = data["metadata"] as JObject ?? new JObject();
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

        // Workaround: CivitAI sometimes returns a nextCursor pointing to a model ID not in the current page.
        if (isQueryMode && results.Count < limit && !string.IsNullOrWhiteSpace(nextCursor)
            && long.TryParse(nextCursor.Trim(), out long nextCursorAsId)
            && results.OfType<JObject>().All(r => (r.Value<long?>("modelId") ?? 0) != nextCursorAsId))
        {
            JObject extra = await TryFetchCursorModel(nextCursorAsId, civitaiApiKey, query, typeClean);
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

    private static string BuildSearchUrl(string query, int page, int limit, string cursor,
        string type, string baseModel, string sort, bool includeNsfw, bool isQueryMode)
    {
        UrlBuilder builder = new("https://civitai.com/api/v1/models");
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
        builder.Add("sort", sort);
        if (includeNsfw)
        {
            builder.AddIf(true, "nsfw", true);
        }
        return builder.ToString();
    }

    private static string ExtractNextCursor(JObject meta)
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

    private static async Task<JObject> FetchJsonAsync(string url, string label, string apiKey = null)
    {
        await RateLimiter.WaitAsync();
        try
        {
            using HttpRequestMessage request = new(HttpMethod.Get, url);
            if (!string.IsNullOrEmpty(apiKey))
            {
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue(
                    "Bearer", ModelsAPI.TokenTextLimiter.TrimToMatches(apiKey));
            }
            using HttpResponseMessage response = await Utilities.UtilWebClient.SendAsync(request);
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

    private static async Task<JObject> TryFetchCursorModel(long modelId, string apiKey, string query, string type)
    {
        try
        {
            string url = $"https://civitai.com/api/v1/models/{modelId}";
            JObject modelObj = await FetchJsonAsync(url, $"CivitAI by-ID {modelId}", apiKey);
            if (modelObj.ContainsKey("error"))
            {
                return null;
            }
            string modelName = modelObj.Value<string>("name") ?? "";
            string modelType = modelObj.Value<string>("type") ?? "";
            bool matchesType = string.IsNullOrWhiteSpace(type) || type == "All"
                || string.Equals(modelType, type, StringComparison.OrdinalIgnoreCase);
            bool matchesQuery = modelName.Contains(query.Trim(), StringComparison.OrdinalIgnoreCase);
            if (!matchesType || !matchesQuery)
            {
                return null;
            }
            JObject bestVersion = (modelObj["modelVersions"] as JArray)?.OfType<JObject>().FirstOrDefault();
            return ModelResultBuilder.FromCivitAI(modelObj, bestVersion, modelId);
        }
        catch
        {
            Logs.Warning($"EnhancedDownloader CivitAI by-ID fetch failed for '{modelId}'.");
            return null;
        }
    }
}
