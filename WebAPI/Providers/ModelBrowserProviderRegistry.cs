using System.Collections.ObjectModel;

namespace Hartsy.Extensions.Providers;

/// <summary>Central registry of all available model download providers.</summary>
public static class ModelBrowserProviderRegistry
{
    public static readonly ReadOnlyCollection<IModelBrowserProvider> Providers = new List<IModelBrowserProvider>()
    {
        HartsyProvider.Instance, CivitAIProvider.Instance, HuggingFaceProvider.Instance
    }.AsReadOnly();

    public static readonly ReadOnlyCollection<string> ProviderIds = Providers.Select(p => p.ProviderId).ToList().AsReadOnly();

    /// <summary>Looks up a provider by its ID string, returning null if not found.</summary>
    public static IModelBrowserProvider GetProvider(string id)
    {
        return Providers.FirstOrDefault(p => string.Equals(p.ProviderId, id, StringComparison.OrdinalIgnoreCase));
    }
}
