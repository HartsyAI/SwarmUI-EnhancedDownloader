using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;

namespace EnhancedDownloader;

public class EnhancedDownloaderExtension : Extension
{
    public static readonly PermInfo PermEnhancedDownloader = Permissions.Register(new("enhanced_downloader", "Enhanced Downloader", "Allows access to the Enhanced Downloader extension APIs.", PermissionDefault.POWERUSERS, Permissions.GroupControl, PermSafetyLevel.UNTESTED));

    public override void OnInit()
    {
        ScriptFiles.Add("Assets/js/enhanced_downloader.js");
        StyleSheetFiles.Add("Assets/css/enhanced_downloader.css");
        EnhancedDownloaderAPI.Register();
        Logs.Verbose("SwarmUI-EnhancedDownloader extension loaded (scaffold).");
    }
}
