using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using System.Collections.Specialized;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Web;

namespace EnhancedDownloader.Providers;

public class HuggingFaceProvider : IEnhancedDownloaderProvider
{
    public static readonly HuggingFaceProvider Instance = new();

    public string ProviderId => "huggingface";
    public string DisplayName => "Hugging Face";
    public bool SupportsFilters => false;
    public bool SupportsNsfw => false;

    private static readonly ProviderCache SearchCache = new(TimeSpan.FromSeconds(60));
    private static readonly ProviderCache ImageCache = new(TimeSpan.FromMinutes(5));
    private static readonly SemaphoreSlim RateLimiter = new(5, 5);

    private static string EncodeModelIdForApi(string modelId)
    {
        modelId = (modelId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(modelId))
        {
            return "";
        }
        string[] parts = modelId.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0)
        {
            return "";
        }
        for (int i = 0; i < parts.Length; i++)
        {
            parts[i] = HttpUtility.UrlEncode(parts[i]).Replace("+", "%20");
        }
        return string.Join("/", parts);
    }

    private static string BuildResolveUrl(string modelId, string filename)
    {
        if (string.IsNullOrWhiteSpace(modelId) || string.IsNullOrWhiteSpace(filename))
        {
            return "";
        }
        return $"https://huggingface.co/{modelId}/resolve/main/{HttpUtility.UrlEncode(filename).Replace("+", "%20")}";
    }

    private static async Task<string> TryFetchImageDataUrl(string url)
    {
        try
        {
            using HttpResponseMessage response = await Utilities.UtilWebClient.GetAsync(url);
            if (!response.IsSuccessStatusCode)
            {
                return "";
            }
            byte[] data = await response.Content.ReadAsByteArrayAsync();
            if (data is null || data.Length == 0 || data.Length > 1024 * 1024)
            {
                return "";
            }
            string ct = response.Content.Headers.ContentType?.MediaType;
            if (string.IsNullOrWhiteSpace(ct))
            {
                ct = url.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || url.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase) ? "image/jpeg"
                    : url.EndsWith(".webp", StringComparison.OrdinalIgnoreCase) ? "image/webp"
                    : url.EndsWith(".gif", StringComparison.OrdinalIgnoreCase) ? "image/gif"
                    : "image/png";
            }
            return $"data:{ct};base64,{Convert.ToBase64String(data)}";
        }
        catch
        {
            return "";
        }
    }

    private static async Task<string> TryFetchFirstPreviewImage(string modelId, IEnumerable<string> relativePaths)
    {
        foreach (string rel in relativePaths)
        {
            if (string.IsNullOrWhiteSpace(rel))
            {
                continue;
            }
            string url = rel.StartsWith("http", StringComparison.OrdinalIgnoreCase)
                ? rel
                : BuildResolveUrl(modelId, rel);
            string dataUrl = await TryFetchImageDataUrl(url);
            if (!string.IsNullOrWhiteSpace(dataUrl))
            {
                return dataUrl;
            }
        }
        return "";
    }

    private static string NormalizeReadmeImageUrl(string modelId, string rawUrl)
    {
        rawUrl = (rawUrl ?? "").Trim();
        if (string.IsNullOrWhiteSpace(rawUrl))
        {
            return "";
        }
        if (rawUrl.StartsWith("http://", StringComparison.OrdinalIgnoreCase) || rawUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
        {
            return rawUrl;
        }
        if (rawUrl.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
        {
            return "";
        }
        if (rawUrl.StartsWith("//"))
        {
            return "https:" + rawUrl;
        }
        string rel = rawUrl;
        int hash = rel.IndexOf('#');
        if (hash >= 0) rel = rel[..hash];
        int q = rel.IndexOf('?');
        if (q >= 0) rel = rel[..q];
        rel = rel.Trim();
        if (string.IsNullOrWhiteSpace(rel))
        {
            return "";
        }
        if (rel.StartsWith("/"))
        {
            return "https://huggingface.co" + rel;
        }
        if (rel.StartsWith("./"))
        {
            rel = rel[2..];
        }
        return BuildResolveUrl(modelId, rel);
    }

    private static async Task<string> TryFetchReadmeFirstImage(string modelId)
    {
        string[] readmeNames = ["README.md", "readme.md", "README.MD", "Readme.md"];
        foreach (string readmeName in readmeNames)
        {
            string readmeUrl = $"https://huggingface.co/{modelId}/raw/main/{readmeName}";
            string md;
            try
            {
                using HttpResponseMessage response = await Utilities.UtilWebClient.GetAsync(readmeUrl);
                if (!response.IsSuccessStatusCode) continue;
                md = await response.Content.ReadAsStringAsync();
            }
            catch { continue; }
            if (string.IsNullOrWhiteSpace(md)) continue;

            List<string> candidates = [];
            foreach (Match m in Regex.Matches(md, @"!\[[^\]]*\]\((?<url>[^\)\s]+)(\s+[^\)]*)?\)", RegexOptions.IgnoreCase))
            {
                if (m.Success) candidates.Add(m.Groups["url"].Value);
            }
            foreach (Match m in Regex.Matches(md, @"<img[^>]*?\s+src\s*=\s*(?:""|')(?<url>[^""']+)(?:""|')[^>]*>", RegexOptions.IgnoreCase))
            {
                if (m.Success) candidates.Add(m.Groups["url"].Value);
            }
            foreach (string raw in candidates)
            {
                string url = NormalizeReadmeImageUrl(modelId, raw);
                if (string.IsNullOrWhiteSpace(url)) continue;
                string lower = url.ToLowerInvariant();
                if (lower.Contains("shields.io") || lower.Contains("badge") || lower.EndsWith(".svg")) continue;
                string dataUrl = await TryFetchImageDataUrl(url);
                if (!string.IsNullOrWhiteSpace(dataUrl))
                {
                    return dataUrl;
                }
            }
        }
        return "";
    }

    /// <summary>Fetch a preview image for a HuggingFace model. Called lazily from JS per-card, not inline during search.</summary>
    public async Task<JObject> GetPreviewImageAsync(Session session, string modelId)
    {
        modelId = (modelId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(modelId))
        {
            return new JObject() { ["success"] = false, ["error"] = "Missing modelId." };
        }
        string cacheKey = $"hf-img:{modelId}";
        if (ImageCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }

        await RateLimiter.WaitAsync();
        try
        {
            // 1. Try common preview filenames at repo root.
            string image = await TryFetchFirstPreviewImage(modelId, ImageFileHelper.CommonPreviewFiles);
            if (!string.IsNullOrWhiteSpace(image))
            {
                return CacheAndReturn(cacheKey, image);
            }

            // 2. Query model siblings for preview files.
            string url = $"https://huggingface.co/api/models/{EncodeModelIdForApi(modelId)}?full=true";
            using HttpResponseMessage response = await Utilities.UtilWebClient.GetAsync(url);
            if (response.IsSuccessStatusCode)
            {
                string resp = await response.Content.ReadAsStringAsync();
                JObject data = resp.ParseToJson();
                if (data["siblings"] is JArray siblings)
                {
                    string previewFile = siblings.OfType<JObject>()
                        .Select(s => s.Value<string>("rfilename") ?? "")
                        .Where(f => !string.IsNullOrWhiteSpace(f))
                        .FirstOrDefault(ImageFileHelper.IsPreviewFilename);
                    if (!string.IsNullOrWhiteSpace(previewFile))
                    {
                        image = await TryFetchFirstPreviewImage(modelId, [previewFile]);
                        if (!string.IsNullOrWhiteSpace(image))
                        {
                            return CacheAndReturn(cacheKey, image);
                        }
                    }
                }
            }

            // 3. Fall back to parsing README for embedded images.
            image = await TryFetchReadmeFirstImage(modelId);
            return CacheAndReturn(cacheKey, image);
        }
        catch
        {
            return CacheAndReturn(cacheKey, "");
        }
        finally
        {
            RateLimiter.Release();
        }
    }

    private static JObject CacheAndReturn(string cacheKey, string image)
    {
        JObject result = new() { ["success"] = true, ["image"] = image ?? "" };
        ImageCache.Set(cacheKey, result);
        return result;
    }

    public async Task<JObject> SearchAsync(Session session,
        string query = "", int page = 1, int limit = 24, string cursor = "",
        string type = "", string baseModel = "", string sort = "", bool includeNsfw = false)
    {
        limit = Math.Clamp(limit, 1, 100);
        string cacheKey = $"hf:{query}:{limit}:{cursor}";
        if (SearchCache.TryGet(cacheKey, out JObject cached))
        {
            return cached;
        }

        UrlBuilder builder = new("https://huggingface.co/api/models");
        builder.Add("limit", limit);
        builder.Add("full", "true");
        if (!string.IsNullOrWhiteSpace(query))
        {
            builder.Add("search", query);
        }
        if (!string.IsNullOrWhiteSpace(cursor))
        {
            builder.Add("cursor", cursor);
        }
        string url = builder.ToString();

        string resp;
        string nextCursor = null;
        await RateLimiter.WaitAsync();
        try
        {
            using HttpResponseMessage response = await Utilities.UtilWebClient.GetAsync(url);
            resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader HuggingFace search failed: {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["success"] = false, ["error"] = $"HuggingFace error {(int)response.StatusCode}: {trimmed}" };
            }
            nextCursor = ExtractNextCursorFromLink(response);
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader HuggingFace search failed: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = "Failed to contact Hugging Face." };
        }
        finally
        {
            RateLimiter.Release();
        }

        JArray data;
        try
        {
            data = JArray.Parse(resp);
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader HuggingFace search returned invalid JSON: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = "Hugging Face returned invalid data." };
        }

        JArray results = [];
        foreach (JObject item in data.OfType<JObject>())
        {
            string modelId = item.Value<string>("modelId") ?? item.Value<string>("id") ?? "";
            if (string.IsNullOrWhiteSpace(modelId)) continue;

            JObject cardData = item["cardData"] as JObject;
            string description = item.Value<string>("description") ?? cardData?.Value<string>("description") ?? "";
            string author = item.Value<string>("author") ?? "";
            long downloads = item.Value<long?>("downloads") ?? 0;
            string lastModified = item.Value<string>("lastModified") ?? "";
            string openUrl = $"https://huggingface.co/{modelId}";

            // Build download options from siblings — no inline image fetching (JS lazy-loads images).
            JArray downloadOptions = [];
            if (item["siblings"] is JArray siblings)
            {
                foreach (JObject sib in siblings.OfType<JObject>())
                {
                    string rfilename = sib.Value<string>("rfilename") ?? "";
                    if (string.IsNullOrWhiteSpace(rfilename)) continue;
                    string ext = Path.GetExtension(rfilename);
                    if (!ImageFileHelper.IsModelFileExtension(ext)) continue;
                    string fileUrl = BuildResolveUrl(modelId, rfilename);
                    downloadOptions.Add(new JObject()
                    {
                        ["fileName"] = rfilename,
                        ["downloadUrl"] = fileUrl,
                        ["fileSize"] = sib.Value<long?>("size") is long size ? size : null
                    });
                    if (downloadOptions.Count >= 25) break;
                }
            }

            string downloadUrl = downloadOptions.Count > 0 ? (downloadOptions[0] as JObject)?.Value<string>("downloadUrl") ?? "" : "";
            string fileName = downloadOptions.Count > 0 ? (downloadOptions[0] as JObject)?.Value<string>("fileName") ?? "" : "";
            long? fileSize = downloadOptions.Count > 0 ? (downloadOptions[0] as JObject)?.Value<long?>("fileSize") : null;

            JObject resultItem = new()
            {
                ["modelId"] = modelId,
                ["modelVersionId"] = "",
                ["name"] = modelId,
                ["type"] = "HuggingFace",
                ["description"] = description,
                ["creator"] = author,
                ["downloads"] = downloads,
                ["versionName"] = lastModified,
                ["baseModel"] = "",
                ["image"] = "",
                ["downloadUrl"] = downloadUrl,
                ["downloadId"] = "",
                ["fileName"] = fileName,
                ["fileSize"] = fileSize is null ? null : (JToken)fileSize,
                ["openUrl"] = openUrl
            };
            if (downloadOptions.Count > 0)
            {
                resultItem["downloadOptions"] = downloadOptions;
            }
            results.Add(resultItem);
        }

        JObject result = new()
        {
            ["success"] = true,
            ["mode"] = "cursor",
            ["nextCursor"] = nextCursor,
            ["totalItems"] = results.Count,
            ["items"] = results
        };
        SearchCache.Set(cacheKey, result);
        return result;
    }

    public async Task<JObject> ListFilesAsync(Session session, string modelId, int limit = 500)
    {
        modelId = (modelId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(modelId))
        {
            return new JObject() { ["success"] = false, ["error"] = "Missing modelId." };
        }
        limit = Math.Clamp(limit, 1, 5000);

        string url = $"https://huggingface.co/api/models/{EncodeModelIdForApi(modelId)}?full=true";
        await RateLimiter.WaitAsync();
        try
        {
            using HttpResponseMessage response = await Utilities.UtilWebClient.GetAsync(url);
            string resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader HuggingFace files failed: {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["success"] = false, ["error"] = $"HuggingFace error {(int)response.StatusCode}: {trimmed}" };
            }
            JObject data = resp.ParseToJson();
            JArray files = [];
            if (data["siblings"] is JArray siblings)
            {
                foreach (JObject sib in siblings.OfType<JObject>())
                {
                    if (files.Count >= limit) break;
                    string rfilename = sib.Value<string>("rfilename") ?? "";
                    if (string.IsNullOrWhiteSpace(rfilename)) continue;
                    string dl = BuildResolveUrl(modelId, rfilename);
                    if (string.IsNullOrWhiteSpace(dl)) continue;
                    long? size = sib.Value<long?>("size") is long sz ? sz : null;
                    files.Add(new JObject()
                    {
                        ["fileName"] = rfilename,
                        ["downloadUrl"] = dl,
                        ["fileSize"] = size is null ? null : (JToken)size
                    });
                }
                return new JObject()
                {
                    ["success"] = true,
                    ["modelId"] = modelId,
                    ["files"] = files,
                    ["truncated"] = siblings.Count > files.Count
                };
            }
            return new JObject()
            {
                ["success"] = true,
                ["modelId"] = modelId,
                ["files"] = files,
                ["truncated"] = false
            };
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader HuggingFace files failed: {ex.ReadableString()}");
            return new JObject() { ["success"] = false, ["error"] = "Failed to contact Hugging Face." };
        }
        finally
        {
            RateLimiter.Release();
        }
    }

    private static string ExtractNextCursorFromLink(HttpResponseMessage response)
    {
        if (!response.Headers.TryGetValues("Link", out IEnumerable<string> links))
        {
            return null;
        }
        foreach (string link in links)
        {
            foreach (string part in link.Split(','))
            {
                if (!part.Contains("rel=\"next\"", StringComparison.OrdinalIgnoreCase)) continue;
                int start = part.IndexOf('<');
                int end = part.IndexOf('>');
                if (start >= 0 && end > start)
                {
                    string nextUrl = part[(start + 1)..end];
                    try
                    {
                        Uri nextUri = new(nextUrl);
                        NameValueCollection qs = HttpUtility.ParseQueryString(nextUri.Query);
                        return qs.Get("cursor");
                    }
                    catch
                    {
                        return null;
                    }
                }
            }
        }
        return null;
    }
}
