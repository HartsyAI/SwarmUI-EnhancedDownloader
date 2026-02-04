using Newtonsoft.Json.Linq;
using System.Collections.Concurrent;
using System.IO;
using System.Web;

namespace EnhancedDownloader.Providers;

/// <summary>Simple TTL-based cache backed by a <see cref="ConcurrentDictionary{TKey,TValue}"/>.</summary>
public class ProviderCache
{
    private readonly ConcurrentDictionary<string, (JObject Result, long Timestamp)> _cache = new();
    private readonly long _ttlMs;

    public ProviderCache(TimeSpan ttl)
    {
        _ttlMs = (long)ttl.TotalMilliseconds;
    }

    public bool TryGet(string key, out JObject result)
    {
        if (_cache.TryGetValue(key, out var entry) && Environment.TickCount64 - entry.Timestamp < _ttlMs)
        {
            result = entry.Result;
            return true;
        }
        result = null;
        return false;
    }

    public void Set(string key, JObject result)
    {
        _cache[key] = (result, Environment.TickCount64);
        // Lazy eviction: prune expired entries when cache grows large.
        if (_cache.Count > 200)
        {
            Prune();
        }
    }

    private void Prune()
    {
        long now = Environment.TickCount64;
        foreach (var kvp in _cache)
        {
            if (now - kvp.Value.Timestamp >= _ttlMs)
            {
                _cache.TryRemove(kvp.Key, out _);
            }
        }
    }
}

/// <summary>Builds normalized model result JObjects from provider-specific data.</summary>
public static class ModelResultBuilder
{
    /// <summary>Select the best downloadable file from a CivitAI version's file array.</summary>
    public static JObject SelectBestFile(JArray files)
    {
        if (files is null || files.Count == 0)
        {
            return null;
        }
        foreach (JObject f in files.OfType<JObject>())
        {
            string fname = f.Value<string>("name") ?? "";
            if (fname.EndsWith(".safetensors", StringComparison.OrdinalIgnoreCase)
                || fname.EndsWith(".sft", StringComparison.OrdinalIgnoreCase)
                || fname.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase))
            {
                return f;
            }
        }
        return files.OfType<JObject>().FirstOrDefault();
    }

    /// <summary>Build a normalized model result from a CivitAI model object and its best version.</summary>
    public static JObject FromCivitAI(JObject model, JObject bestVersion, long modelIdOverride = 0)
    {
        long modelId = modelIdOverride > 0 ? modelIdOverride : model.Value<long?>("id") ?? 0;
        string modelName = model.Value<string>("name") ?? "";
        string modelType = model.Value<string>("type") ?? "";
        string modelDesc = model.Value<string>("description") ?? "";
        string creator = model["creator"] is JObject creatorObj ? (creatorObj.Value<string>("username") ?? "") : "";
        JObject stats = model["stats"] as JObject ?? new JObject();
        long downloads = stats.Value<long?>("downloadCount") ?? 0;

        long modelVersionId = bestVersion?.Value<long?>("id") ?? 0;
        string versionName = bestVersion?.Value<string>("name") ?? "";
        string versionBaseModel = bestVersion?.Value<string>("baseModel") ?? "";
        JArray versionFiles = bestVersion?["files"] as JArray ?? [];
        JObject bestFile = SelectBestFile(versionFiles);

        string downloadUrl = bestFile?.Value<string>("downloadUrl") ?? "";
        string fileName = bestFile?.Value<string>("name") ?? "";
        long? fileSize = bestFile?.Value<long?>("sizeKB") is long sizeKb ? sizeKb * 1024 : null;
        string downloadId = downloadUrl.Contains('/') ? downloadUrl[(downloadUrl.LastIndexOf('/') + 1)..] : "";

        string openUrl = modelId > 0 && modelVersionId > 0
            ? $"https://civitai.com/models/{modelId}?modelVersionId={modelVersionId}"
            : (modelId > 0 ? $"https://civitai.com/models/{modelId}" : "");

        string image = "";
        if (bestVersion?["images"] is JArray imgs)
        {
            image = imgs.OfType<JObject>()
                .FirstOrDefault(i => (i.Value<string>("type") ?? "") == "image")
                ?.Value<string>("url") ?? "";
        }

        return new JObject()
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
        };
    }
}

/// <summary>Helpers for identifying image files and preview filenames.</summary>
public static class ImageFileHelper
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".webp", ".gif"
    };

    private static readonly HashSet<string> PreviewBasenames = new(StringComparer.OrdinalIgnoreCase)
    {
        "thumbnail", "teaser", "cover", "banner", "preview", "example", "sample"
    };

    private static readonly HashSet<string> ModelFileExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".safetensors", ".gguf", ".sft", ".ckpt", ".pt", ".bin", ".zip"
    };

    public static bool IsImageExtension(string ext)
    {
        return ImageExtensions.Contains(ext);
    }

    public static bool IsModelFileExtension(string ext)
    {
        return ModelFileExtensions.Contains(ext);
    }

    /// <summary>Returns true if the filename (e.g. "thumbnail.png") matches a known preview naming pattern.</summary>
    public static bool IsPreviewFilename(string filename)
    {
        if (string.IsNullOrWhiteSpace(filename))
        {
            return false;
        }
        string name = Path.GetFileNameWithoutExtension(filename).ToLowerInvariant();
        string ext = Path.GetExtension(filename);
        if (!IsImageExtension(ext))
        {
            return false;
        }
        return PreviewBasenames.Contains(name) || PreviewBasenames.Any(b => name.EndsWith(b, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>Returns common preview filenames to try fetching for a HuggingFace repo.</summary>
    public static IReadOnlyList<string> CommonPreviewFiles { get; } =
    [
        "thumbnail.png", "thumbnail.jpg", "thumbnail.jpeg",
        "teaser.png", "teaser.jpg", "teaser.jpeg",
        "cover.png", "cover.jpg", "cover.jpeg",
        "banner.png", "banner.jpg", "banner.jpeg"
    ];
}

/// <summary>Simple query-string URL builder.</summary>
public class UrlBuilder
{
    private readonly string _base;
    private readonly List<(string Key, string Value)> _params = [];

    public UrlBuilder(string baseUrl)
    {
        _base = baseUrl;
    }

    public UrlBuilder Add(string key, string value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            _params.Add((key, value));
        }
        return this;
    }

    public UrlBuilder Add(string key, int value)
    {
        _params.Add((key, value.ToString()));
        return this;
    }

    public UrlBuilder AddIf(bool condition, string key, string value)
    {
        if (condition && !string.IsNullOrWhiteSpace(value))
        {
            _params.Add((key, value));
        }
        return this;
    }

    public UrlBuilder AddIf(bool condition, string key, bool value)
    {
        if (condition)
        {
            _params.Add((key, value.ToString().ToLowerInvariant()));
        }
        return this;
    }

    public override string ToString()
    {
        if (_params.Count == 0)
        {
            return _base;
        }
        return _base + "?" + string.Join("&", _params.Select(p => $"{HttpUtility.UrlEncode(p.Key)}={HttpUtility.UrlEncode(p.Value)}"));
    }
}
