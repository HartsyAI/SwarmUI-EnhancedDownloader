using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;

namespace Hartsy.Extensions.Providers;

/// <summary>Defines the contract for a model download provider (CivitAI, Hugging Face, Hartsy, etc.).</summary>
public interface IEnhancedDownloaderProvider
{
    /// <summary>Unique identifier for this provider (e.g. "civitai", "huggingface").</summary>
    string ProviderId { get; }

    /// <summary>Human-readable display name shown in the UI.</summary>
    string DisplayName { get; }

    /// <summary>Whether this provider supports type/baseModel/sort filter options.</summary>
    bool SupportsFilters { get; }

    /// <summary>Whether this provider supports NSFW content filtering.</summary>
    bool SupportsNsfw { get; }

    /// <summary>Searches this provider for models matching the given query and filters.</summary>
    Task<JObject> SearchAsync(Session session, string query = "", int page = 1, int limit = 24, string cursor = "", string type = "", string baseModel = "", string sort = "", bool includeNsfw = false);
}
