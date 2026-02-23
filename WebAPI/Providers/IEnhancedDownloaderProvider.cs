using Newtonsoft.Json.Linq;
using SwarmUI.Accounts;

namespace Hartsy.Extensions.Providers;

public interface IEnhancedDownloaderProvider
{
    string ProviderId { get; }

    string DisplayName { get; }

    bool SupportsFilters { get; }

    bool SupportsNsfw { get; }

    Task<JObject> SearchAsync(Session session, string query = "", int page = 1, int limit = 24,
        string cursor = "", string type = "", string baseModel = "", string sort = "", bool includeNsfw = false);
}
