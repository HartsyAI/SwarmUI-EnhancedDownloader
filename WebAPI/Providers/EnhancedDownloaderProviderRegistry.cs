using System.Collections.ObjectModel;

namespace EnhancedDownloader.Providers;

public static class EnhancedDownloaderProviderRegistry
{
    public static readonly ReadOnlyCollection<IEnhancedDownloaderProvider> Providers = new List<IEnhancedDownloaderProvider>()
    {
        HartsyProvider.Instance,
        CivitAIProvider.Instance,
        HuggingFaceProvider.Instance
    }.AsReadOnly();

    public static readonly ReadOnlyCollection<string> ProviderIds = Providers.Select(p => p.ProviderId).ToList().AsReadOnly();

    public static IEnhancedDownloaderProvider GetProvider(string id)
    {
        return Providers.FirstOrDefault(p => string.Equals(p.ProviderId, id, StringComparison.OrdinalIgnoreCase));
    }
}
