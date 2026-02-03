using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.Collections.Specialized;
using System.Net.Http;
using System.Web;

namespace EnhancedDownloader.Providers;

public class CivitAIProvider : IEnhancedDownloaderProvider
{
    public static readonly CivitAIProvider Instance = new();

    public string ProviderId => "civitai";

    public async Task<JObject> SearchAsync(Session session,
        string query = "",
        int page = 1,
        int limit = 24,
        string cursor = "",
        string type = "",
        string baseModel = "",
        string sort = "Most Downloaded",
        bool includeNsfw = false)
    {
        if (includeNsfw && !session.User.HasPermission(EnhancedDownloaderExtension.PermEnhancedDownloaderNSFW))
        {
            includeNsfw = false;
        }

        page = Math.Clamp(page, 1, 500);
        limit = Math.Clamp(limit, 1, 100);
        string sortClean = (sort ?? "").Trim();
        HashSet<string> allowedSorts = ["Highest Rated", "Most Downloaded", "Newest"];
        if (string.IsNullOrWhiteSpace(sortClean) || !allowedSorts.Contains(sortClean))
        {
            sortClean = "Most Downloaded";
        }
        string typeClean = (type ?? "").Trim();
        if (typeClean == "ControlNet")
        {
            typeClean = "Controlnet";
        }

        bool isQueryMode = !string.IsNullOrWhiteSpace(query);
        string url = isQueryMode ? $"https://civitai.com/api/v1/models?limit={limit}" : $"https://civitai.com/api/v1/models?page={page}&limit={limit}";
        if (isQueryMode && !string.IsNullOrWhiteSpace(cursor))
        {
            url += $"&cursor={HttpUtility.UrlEncode(cursor)}";
        }
        if (isQueryMode)
        {
            url += $"&query={HttpUtility.UrlEncode(query)}";
        }
        if (!string.IsNullOrWhiteSpace(typeClean) && typeClean != "All")
        {
            url += $"&types={HttpUtility.UrlEncode(typeClean)}";
        }
        if (!string.IsNullOrWhiteSpace(baseModel) && baseModel != "All")
        {
            url += $"&baseModels={HttpUtility.UrlEncode(baseModel)}";
        }
        url += $"&sort={HttpUtility.UrlEncode(sortClean)}";
        if (includeNsfw)
        {
            url += "&nsfw=true";
        }

        string civitaiApiKey = session.User.GetGenericData("civitai_api", "key");
        if (!string.IsNullOrEmpty(civitaiApiKey))
        {
            if (!url.Contains("?token=") && !url.Contains("&token="))
            {
                url += "&token=" + ModelsAPI.TokenTextLimiter.TrimToMatches(civitaiApiKey);
            }
        }

        string resp;
        try
        {
            using HttpResponseMessage response = await Utilities.UtilWebClient.GetAsync(url);
            resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader CivitAI search failed for '{url}': {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["error"] = $"CivitAI error {(int)response.StatusCode}: {trimmed}" };
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader CivitAI search failed for '{url}': {ex.ReadableString()}");
            return new JObject() { ["error"] = "Failed to contact CivitAI." };
        }

        JObject data;
        try
        {
            data = resp.ParseToJson();
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader CivitAI search returned invalid JSON: {ex.ReadableString()}");
            return new JObject() { ["error"] = "CivitAI returned invalid data." };
        }

        JArray items = data["items"] as JArray ?? [];
        JObject meta = data["metadata"] as JObject ?? new JObject();
        int currentPage = meta.Value<int?>("currentPage") ?? page;
        int totalPages = meta.Value<int?>("totalPages") ?? 1;
        int totalItems = meta.Value<int?>("totalItems") ?? items.Count;
        string nextCursor = null;
        if (isQueryMode)
        {
            nextCursor = meta.Value<string>("nextCursor");
            if (string.IsNullOrWhiteSpace(nextCursor))
            {
                string nextPage = meta.Value<string>("nextPage") ?? "";
                if (!string.IsNullOrWhiteSpace(nextPage))
                {
                    try
                    {
                        Uri nextUri = new(nextPage);
                        NameValueCollection qs = HttpUtility.ParseQueryString(nextUri.Query);
                        nextCursor = qs.Get("cursor");
                    }
                    catch (Exception)
                    {
                        nextCursor = null;
                    }
                }
            }
        }

        JArray results = [];
        foreach (JObject item in items.OfType<JObject>())
        {
            long modelId = item.Value<long?>("id") ?? 0;
            string modelName = item.Value<string>("name") ?? "";
            string modelType = item.Value<string>("type") ?? "";
            string modelDesc = item.Value<string>("description") ?? "";
            string creator = item["creator"] is JObject creatorObj ? (creatorObj.Value<string>("username") ?? "") : "";
            JObject stats = item["stats"] as JObject ?? new JObject();
            long downloads = stats.Value<long?>("downloadCount") ?? 0;
            JObject bestVersion = (item["modelVersions"] as JArray)?.OfType<JObject>()?.FirstOrDefault();
            long modelVersionId = bestVersion?.Value<long?>("id") ?? 0;
            string versionName = bestVersion?.Value<string>("name") ?? "";
            string versionBaseModel = bestVersion?.Value<string>("baseModel") ?? "";
            JArray versionFiles = bestVersion?["files"] as JArray ?? [];
            JObject bestFile = null;
            foreach (JObject f in versionFiles.OfType<JObject>())
            {
                string fname = f.Value<string>("name") ?? "";
                if (fname.EndsWith(".safetensors", StringComparison.OrdinalIgnoreCase)
                    || fname.EndsWith(".sft", StringComparison.OrdinalIgnoreCase)
                    || fname.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase))
                {
                    bestFile = f;
                    break;
                }
            }
            bestFile ??= versionFiles.OfType<JObject>().FirstOrDefault();
            string downloadUrl = bestFile?.Value<string>("downloadUrl") ?? "";
            string fileName = bestFile?.Value<string>("name") ?? "";
            long? fileSize = bestFile?.Value<long?>("sizeKB") is long sizeKb ? sizeKb * 1024 : null;
            string downloadId = downloadUrl.Contains('/') ? downloadUrl[(downloadUrl.LastIndexOf('/') + 1)..] : "";
            string openUrl = modelId > 0 && modelVersionId > 0 ? $"https://civitai.com/models/{modelId}?modelVersionId={modelVersionId}" : (modelId > 0 ? $"https://civitai.com/models/{modelId}" : "");
            string image = "";
            if (bestVersion?["images"] is JArray imgs)
            {
                image = imgs.OfType<JObject>()?.FirstOrDefault(i => (i.Value<string>("type") ?? "") is "image")?.Value<string>("url") ?? "";
            }
            results.Add(new JObject()
            {
                ["modelId"] = modelId,
                ["modelVersionId"] = modelVersionId,
                ["name"] = modelName,
                ["type"] = modelType,
                ["description"] = modelDesc,
                ["creator"] = creator,
                ["downloads"] = downloads,
                ["versionName"] = versionName,
                ["baseModel"] = versionBaseModel,
                ["image"] = image,
                ["downloadUrl"] = downloadUrl,
                ["downloadId"] = downloadId,
                ["fileName"] = fileName,
                ["fileSize"] = fileSize is null ? null : (JToken)fileSize,
                ["openUrl"] = openUrl
            });
        }

        // Workaround for CivitAI returning nextCursor as an ID that isn't present in the current page.
        if (isQueryMode && results.Count < limit && !string.IsNullOrWhiteSpace(nextCursor) && long.TryParse(nextCursor.Trim(), out long nextCursorAsId) && results.OfType<JObject>().All(r => (r.Value<long?>("modelId") ?? 0) != nextCursorAsId))
        {
            try
            {
                string byIdUrl = $"https://civitai.com/api/v1/models/{nextCursorAsId}";
                if (!string.IsNullOrEmpty(civitaiApiKey))
                {
                    byIdUrl += "?token=" + ModelsAPI.TokenTextLimiter.TrimToMatches(civitaiApiKey);
                }
                using HttpResponseMessage byIdResp = await Utilities.UtilWebClient.GetAsync(byIdUrl);
                string byIdText = await byIdResp.Content.ReadAsStringAsync();
                if (byIdResp.IsSuccessStatusCode)
                {
                    JObject modelObj = byIdText.ParseToJson();
                    string modelName = modelObj.Value<string>("name") ?? "";
                    string modelType = modelObj.Value<string>("type") ?? "";
                    string modelDesc = modelObj.Value<string>("description") ?? "";
                    bool matchesType = string.IsNullOrWhiteSpace(typeClean) || typeClean == "All" || string.Equals(modelType, typeClean, StringComparison.OrdinalIgnoreCase);
                    bool matchesQuery = modelName.Contains(query.Trim(), StringComparison.OrdinalIgnoreCase);
                    if (matchesType && matchesQuery)
                    {
                        JObject bestVersion = (modelObj["modelVersions"] as JArray)?.OfType<JObject>()?.FirstOrDefault();
                        long modelVersionId = bestVersion?.Value<long?>("id") ?? 0;
                        string versionName = bestVersion?.Value<string>("name") ?? "";
                        string versionBaseModel = bestVersion?.Value<string>("baseModel") ?? "";
                        JArray versionFiles = bestVersion?["files"] as JArray ?? [];
                        JObject bestFile = null;
                        foreach (JObject f in versionFiles.OfType<JObject>())
                        {
                            string fname = f.Value<string>("name") ?? "";
                            if (fname.EndsWith(".safetensors", StringComparison.OrdinalIgnoreCase) || fname.EndsWith(".sft", StringComparison.OrdinalIgnoreCase) || fname.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase))
                            {
                                bestFile = f;
                                break;
                            }
                        }
                        bestFile ??= versionFiles.OfType<JObject>().FirstOrDefault();
                        string downloadUrl = bestFile?.Value<string>("downloadUrl") ?? "";
                        string fileName = bestFile?.Value<string>("name") ?? "";
                        long? fileSize = bestFile?.Value<long?>("sizeKB") is long sizeKb ? sizeKb * 1024 : null;
                        string downloadId = downloadUrl.Contains('/') ? downloadUrl[(downloadUrl.LastIndexOf('/') + 1)..] : "";
                        string openUrl = nextCursorAsId > 0 && modelVersionId > 0 ? $"https://civitai.com/models/{nextCursorAsId}?modelVersionId={modelVersionId}" : (nextCursorAsId > 0 ? $"https://civitai.com/models/{nextCursorAsId}" : "");
                        string image = "";
                        if (bestVersion?["images"] is JArray imgs)
                        {
                            image = imgs.OfType<JObject>()?.FirstOrDefault(i => (i.Value<string>("type") ?? "") == "image")?.Value<string>("url") ?? "";
                        }
                        string creator = modelObj["creator"] is JObject creatorObj ? (creatorObj.Value<string>("username") ?? "") : "";
                        JObject stats = modelObj["stats"] as JObject ?? new JObject();
                        long downloads = stats.Value<long?>("downloadCount") ?? 0;
                        results.Add(new JObject()
                        {
                            ["modelId"] = nextCursorAsId,
                            ["modelVersionId"] = modelVersionId,
                            ["name"] = modelName,
                            ["type"] = modelType,
                            ["description"] = modelDesc,
                            ["creator"] = creator,
                            ["downloads"] = downloads,
                            ["versionName"] = versionName,
                            ["baseModel"] = versionBaseModel,
                            ["image"] = image,
                            ["downloadUrl"] = downloadUrl,
                            ["downloadId"] = downloadId,
                            ["fileName"] = fileName,
                            ["fileSize"] = fileSize is null ? null : (JToken)fileSize,
                            ["openUrl"] = openUrl
                        });
                        nextCursor = null;
                    }
                }
            }
            catch (Exception)
            {
                Logs.Warning($"EnhancedDownloader CivitAI search by ID failed for '{nextCursorAsId}'.");
            }
        }

        return new JObject()
        {
            ["success"] = true,
            ["mode"] = isQueryMode ? "cursor" : "page",
            ["page"] = currentPage,
            ["totalPages"] = totalPages,
            ["totalItems"] = totalItems,
            ["nextCursor"] = nextCursor,
            ["items"] = results
        };
    }
}
