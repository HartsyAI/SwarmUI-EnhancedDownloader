using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.IO;
using System.Net.Http;
using System.Text.RegularExpressions;
using System.Web;
using System;
using System.Threading.Tasks;

namespace EnhancedDownloader.Providers;

public class HuggingFaceProvider : IEnhancedDownloaderProvider
{
    public static readonly HuggingFaceProvider Instance = new();

    public string ProviderId => "huggingface";

    private static string EncodeModelIdForApi(string modelId)
    {
        modelId = (modelId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(modelId))
        {
            return "";
        }
        // Hugging Face API expects the repo id in the path as `owner/repo`.
        // Encoding the slash (%2F) causes 400 "Invalid repo name".
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
            if (data is null || data.Length == 0)
            {
                return "";
            }
            // Safety cap: don't embed large binaries into JSON.
            if (data.Length > 1024 * 1024)
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
                : $"https://huggingface.co/{modelId}/resolve/main/{HttpUtility.UrlEncode(rel).Replace("+", "%20")}";
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
        if (hash >= 0)
        {
            rel = rel[..hash];
        }
        int q = rel.IndexOf('?');
        if (q >= 0)
        {
            rel = rel[..q];
        }
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
                if (!response.IsSuccessStatusCode)
                {
                    continue;
                }
                md = await response.Content.ReadAsStringAsync();
            }
            catch
            {
                continue;
            }

            if (string.IsNullOrWhiteSpace(md))
            {
                continue;
            }

            List<string> candidates = [];
            foreach (Match m in Regex.Matches(md, @"!\[[^\]]*\]\((?<url>[^\)\s]+)(\s+[^\)]*)?\)", RegexOptions.IgnoreCase).Cast<Match>())
            {
                if (m.Success)
                {
                    candidates.Add(m.Groups["url"].Value);
                }
            }
            foreach (Match m in Regex.Matches(md, @"<img[^>]*?\s+src\s*=\s*(?:""|')(?<url>[^""']+)(?:""|')[^>]*>", RegexOptions.IgnoreCase).Cast<Match>())
            {
                if (m.Success)
                {
                    candidates.Add(m.Groups["url"].Value);
                }
            }

            foreach (string raw in candidates)
            {
                string url = NormalizeReadmeImageUrl(modelId, raw);
                if (string.IsNullOrWhiteSpace(url))
                {
                    continue;
                }
                string lower = url.ToLowerInvariant();
                if (lower.Contains("shields.io") || lower.Contains("badge") || lower.EndsWith(".svg"))
                {
                    continue;
                }
                string dataUrl = await TryFetchImageDataUrl(url);
                if (!string.IsNullOrWhiteSpace(dataUrl))
                {
                    return dataUrl;
                }
            }
        }

        return "";
    }

    public async Task<JObject> GetPreviewImageAsync(Session session, string modelId)
    {
        modelId = (modelId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(modelId))
        {
            return new JObject() { ["error"] = "Missing modelId." };
        }

        string image = await TryFetchFirstPreviewImage(modelId, new[]
        {
            "thumbnail.png",
            "thumbnail.jpg",
            "thumbnail.jpeg",
            "teaser.png",
            "teaser.jpg",
            "teaser.jpeg",
            "cover.png",
            "cover.jpg",
            "cover.jpeg",
            "banner.png",
            "banner.jpg",
            "banner.jpeg"
        });
        if (!string.IsNullOrWhiteSpace(image))
        {
            return new JObject() { ["success"] = true, ["image"] = image };
        }

        // If not present as a common root file, query model details to discover repo-local image files.
        try
        {
            string url = $"https://huggingface.co/api/models/{EncodeModelIdForApi(modelId)}?full=true";
            using HttpResponseMessage response = await Utilities.UtilWebClient.GetAsync(url);
            string resp = await response.Content.ReadAsStringAsync();
            if (response.IsSuccessStatusCode)
            {
                JObject data = resp.ParseToJson();
                if (data["siblings"] is JArray siblings)
                {
                    string previewFile = null;
                    foreach (JObject sib in siblings.OfType<JObject>())
                    {
                        string rfilename = sib.Value<string>("rfilename") ?? "";
                        if (string.IsNullOrWhiteSpace(rfilename))
                        {
                            continue;
                        }
                        string extPreview = Path.GetExtension(rfilename);
                        bool isImage = extPreview.Equals(".png", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".jpg", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".jpeg", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".webp", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".gif", StringComparison.OrdinalIgnoreCase);
                        if (!isImage)
                        {
                            continue;
                        }
                        string lower = rfilename.ToLowerInvariant();
                        if (lower.EndsWith("teaser.png")
                            || lower.EndsWith("teaser.jpg")
                            || lower.EndsWith("teaser.jpeg")
                            || lower.EndsWith("thumbnail.png")
                            || lower.EndsWith("thumbnail.jpg")
                            || lower.EndsWith("thumbnail.jpeg")
                            || lower.EndsWith("cover.png")
                            || lower.EndsWith("cover.jpg")
                            || lower.EndsWith("cover.jpeg")
                            || lower.EndsWith("banner.png")
                            || lower.EndsWith("banner.jpg")
                            || lower.EndsWith("banner.jpeg")
                            || lower.EndsWith("preview.png")
                            || lower.EndsWith("preview.jpg")
                            || lower.EndsWith("preview.jpeg")
                            || lower.EndsWith("example.png")
                            || lower.EndsWith("example.jpg")
                            || lower.EndsWith("example.jpeg")
                            || lower.EndsWith("sample.png")
                            || lower.EndsWith("sample.jpg")
                            || lower.EndsWith("sample.jpeg"))
                        {
                            previewFile = rfilename;
                            break;
                        }
                    }

                    if (!string.IsNullOrWhiteSpace(previewFile))
                    {
                        image = await TryFetchFirstPreviewImage(modelId, new[] { previewFile });
                        if (!string.IsNullOrWhiteSpace(image))
                        {
                            return new JObject() { ["success"] = true, ["image"] = image };
                        }
                    }
                }
            }
        }
        catch
        {
            // ignore
        }

        image = await TryFetchReadmeFirstImage(modelId);
        return new JObject() { ["success"] = true, ["image"] = image };
    }

    public async Task<JObject> SearchAsync(Session session,
        string query = "",
        int limit = 24,
        string cursor = "")
    {
        limit = Math.Clamp(limit, 1, 100);
        string url = $"https://huggingface.co/api/models?limit={limit}&full=true";
        if (!string.IsNullOrWhiteSpace(query))
        {
            url += $"&search={HttpUtility.UrlEncode(query)}";
        }
        if (!string.IsNullOrWhiteSpace(cursor))
        {
            url += $"&cursor={HttpUtility.UrlEncode(cursor)}";
        }

        string resp;
        string nextCursor = null;
        try
        {
            using HttpResponseMessage response = await Utilities.UtilWebClient.GetAsync(url);
            resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader HuggingFace search failed for '{url}': {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["error"] = $"HuggingFace error {(int)response.StatusCode}: {trimmed}" };
            }

            if (response.Headers.TryGetValues("Link", out IEnumerable<string> links))
            {
                foreach (string link in links)
                {
                    // Format example: <https://huggingface.co/api/models?cursor=...&limit=...>; rel="next"
                    foreach (string part in link.Split(','))
                    {
                        if (!part.Contains("rel=\"next\"", StringComparison.OrdinalIgnoreCase))
                        {
                            continue;
                        }
                        int start = part.IndexOf('<');
                        int end = part.IndexOf('>');
                        if (start >= 0 && end > start)
                        {
                            string nextUrl = part[(start + 1)..end];
                            try
                            {
                                Uri nextUri = new(nextUrl);
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
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader HuggingFace search failed for '{url}': {ex.ReadableString()}");
            return new JObject() { ["error"] = "Failed to contact Hugging Face." };
        }

        JArray data;
        try
        {
            data = JArray.Parse(resp);
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader HuggingFace search returned invalid JSON: {ex.ReadableString()}");
            return new JObject() { ["error"] = "Hugging Face returned invalid data." };
        }

        JArray results = [];
        foreach (JObject item in data.OfType<JObject>())
        {
            string modelId = item.Value<string>("modelId") ?? item.Value<string>("id") ?? "";
            if (string.IsNullOrWhiteSpace(modelId))
            {
                continue;
            }

            JObject cardData = item["cardData"] as JObject;
            string description = item.Value<string>("description") ?? cardData?.Value<string>("description") ?? "";
            string author = item.Value<string>("author") ?? "";
            long downloads = item.Value<long?>("downloads") ?? 0;
            string lastModified = item.Value<string>("lastModified") ?? "";

            string openUrl = $"https://huggingface.co/{modelId}";
            // Swarm UI may block external image loads via CSP; embed a small preview image as a data: URL.
            string image = "";

            HashSet<string> preferredExts = new(StringComparer.OrdinalIgnoreCase)
            {
                ".safetensors",
                ".gguf",
                ".sft",
                ".ckpt",
                ".pt",
                ".bin",
                ".zip"
            };

            JArray downloadOptions = [];

            if (item["siblings"] is JArray siblings)
            {
                string previewFile = null;
                foreach (JObject sib in siblings.OfType<JObject>())
                {
                    string rfilename = sib.Value<string>("rfilename") ?? "";
                    if (string.IsNullOrWhiteSpace(rfilename))
                    {
                        continue;
                    }
                    if (previewFile is null)
                    {
                        string extPreview = Path.GetExtension(rfilename);
                        bool isImage = extPreview.Equals(".png", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".jpg", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".jpeg", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".webp", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".gif", StringComparison.OrdinalIgnoreCase);
                        if (isImage)
                        {
                            string lower = rfilename.ToLowerInvariant();
                            if (lower.EndsWith("teaser.png")
                                || lower.EndsWith("teaser.jpg")
                                || lower.EndsWith("teaser.jpeg")
                                || lower.EndsWith("thumbnail.png")
                                || lower.EndsWith("thumbnail.jpg")
                                || lower.EndsWith("thumbnail.jpeg")
                                || lower.EndsWith("cover.png")
                                || lower.EndsWith("cover.jpg")
                                || lower.EndsWith("cover.jpeg")
                                || lower.EndsWith("banner.png")
                                || lower.EndsWith("banner.jpg")
                                || lower.EndsWith("banner.jpeg"))
                            {
                                previewFile = rfilename;
                            }
                        }
                    }
                    string ext = Path.GetExtension(rfilename);
                    if (string.IsNullOrWhiteSpace(ext) || !preferredExts.Contains(ext))
                    {
                        continue;
                    }
                    string fileUrl = $"https://huggingface.co/{modelId}/resolve/main/{HttpUtility.UrlEncode(rfilename).Replace("+", "%20")}";
                    downloadOptions.Add(new JObject()
                    {
                        ["fileName"] = rfilename,
                        ["downloadUrl"] = fileUrl,
                        ["fileSize"] = sib.Value<long?>("size") is long size ? size : null
                    });

                    if (downloadOptions.Count >= 25)
                    {
                        break;
                    }
                }

                if (string.IsNullOrWhiteSpace(image) && !string.IsNullOrWhiteSpace(previewFile))
                {
                    image = await TryFetchFirstPreviewImage(modelId, new[] { previewFile });
                }

                if (string.IsNullOrWhiteSpace(image) && previewFile is null)
                {
                    foreach (JObject sib in siblings.OfType<JObject>())
                    {
                        string rfilename = sib.Value<string>("rfilename") ?? "";
                        if (string.IsNullOrWhiteSpace(rfilename))
                        {
                            continue;
                        }
                        string extPreview = Path.GetExtension(rfilename);
                        if (extPreview.Equals(".png", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".jpg", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".jpeg", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".webp", StringComparison.OrdinalIgnoreCase)
                            || extPreview.Equals(".gif", StringComparison.OrdinalIgnoreCase))
                        {
                            image = await TryFetchFirstPreviewImage(modelId, new[] { rfilename });
                            if (!string.IsNullOrWhiteSpace(image))
                            {
                                break;
                            }
                        }
                    }
                }
            }

            string downloadUrl = downloadOptions.Count > 0 ? (downloadOptions[0] as JObject)?.Value<string>("downloadUrl") ?? "" : "";
            string fileName = downloadOptions.Count > 0 ? (downloadOptions[0] as JObject)?.Value<string>("fileName") ?? "" : "";
            long? fileSize = downloadOptions.Count > 0 ? (downloadOptions[0] as JObject)?.Value<long?>("fileSize") : null;

            results.Add(new JObject()
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
                ["image"] = image,
                ["downloadUrl"] = downloadUrl,
                ["downloadId"] = "",
                ["fileName"] = fileName,
                ["fileSize"] = fileSize is null ? null : (JToken)fileSize,
                ["openUrl"] = openUrl
            });

            if (downloadOptions.Count > 0)
            {
                results[^1]["downloadOptions"] = downloadOptions;
            }
        }

        return new JObject()
        {
            ["success"] = true,
            ["mode"] = "cursor",
            ["nextCursor"] = nextCursor,
            ["totalItems"] = results.Count,
            ["items"] = results
        };
    }

    public async Task<JObject> ListFilesAsync(Session session, string modelId, int limit = 500)
    {
        modelId = (modelId ?? "").Trim();
        if (string.IsNullOrWhiteSpace(modelId))
        {
            return new JObject() { ["error"] = "Missing modelId." };
        }
        limit = Math.Clamp(limit, 1, 5000);

        string url = $"https://huggingface.co/api/models/{EncodeModelIdForApi(modelId)}?full=true";
        string resp;
        try
        {
            using HttpResponseMessage response = await Utilities.UtilWebClient.GetAsync(url);
            resp = await response.Content.ReadAsStringAsync();
            if (!response.IsSuccessStatusCode)
            {
                string trimmed = resp.Length > 500 ? resp[..500] : resp;
                Logs.Warning($"EnhancedDownloader HuggingFace files failed for '{url}': {(int)response.StatusCode} {response.ReasonPhrase} - {trimmed}");
                return new JObject() { ["error"] = $"HuggingFace error {(int)response.StatusCode}: {trimmed}" };
            }
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader HuggingFace files failed for '{url}': {ex.ReadableString()}");
            return new JObject() { ["error"] = "Failed to contact Hugging Face." };
        }

        JObject data;
        try
        {
            data = resp.ParseToJson();
        }
        catch (Exception ex)
        {
            Logs.Warning($"EnhancedDownloader HuggingFace files returned invalid JSON: {ex.ReadableString()}");
            return new JObject() { ["error"] = "Hugging Face returned invalid data." };
        }

        JArray files = [];
        if (data["siblings"] is JArray siblings)
        {
            foreach (JObject sib in siblings.OfType<JObject>())
            {
                if (files.Count >= limit)
                {
                    break;
                }
                string rfilename = sib.Value<string>("rfilename") ?? "";
                if (string.IsNullOrWhiteSpace(rfilename))
                {
                    continue;
                }
                string dl = BuildResolveUrl(modelId, rfilename);
                if (string.IsNullOrWhiteSpace(dl))
                {
                    continue;
                }
                long? size = sib.Value<long?>("size") is long sz ? sz : null;
                files.Add(new JObject()
                {
                    ["fileName"] = rfilename,
                    ["downloadUrl"] = dl,
                    ["fileSize"] = size is null ? null : (JToken)size
                });
            }
        }

        return new JObject()
        {
            ["success"] = true,
            ["modelId"] = modelId,
            ["files"] = files,
            ["truncated"] = (data["siblings"] is JArray s && s.Count > files.Count)
        };
    }
}
