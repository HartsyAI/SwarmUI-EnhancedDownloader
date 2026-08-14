using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace Hartsy.Extensions.Downloads;

/// <summary>Lifecycle state of a single download. `Paused` and `Errored` are both resumable from their last
/// persisted byte offset - the only difference is whether the last attempt ended via user Cancel or a failure.</summary>
public enum DownloadState { Downloading, Paused, Errored, Completed }

/// <summary>Persisted state for one model download, resumable across Cancel/Retry and server restarts.
/// Everything needed to resume (offset, ETag, Last-Modified) is saved to the database; API keys are never
/// persisted here and are re-resolved from the session on every Start/Resume call instead.</summary>
public class DownloadRecord
{
    public string Id;
    public string UserId;
    public string Url;
    public string Type;
    public string Name;
    public string Extension;
    public string OutPath;
    public string PartPath;
    public string Metadata;
    public string Image;
    public long TotalBytes;
    public long DownloadedBytes;
    public string ETag;
    public string LastModified;
    public DownloadState State;
    public string ErrorMessage;
    public long CreatedAtMs;
    public long UpdatedAtMs;

    /// <summary>Bytes/sec over the last ~1s sampling window. Not persisted - meaningless once a download isn't actively running.</summary>
    [JsonIgnore] public double PerSecond;
    /// <summary>One-shot, non-persisted note for the current attempt only (eg "server didn't support resuming,
    /// restarted from scratch") - otherwise a downloaded-bytes count that jumps backward with no explanation
    /// reads as the same kind of progress bug this was built to fix.</summary>
    [JsonIgnore] public string TransientNote;
    /// <summary>Signals the running pump task to stop. Null unless a download is currently in flight.</summary>
    [JsonIgnore] public CancellationTokenSource Canceller;
    /// <summary>The in-flight pump task, if any. Cancel() awaits this (bounded) so its response reflects the settled state.</summary>
    [JsonIgnore] public Task PumpTask;

    /// <summary>Shape sent to the frontend: omits filesystem paths and internal fields the UI has no use for.</summary>
    public JObject ToNetObject()
    {
        return new JObject()
        {
            ["id"] = Id,
            ["url"] = Url,
            ["type"] = Type,
            ["name"] = Name,
            ["extension"] = Extension,
            ["image"] = Image,
            ["totalBytes"] = TotalBytes,
            ["downloadedBytes"] = DownloadedBytes,
            ["perSecond"] = PerSecond,
            ["state"] = State.ToString().ToLowerInvariant(),
            ["error"] = ErrorMessage,
            ["note"] = TransientNote,
            ["createdAtMs"] = CreatedAtMs,
            ["updatedAtMs"] = UpdatedAtMs
        };
    }

    /// <summary>Shape written to persistent storage: everything needed to resume or redraw a card, minus the ephemeral fields above.</summary>
    public JObject ToManifestObject()
    {
        return new JObject()
        {
            ["id"] = Id,
            ["userId"] = UserId,
            ["url"] = Url,
            ["type"] = Type,
            ["name"] = Name,
            ["extension"] = Extension,
            ["outPath"] = OutPath,
            ["partPath"] = PartPath,
            ["metadata"] = Metadata,
            ["image"] = Image,
            ["totalBytes"] = TotalBytes,
            ["downloadedBytes"] = DownloadedBytes,
            ["etag"] = ETag,
            ["lastModified"] = LastModified,
            ["state"] = State.ToString(),
            ["errorMessage"] = ErrorMessage,
            ["createdAtMs"] = CreatedAtMs,
            ["updatedAtMs"] = UpdatedAtMs
        };
    }

    public static DownloadRecord FromManifestObject(JObject obj)
    {
        return new DownloadRecord()
        {
            Id = $"{obj["id"]}",
            UserId = $"{obj["userId"]}",
            Url = $"{obj["url"]}",
            Type = $"{obj["type"]}",
            Name = $"{obj["name"]}",
            Extension = $"{obj["extension"]}",
            OutPath = $"{obj["outPath"]}",
            PartPath = $"{obj["partPath"]}",
            Metadata = obj["metadata"]?.ToString(),
            Image = obj["image"]?.ToString(),
            TotalBytes = (long)(obj["totalBytes"] ?? 0),
            DownloadedBytes = (long)(obj["downloadedBytes"] ?? 0),
            ETag = obj["etag"]?.ToString(),
            LastModified = obj["lastModified"]?.ToString(),
            State = Enum.TryParse(($"{obj["state"]}"), out DownloadState state) ? state : DownloadState.Errored,
            ErrorMessage = obj["errorMessage"]?.ToString(),
            CreatedAtMs = (long)(obj["createdAtMs"] ?? 0),
            UpdatedAtMs = (long)(obj["updatedAtMs"] ?? 0)
        };
    }
}
