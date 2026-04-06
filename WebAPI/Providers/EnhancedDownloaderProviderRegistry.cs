using System.Collections.ObjectModel;

namespace Hartsy.Extensions.Providers;

/// <summary>Central registry of all available model download providers.</summary>
public static class EnhancedDownloaderProviderRegistry
{
    public static readonly ReadOnlyCollection<IEnhancedDownloaderProvider> Providers = new List<IEnhancedDownloaderProvider>()
    {
        HartsyProvider.Instance, CivitAIProvider.Instance, HuggingFaceProvider.Instance
    }.AsReadOnly();

    public static readonly ReadOnlyCollection<string> ProviderIds = Providers.Select(p => p.ProviderId).ToList().AsReadOnly();

    /// <summary>Looks up a provider by its ID string, returning null if not found.</summary>
    public static IEnhancedDownloaderProvider GetProvider(string id)
    {
        return Providers.FirstOrDefault(p => string.Equals(p.ProviderId, id, StringComparison.OrdinalIgnoreCase));
    }
}
