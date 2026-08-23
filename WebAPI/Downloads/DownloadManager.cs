using FreneticUtilities.FreneticToolkit;
using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;

namespace Hartsy.Extensions.Downloads;

/// <summary>Owns every model download: starting, pausing (Cancel keeps the partial file), resuming via HTTP Range,
/// and clearing. Download tasks run independently of any single request/connection - a page reload or closed tab
/// does not stop a download in progress, and progress + resume state survive a full server restart via records
/// persisted in SwarmUI's own user database (the same LiteDB-backed generic-data store this extension already
/// uses for provider API keys - see <see cref="SaveRecord"/>). This intentionally does not reuse core's
/// `Utilities.DownloadFile`: that helper deletes the partial file on cancel or failure by design, which is the
/// opposite of what resuming needs.</summary>
public static class DownloadManager
{
    /// <summary>All known downloads, keyed by ID. Source of truth in memory; <see cref="SaveRecord"/> mirrors each change to the database.</summary>
    private static readonly ConcurrentDictionary<string, DownloadRecord> Records = new();

    /// <summary>The generic-data "dataname" this extension's download records are filed under in each user's
    /// LiteDB-backed store - the same mechanism <c>session.User.GetGenericData("civitai_api", "key")</c> uses.</summary>
    private const string GenericDataName = "enhanced_downloader_download";

    /// <summary>Completed downloads older than this are dropped from the database at startup so it doesn't grow forever.</summary>
    private static readonly long CompletedRetentionMs = TimeSpan.FromDays(7).Ticks / TimeSpan.TicksPerMillisecond;

    /// <summary>If a read produces no data for this long, the download is treated as stalled and errors out (resumable).</summary>
    private static readonly TimeSpan IdleReadTimeout = TimeSpan.FromMinutes(5);

    /// <summary>Minimum spacing between manifest writes triggered by in-progress byte-count updates, to avoid hammering disk on fast links.</summary>
    private const long ProgressPersistIntervalMs = 2000;

    private const int ReadBufferSize = 256 * 1024;

    /// <summary>Query-string-safe token characters, mirroring core's own sanitization for the same API keys.</summary>
    private static string SanitizeKey(string key) => ModelsAPI.TokenTextLimiter.TrimToMatches(key);

    private static long NowMs() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>Loads every stored download record from the user database. Call once during extension init.
    /// Scans across all users directly (rather than going through each `User` instance, which requires already
    /// knowing which users exist) since this runs before any session has logged in. Any download still marked
    /// `Downloading` did not survive whatever stopped the process, so it's demoted to `Paused` - the partial
    /// bytes are still on disk and remain resumable.</summary>
    public static void Init()
    {
        string marker = $"///${GenericDataName}///";
        List<SessionHandler.GenericDataStore> entries;
        lock (Program.Sessions.DBLock)
        {
            entries = [.. Program.Sessions.GenericData.Find(d => d.ID.Contains(marker))];
        }
        long nowMs = NowMs();
        foreach (SessionHandler.GenericDataStore entry in entries)
        {
            JObject obj;
            try
            {
                obj = JObject.Parse(entry.Data);
            }
            catch (Exception ex)
            {
                Logs.Warning($"Enhanced Downloader: failed to parse stored download record '{entry.ID}', skipping: {ex.ReadableString()}");
                continue;
            }
            DownloadRecord rec = DownloadRecord.FromManifestObject(obj);
            if (string.IsNullOrEmpty(rec.Id) || string.IsNullOrEmpty(rec.UserId))
            {
                continue;
            }
            if (rec.State == DownloadState.Completed)
            {
                if (nowMs - rec.UpdatedAtMs <= CompletedRetentionMs)
                {
                    Records[rec.Id] = rec;
                }
                else
                {
                    lock (Program.Sessions.DBLock)
                    {
                        Program.Sessions.GenericData.Delete(entry.ID);
                    }
                }
                continue;
            }
            if (rec.State == DownloadState.Downloading)
            {
                rec.State = DownloadState.Paused;
            }
            // The stored byte count is only persisted periodically during a transfer (see
            // ProgressPersistIntervalMs), so after a crash it can lag what's actually on disk. The part file
            // itself is ground truth for what can be resumed from - trusting a stale lower count here would send
            // a Range request that doesn't line up with where FileMode.Append actually continues writing.
            rec.DownloadedBytes = File.Exists(rec.PartPath) ? new FileInfo(rec.PartPath).Length : 0;
            Records[rec.Id] = rec;
            SaveRecord(rec); // persist the demotion/reconciliation so it's accurate on the next restart too
        }
    }

    /// <summary>Upserts one download record into its owning user's LiteDB-backed generic-data store - the same
    /// store (and the same `User.SaveGenericData` method) this extension already uses for provider API keys.
    /// Unlike a flat JSON manifest, this only ever touches the one document that changed, not every download.</summary>
    private static void SaveRecord(DownloadRecord rec)
    {
        User user = Program.Sessions.GetUser(rec.UserId, makeNew: false);
        if (user is null)
        {
            Logs.Warning($"Enhanced Downloader: could not persist download '{rec.Id}' - user '{rec.UserId}' not found.");
            return;
        }
        user.SaveGenericData(GenericDataName, rec.Id, rec.ToManifestObject().ToString());
    }

    /// <summary>Removes one download record from its owning user's generic-data store, called once Clear() has confirmed it's safe to forget.</summary>
    private static void RemoveRecord(string userId, string id)
    {
        Program.Sessions.GetUser(userId, makeNew: false)?.DeleteGenericData(GenericDataName, id);
    }

    public static JObject ListForUser(Session session)
    {
        JArray arr = [.. Records.Values.Where(r => r.UserId == session.User.UserID).OrderByDescending(r => r.UpdatedAtMs).Select(r => r.ToNetObject())];
        return new JObject() { ["success"] = true, ["downloads"] = arr };
    }

    private static bool TryGetOwned(Session session, string id, out DownloadRecord rec, out JObject error)
    {
        if (string.IsNullOrEmpty(id) || !Records.TryGetValue(id, out rec) || rec.UserId != session.User.UserID)
        {
            rec = null;
            error = new JObject() { ["error"] = "Download not found." };
            return false;
        }
        error = null;
        return true;
    }

    /// <summary>Mirrors core `DoModelDownloadWS`'s extension/folder resolution exactly, so files land in the same place core would put them.</summary>
    private static (string Extension, string Folder) ResolveExtensionAndFolder(T2IModelHandler handler, string type, string url)
    {
        string extension = "safetensors";
        string folder = handler.DownloadFolderPath;
        if (url.EndsWith(".gguf"))
        {
            extension = "gguf";
            if (type == "Stable-Diffusion")
            {
                folder += "/../diffusion_models";
            }
        }
        return (extension, folder);
    }

    /// <summary>Applies per-host auth handling (Civitai token, HuggingFace bearer) and returns the hint to show if the
    /// host refuses with an auth error. The API keys are resolved fresh from the session here and never stored on the
    /// record, so they never end up in the on-disk manifest.</summary>
    private static (string RequestUrl, Dictionary<string, string> Headers, string AuthHint) ResolveRequest(Session session, string originalUrl)
    {
        string url = originalUrl.Split('#')[0];
        Dictionary<string, string> headers = [];
        // TODO: SwarmUI PR pending. Once merged, delete the body below and use core's shared version instead:
        // string authHint = Utilities.ApplyDownloadAPIKey(ref url, headers, session);
        // return (url, headers, authHint);
        if (url.StartsWith("https://civitai.com/"))
        {
            url = $"https://civitai.red/{url["https://civitai.com/".Length..]}";
        }
        string authHint = null;
        if (url.StartsWith("https://civitai.red/"))
        {
            string key = session.User.GetGenericData("civitai_api", "key");
            bool hasToken = url.Contains("?token=") || url.Contains("&token=");
            if (!string.IsNullOrEmpty(key) && !hasToken)
            {
                url += (url.Contains('?') ? "&token=" : "?token=") + SanitizeKey(key);
                hasToken = true;
            }
            authHint = hasToken ? "Civitai refused this download despite your API key. Make sure your Civitai API key in the User Settings page is valid, and that your Civitai account has access to this model (early access may require a purchase or subscription)."
                : "Civitai refused this download, and you do not have a Civitai API key set. If this model is gated or early-access, set your Civitai API key in the User Settings page to download it.";
        }
        else if (url.StartsWith("https://huggingface.co/"))
        {
            string key = session.User.GetGenericData("huggingface_api", "key");
            if (!string.IsNullOrEmpty(key))
            {
                headers["Authorization"] = $"Bearer {SanitizeKey(key)}";
                authHint = "Hugging Face refused this download despite your API key. Make sure your Hugging Face API key in the User Settings page is valid, and that your account has been granted access to this model (gated models require accepting the terms on the model's page).";
            }
            else
            {
                authHint = "Hugging Face refused this download, and you do not have a Hugging Face API key set. If this model is gated or private, set your Hugging Face API key in the User Settings page to download it.";
            }
        }
        return (url, headers, authHint);
    }

    /// <summary>Extracts the server's stated reason from a failed HTTP response, if it provides one in a recognizable format. Returns null if none.</summary>
    // TODO: SwarmUI PR pending. Once merged, delete this and call Utilities.GetResponseErrorReason instead.
    private static async Task<string> GetResponseErrorReason(HttpResponseMessage response)
    {
        if (response.Headers.TryGetValues("x-error-message", out IEnumerable<string> errHeader))
        {
            string headerReason = errHeader.FirstOrDefault();
            if (!string.IsNullOrWhiteSpace(headerReason))
            {
                return Utilities.CleanTrashTextForDebug(headerReason);
            }
        }
        if (response.Content?.Headers.ContentType?.MediaType == "application/json")
        {
            try
            {
                JObject data = JObject.Parse(await response.Content.ReadAsStringAsync());
                string reason = data.Value<string>("message") ?? data.Value<string>("error");
                if (!string.IsNullOrWhiteSpace(reason))
                {
                    return Utilities.CleanTrashTextForDebug(reason);
                }
            }
            catch (Exception ex)
            {
                Logs.Verbose($"Could not parse an error reason from failed download response body: {ex.ReadableString()}");
            }
        }
        return null;
    }

    /// <summary>Starts a brand new download. Returns `{ error }` for any validation failure (bad URL, refused model
    /// name, unknown type, path already occupied by a finished model or another in-flight download).</summary>
    public static JObject Start(Session session, string url, string type, string name, string metadata, string image)
    {
        if (string.IsNullOrWhiteSpace(url) || (!url.StartsWith("http://") && !url.StartsWith("https://")))
        {
            return new JObject() { ["error"] = "Invalid URL." };
        }
        name = Utilities.StrictFilenameClean(name.Replace(' ', '_'));
        if (ModelsAPI.TryGetRefusalForModel(session, name, out JObject refusal))
        {
            return refusal;
        }
        if (!Program.T2IModelSets.TryGetValue(type, out T2IModelHandler handler))
        {
            return new JObject() { ["error"] = "Invalid type." };
        }
        (string extension, string folder) = ResolveExtensionAndFolder(handler, type, url);
        string outPath = $"{folder}/{name}.{extension}";
        if (File.Exists(outPath))
        {
            return new JObject() { ["error"] = $"A model already exists at '{outPath}' - rename it or choose a different destination." };
        }
        if (Records.Values.Any(r => r.UserId == session.User.UserID && string.Equals(r.OutPath, outPath, StringComparison.OrdinalIgnoreCase)))
        {
            return new JObject() { ["error"] = $"A download to '{outPath}' already exists - resume or clear it from the Downloads panel first." };
        }
        if (!string.IsNullOrEmpty(image) && !string.IsNullOrWhiteSpace(metadata))
        {
            try
            {
                JObject metaObj = JObject.Parse(metadata);
                metaObj["modelspec.thumbnail"] = image;
                metadata = metaObj.ToString();
            }
            catch (Exception ex)
            {
                Logs.Debug($"Enhanced Downloader: failed to inject thumbnail into metadata for '{name}': {ex.ReadableString()}");
            }
        }
        Directory.CreateDirectory(Path.GetDirectoryName(outPath));
        long nowMs = NowMs();
        DownloadRecord rec = new()
        {
            Id = Guid.NewGuid().ToString("N"),
            UserId = session.User.UserID,
            Url = url,
            Type = type,
            Name = name,
            Extension = extension,
            OutPath = outPath,
            PartPath = $"{outPath}.edl.part",
            Metadata = metadata,
            Image = image,
            State = DownloadState.Downloading,
            CreatedAtMs = nowMs,
            UpdatedAtMs = nowMs
        };
        Records[rec.Id] = rec;
        SaveRecord(rec);
        Kick(rec, session);
        return new JObject() { ["success"] = true, ["download"] = rec.ToNetObject() };
    }

    /// <summary>Resumes a paused or errored download from its last saved byte offset. A no-op (not an error) if it's already downloading.</summary>
    public static JObject Resume(Session session, string id)
    {
        if (!TryGetOwned(session, id, out DownloadRecord rec, out JObject error))
        {
            return error;
        }
        if (rec.State == DownloadState.Downloading)
        {
            return new JObject() { ["success"] = true, ["download"] = rec.ToNetObject() };
        }
        if (rec.State == DownloadState.Completed)
        {
            return new JObject() { ["error"] = "This download already completed." };
        }
        rec.State = DownloadState.Downloading;
        rec.ErrorMessage = null;
        rec.TransientNote = null;
        rec.UpdatedAtMs = NowMs();
        SaveRecord(rec);
        Kick(rec, session);
        return new JObject() { ["success"] = true, ["download"] = rec.ToNetObject() };
    }

    private static void Kick(DownloadRecord rec, Session session)
    {
        (string requestUrl, Dictionary<string, string> headers, string authHint) = ResolveRequest(session, rec.Url);
        rec.Canceller = new CancellationTokenSource();
        rec.PumpTask = RunDownloadAsync(rec, requestUrl, headers, authHint);
    }

    /// <summary>Cancels an in-progress download, keeping the partial file for a later Resume. Awaits (briefly) for
    /// the pump task to actually settle into `Paused`, so the response the caller gets back is accurate rather
    /// than a stale "still downloading" read from before the cancellation took effect.</summary>
    public static async Task<JObject> CancelAsync(Session session, string id)
    {
        if (!TryGetOwned(session, id, out DownloadRecord rec, out JObject error))
        {
            return error;
        }
        if (rec.State != DownloadState.Downloading)
        {
            return new JObject() { ["success"] = true, ["download"] = rec.ToNetObject() };
        }
        rec.Canceller?.Cancel();
        Task pump = rec.PumpTask;
        if (pump is not null)
        {
            await Task.WhenAny(pump, Task.Delay(TimeSpan.FromSeconds(5)));
        }
        return new JObject() { ["success"] = true, ["download"] = rec.ToNetObject() };
    }

    /// <summary>Deletes the partial file (if any) and forgets the download. Refused while actively downloading -
    /// Cancel first, so there's never a race between an in-flight write and a delete of the same file.
    /// For a completed download this only removes it from the list; the finished model file is never touched.</summary>
    public static JObject Clear(Session session, string id)
    {
        if (!TryGetOwned(session, id, out DownloadRecord rec, out JObject error))
        {
            return error;
        }
        if (rec.State == DownloadState.Downloading)
        {
            return new JObject() { ["error"] = "Cancel the download before clearing it." };
        }
        try
        {
            if (File.Exists(rec.PartPath))
            {
                File.Delete(rec.PartPath);
            }
        }
        catch (Exception ex)
        {
            return new JObject() { ["error"] = $"Failed to delete partial file: {ex.Message}" };
        }
        Records.TryRemove(rec.Id, out _);
        RemoveRecord(rec.UserId, rec.Id);
        return new JObject() { ["success"] = true };
    }

    /// <summary>The actual transfer. Resumable: if `rec.DownloadedBytes` is already positive and the part file
    /// exists, requests a Range continuation with If-Range so a changed remote file restarts instead of splicing
    /// mismatched bytes together. Runs detached from any specific request/connection - only `rec.Canceller` stops it.</summary>
    private static async Task RunDownloadAsync(DownloadRecord rec, string requestUrl, Dictionary<string, string> headers, string authHint)
    {
        CancellationTokenSource linked = CancellationTokenSource.CreateLinkedTokenSource(Program.GlobalProgramCancel, rec.Canceller.Token);
        try
        {
            bool isResume = rec.DownloadedBytes > 0 && File.Exists(rec.PartPath);
            HttpRequestMessage request = new(HttpMethod.Get, requestUrl);
            foreach ((string key, string value) in headers)
            {
                request.Headers.TryAddWithoutValidation(key, value);
            }
            if (isResume)
            {
                request.Headers.Range = new RangeHeaderValue(rec.DownloadedBytes, null);
                string ifRange = rec.ETag ?? rec.LastModified;
                if (!string.IsNullOrEmpty(ifRange))
                {
                    request.Headers.TryAddWithoutValidation("If-Range", ifRange);
                }
            }
            using HttpResponseMessage response = await Utilities.DownloaderWebClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, linked.Token);
            if (response.StatusCode != HttpStatusCode.OK && response.StatusCode != HttpStatusCode.PartialContent)
            {
                string message = $"Failed to download: got response code {(int)response.StatusCode} {response.StatusCode}";
                if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                {
                    // TODO: SwarmUI PR pending. Once merged, switch to Utilities.GetResponseErrorReason(response).
                    string reason = await GetResponseErrorReason(response);
                    if (reason is not null)
                    {
                        message += $" (\"{reason}\")";
                    }
                    if (authHint is not null)
                    {
                        message += $". {authHint}";
                    }
                }
                throw new SwarmReadableErrorException(message);
            }
            bool serverHonoredRange = response.StatusCode == HttpStatusCode.PartialContent
                && response.Content.Headers.ContentRange is not null
                && response.Content.Headers.ContentRange.From == rec.DownloadedBytes;
            if (isResume && !serverHonoredRange)
            {
                // Either the server ignored the Range request entirely (200, full body from byte 0), or it
                // answered 206 for a *different* range than we asked for (a proxy/CDN quirk). Either way, blindly
                // appending what it sent onto our existing partial would splice mismatched bytes into the file and
                // silently corrupt the model, so start over instead - and say so, since a byte count that jumps
                // backward with no explanation just looks like another progress bug.
                string reason = response.StatusCode == HttpStatusCode.PartialContent ? "returned a different byte range than requested" : "did not support resuming";
                rec.TransientNote = $"The server {reason}, so this download restarted from the beginning.";
                Logs.Info($"Enhanced Downloader: download '{rec.Name}' {reason}; restarting from scratch.");
                isResume = false;
                rec.DownloadedBytes = 0;
            }
            rec.ETag = response.Headers.ETag?.Tag ?? rec.ETag;
            rec.LastModified = response.Content.Headers.LastModified?.ToString("R") ?? rec.LastModified;
            long? reportedTotal = serverHonoredRange ? response.Content.Headers.ContentRange?.Length : response.Content.Headers.ContentLength;
            if (reportedTotal.HasValue && reportedTotal.Value > 0)
            {
                rec.TotalBytes = reportedTotal.Value;
            }

            long lastPersistMs = Environment.TickCount64;
            long lastSpeedSampleMs = Environment.TickCount64;
            long bytesAtLastSample = rec.DownloadedBytes;
            using (FileStream file = new(rec.PartPath, isResume ? FileMode.Append : FileMode.Create, FileAccess.Write))
            {
                if (!isResume)
                {
                    rec.DownloadedBytes = 0;
                }
                using Stream stream = await response.Content.ReadAsStreamAsync(linked.Token);
                byte[] buffer = new byte[ReadBufferSize];
                while (true)
                {
                    int read;
                    using (CancellationTokenSource idleTimeout = CancellationTokenSource.CreateLinkedTokenSource(linked.Token))
                    {
                        idleTimeout.CancelAfter(IdleReadTimeout);
                        try
                        {
                            read = await stream.ReadAsync(buffer, idleTimeout.Token);
                        }
                        catch (OperationCanceledException) when (!linked.Token.IsCancellationRequested)
                        {
                            throw new SwarmReadableErrorException($"Download stalled: no data received for {IdleReadTimeout.TotalMinutes:0} minutes.");
                        }
                    }
                    if (read <= 0)
                    {
                        break;
                    }
                    await file.WriteAsync(buffer.AsMemory(0, read), linked.Token);
                    rec.DownloadedBytes += read;
                    long nowTicks = Environment.TickCount64;
                    if (nowTicks - lastSpeedSampleMs >= 1000)
                    {
                        rec.PerSecond = (rec.DownloadedBytes - bytesAtLastSample) * 1000.0 / (nowTicks - lastSpeedSampleMs);
                        bytesAtLastSample = rec.DownloadedBytes;
                        lastSpeedSampleMs = nowTicks;
                    }
                    if (nowTicks - lastPersistMs >= ProgressPersistIntervalMs)
                    {
                        rec.UpdatedAtMs = NowMs();
                        SaveRecord(rec);
                        lastPersistMs = nowTicks;
                    }
                }
                await file.FlushAsync(linked.Token);
            }
            if (rec.TotalBytes > 0 && rec.DownloadedBytes != rec.TotalBytes)
            {
                throw new SwarmReadableErrorException($"Download incomplete: expected {rec.TotalBytes} bytes but got {rec.DownloadedBytes} bytes.");
            }
            FinalizeDownload(rec);
            rec.State = DownloadState.Completed;
            rec.PerSecond = 0;
            rec.UpdatedAtMs = NowMs();
            SaveRecord(rec);
        }
        catch (OperationCanceledException)
        {
            rec.State = DownloadState.Paused;
            rec.PerSecond = 0;
            rec.UpdatedAtMs = NowMs();
            SaveRecord(rec);
        }
        catch (Exception ex)
        {
            rec.State = DownloadState.Errored;
            rec.ErrorMessage = ex is SwarmReadableErrorException ? ex.Message : "Failed to download the model due to an internal exception.";
            rec.PerSecond = 0;
            rec.UpdatedAtMs = NowMs();
            SaveRecord(rec);
            if (ex is not SwarmReadableErrorException)
            {
                Logs.Warning($"Enhanced Downloader: download '{rec.Name}' failed with internal exception: {ex.ReadableString()}");
            }
        }
        finally
        {
            linked.Dispose();
        }
    }

    /// <summary>Moves the finished part file into place and replicates core's post-download bookkeeping
    /// (metadata sidecar, model handler refresh, optional resave) so a model downloaded this way is
    /// indistinguishable from one downloaded through core's own manual downloader.</summary>
    private static void FinalizeDownload(DownloadRecord rec)
    {
        File.Move(rec.PartPath, rec.OutPath, overwrite: false);
        if (!string.IsNullOrWhiteSpace(rec.Metadata))
        {
            File.WriteAllText(Path.ChangeExtension(rec.OutPath, "swarm.json"), rec.Metadata);
        }
        if (!Program.T2IModelSets.TryGetValue(rec.Type, out T2IModelHandler handler))
        {
            Logs.Warning($"Enhanced Downloader: model type '{rec.Type}' is no longer registered; skipping refresh for completed download '{rec.Name}'.");
            return;
        }
        using (ManyReadOneWriteLock.WriteClaim claim = Program.RefreshLock.LockWrite())
        {
            handler.Refresh();
        }
        if (Program.ServerSettings.Paths.DownloaderAlwaysResave && rec.Extension == "safetensors")
        {
            string modelKey = $"{rec.Name}.safetensors";
            if (handler.Models.TryGetValue(modelKey, out T2IModel model))
            {
                model.ResaveModel();
            }
            else
            {
                Logs.Warning($"Enhanced Downloader: could not resave model '{modelKey}' as it has not shown up in the backing handler.");
            }
        }
    }
}
