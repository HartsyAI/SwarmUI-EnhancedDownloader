using Newtonsoft.Json.Linq;
using SwarmUI.Backends;
using System.Collections.Concurrent;
using System.IO;
using System.Net.Http;
using System.Web;

namespace Hartsy.Extensions.Providers;

/// <summary>Shared HTTP client for all Enhanced Downloader providers. Uses SwarmUI's configured client factory instead of the global singleton.</summary>
public static class ProviderHttpClient
{
    public static readonly HttpClient Client = NetworkBackendUtils.MakeHttpClient();
}

/// <summary>Simple TTL-based cache backed by a <see cref="ConcurrentDictionary{TKey,TValue}"/>.</summary>
/// <remarks>Initializes a new cache with the given time-to-live duration.</remarks>
public class ProviderCache(TimeSpan ttl)
{
    public readonly ConcurrentDictionary<string, (JObject Result, long Timestamp)> Cache = new();
    public readonly long TtlMs = (long)ttl.TotalMilliseconds;

    /// <summary>Attempts to retrieve a cached result by key, returning false if missing or expired.</summary>
    public bool TryGet(string key, out JObject result)
    {
        if (Cache.TryGetValue(key, out (JObject Result, long Timestamp) entry) && Environment.TickCount64 - entry.Timestamp < TtlMs)
        {
            result = entry.Result;
            return true;
        }
        result = null;
        return false;
    }

    /// <summary>Stores a result in the cache and prunes expired entries if the cache exceeds 200 items.</summary>
    public void Set(string key, JObject result)
    {
        Cache[key] = (result, Environment.TickCount64);
        if (Cache.Count > 200)
        {
            Prune();
        }
    }

    /// <summary>Removes all expired entries from the cache.</summary>
    public void Prune()
    {
        long now = Environment.TickCount64;
        foreach (KeyValuePair<string, (JObject Result, long Timestamp)> kvp in Cache)
        {
            if (now - kvp.Value.Timestamp >= TtlMs)
            {
                Cache.TryRemove(kvp.Key, out _);
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
            if (fname.EndsWith(".safetensors", StringComparison.OrdinalIgnoreCase) || fname.EndsWith(".sft", StringComparison.OrdinalIgnoreCase) || fname.EndsWith(".gguf", StringComparison.OrdinalIgnoreCase))
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
        long thumbsUp = stats.Value<long?>("thumbsUpCount") ?? 0;
        int nsfwLevel = model.Value<int?>("nsfwLevel") ?? 0;
        string mode = model.Value<string>("mode") ?? "";
        string availability = model.Value<string>("availability") ?? "";
        bool supportsGeneration = model.Value<bool?>("supportsGeneration") ?? false;
        JArray modelTags = model["tags"] as JArray ?? [];
        long modelVersionId = bestVersion?.Value<long?>("id") ?? 0;
        string versionName = bestVersion?.Value<string>("name") ?? "";
        string versionBaseModel = bestVersion?.Value<string>("baseModel") ?? "";
        string earlyAccessEndsAt = bestVersion?.Value<string>("earlyAccessEndsAt") ?? "";
        string air = bestVersion?.Value<string>("air") ?? "";
        JArray trainedWords = bestVersion?["trainedWords"] as JArray ?? [];
        JArray versionFiles = bestVersion?["files"] as JArray ?? [];
        JObject bestFile = SelectBestFile(versionFiles);
        string downloadUrl = bestFile?.Value<string>("downloadUrl") ?? "";
        string fileName = bestFile?.Value<string>("name") ?? "";
        long? fileSize = bestFile?.Value<long?>("sizeKB") is long sizeKb ? sizeKb * 1024 : null;
        string downloadId = downloadUrl.Contains('/') ? downloadUrl[(downloadUrl.LastIndexOf('/') + 1)..] : "";
        string openUrl = modelId > 0 && modelVersionId > 0 ? $"https://civitai.com/models/{modelId}?modelVersionId={modelVersionId}" : (modelId > 0 ? $"https://civitai.com/models/{modelId}" : "");
        string image = "";
        if (bestVersion?["images"] is JArray imgs)
        {
            image = imgs.OfType<JObject>().FirstOrDefault(i => (i.Value<string>("type") ?? "") == "image") ?.Value<string>("url") ?? "";
        }
        JArray downloadOptions = [];
        if (model["modelVersions"] is JArray allVersions)
        {
            foreach (JObject ver in allVersions.OfType<JObject>())
            {
                JObject vFile = SelectBestFile(ver["files"] as JArray ?? []);
                if (vFile is null)
                {
                    continue;
                }
                string vUrl = vFile.Value<string>("downloadUrl") ?? "";
                if (string.IsNullOrWhiteSpace(vUrl))
                {
                    continue;
                }
                downloadOptions.Add(new JObject()
                {
                    ["modelVersionId"] = ver.Value<long?>("id") ?? 0,
                    ["versionName"] = ver.Value<string>("name") ?? "",
                    ["baseModel"] = ver.Value<string>("baseModel") ?? "",
                    ["fileName"] = vFile.Value<string>("name") ?? "",
                    ["downloadUrl"] = vUrl,
                    ["fileSize"] = vFile.Value<long?>("sizeKB") is long vKb ? (JToken)(vKb * 1024) : null,
                    ["earlyAccessEndsAt"] = ver.Value<string>("earlyAccessEndsAt") ?? "",
                    ["air"] = ver.Value<string>("air") ?? ""
                });
            }
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
            ["thumbsUpCount"] = thumbsUp,
            ["nsfwLevel"] = nsfwLevel,
            ["mode"] = mode,
            ["availability"] = availability,
            ["supportsGeneration"] = supportsGeneration,
            ["tags"] = modelTags,
            ["versionName"] = versionName,
            ["baseModel"] = versionBaseModel,
            ["earlyAccessEndsAt"] = earlyAccessEndsAt,
            ["air"] = air,
            ["trainedWords"] = trainedWords,
            ["image"] = image,
            ["downloadUrl"] = downloadUrl,
            ["downloadId"] = downloadId,
            ["fileName"] = fileName,
            ["fileSize"] = fileSize is null ? null : (JToken)fileSize,
            ["openUrl"] = openUrl,
            ["downloadOptions"] = downloadOptions
        };
    }
}

/// <summary>Detects common quantization formats by inspecting filenames.</summary>
public static class QuantDetector
{
    public static readonly (string Label, string[] Needles)[] Patterns =
    [
        ("GGUF",   [".gguf"]),
        ("EXL2",   [".exl2", "-exl2", "_exl2"]),
        ("AWQ",    ["awq"]),
        ("GPTQ",   ["gptq"]),
        ("AQLM",   ["aqlm"]),
        ("EETQ",   ["eetq"]),
        ("MLX",    [".mlx", "-mlx", "_mlx"]),
        ("HQQ",    ["hqq"]),
        ("FP8",    ["fp8", "f8_"]),
        ("FP4",    ["fp4", "nf4", "f4_"]),
        ("INT8",   ["int8", "-i8", "_i8"]),
        ("INT4",   ["int4", "-i4", "_i4"]),
        ("Q8",     ["q8_0", "q8_k"]),
        ("Q6",     ["q6_k"]),
        ("Q5",     ["q5_0", "q5_1", "q5_k"]),
        ("Q4",     ["q4_0", "q4_1", "q4_k"]),
        ("Q3",     ["q3_k"]),
        ("Q2",     ["q2_k"])
    ];

    /// <summary>Returns a short quant label (e.g. "GGUF", "AWQ", "FP8") if detected in the filename, else "".</summary>
    public static string Detect(string filename)
    {
        if (string.IsNullOrWhiteSpace(filename))
        {
            return "";
        }
        string lower = filename.ToLowerInvariant();
        foreach ((string label, string[] needles) in Patterns)
        {
            foreach (string n in needles)
            {
                if (lower.Contains(n))
                {
                    return label;
                }
            }
        }
        return "";
    }
}

/// <summary>Helpers for identifying image files and preview filenames.</summary>
public static class ImageFileHelper
{
    public static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".webp", ".gif"
    };

    public static readonly HashSet<string> PreviewBasenames = new(StringComparer.OrdinalIgnoreCase)
    {
        "thumbnail", "teaser", "cover", "banner", "preview", "example", "sample"
    };

    public static readonly HashSet<string> ModelFileExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".safetensors", ".gguf", ".sft", ".ckpt", ".pt", ".bin", ".zip"
    };

    /// <summary>Returns true if the given file extension is a recognized image format.</summary>
    public static bool IsImageExtension(string ext)
    {
        return ImageExtensions.Contains(ext);
    }

    /// <summary>Returns true if the given file extension is a recognized model file format.</summary>
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
/// <remarks>Initializes a new URL builder with the given base URL.</remarks>
public class UrlBuilder(string baseUrl)
{
    public readonly string BaseUrl = baseUrl;
    public readonly List<(string Key, string Value)> Params = [];

    /// <summary>Appends a query parameter if the value is non-empty.</summary>
    public UrlBuilder Add(string key, string value)
    {
        if (!string.IsNullOrWhiteSpace(value))
        {
            Params.Add((key, value));
        }
        return this;
    }

    /// <summary>Appends a query parameter with an integer value.</summary>
    public UrlBuilder Add(string key, int value)
    {
        Params.Add((key, value.ToString()));
        return this;
    }

    /// <summary>Appends a query parameter if the condition is true and the value is non-empty.</summary>
    public UrlBuilder AddIf(bool condition, string key, string value)
    {
        if (condition && !string.IsNullOrWhiteSpace(value))
        {
            Params.Add((key, value));
        }
        return this;
    }

    /// <summary>Appends a boolean query parameter if the condition is true.</summary>
    public UrlBuilder AddIf(bool condition, string key, bool value)
    {
        if (condition)
        {
            Params.Add((key, value.ToString().ToLowerInvariant()));
        }
        return this;
    }

    /// <inheritdoc/>
    public override string ToString()
    {
        if (Params.Count == 0)
        {
            return BaseUrl;
        }
        return BaseUrl + "?" + string.Join("&", Params.Select(p => $"{HttpUtility.UrlEncode(p.Key)}={HttpUtility.UrlEncode(p.Value)}"));
    }
}
