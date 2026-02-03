namespace EnhancedDownloader.Providers;

public class HartsyProvider : IEnhancedDownloaderProvider
{
    public static readonly HartsyProvider Instance = new();

    public string ProviderId => "hartsy";
}
