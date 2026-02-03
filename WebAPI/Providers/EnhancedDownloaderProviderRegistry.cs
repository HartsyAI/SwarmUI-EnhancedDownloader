using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Linq;

namespace EnhancedDownloader.Providers;

public static class EnhancedDownloaderProviderRegistry
{
    public static readonly ReadOnlyCollection<IEnhancedDownloaderProvider> Providers = new List<IEnhancedDownloaderProvider>()
    {
        CivitAIProvider.Instance,
        HuggingFaceProvider.Instance,
        HartsyProvider.Instance
    }.AsReadOnly();

    public static readonly ReadOnlyCollection<string> ProviderIds = Providers.Select(p => p.ProviderId).ToList().AsReadOnly();
}
