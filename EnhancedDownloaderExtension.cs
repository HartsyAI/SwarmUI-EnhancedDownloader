using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;

namespace EnhancedDownloader;

public class EnhancedDownloaderExtension : Extension
{
    public static readonly PermInfo PermEnhancedDownloader = Permissions.Register(new("enhanced_downloader", "Enhanced Downloader", "Allows access to the Enhanced Downloader extension APIs.", PermissionDefault.POWERUSERS, Permissions.GroupControl, PermSafetyLevel.UNTESTED));

    public static readonly PermInfo PermEnhancedDownloaderBrowse = Permissions.Register(new("enhanced_downloader_browse", "Enhanced Downloader: Browse", "Allows browsing/searching models via the Enhanced Downloader.", PermissionDefault.POWERUSERS, Permissions.GroupControl, PermSafetyLevel.UNTESTED));

    public static readonly PermInfo PermEnhancedDownloaderNSFW = Permissions.Register(new("enhanced_downloader_nsfw", "Enhanced Downloader: NSFW", "Allows NSFW results in the Enhanced Downloader browser.", PermissionDefault.POWERUSERS, Permissions.GroupControl, PermSafetyLevel.UNTESTED));

    public override void OnInit()
    {
        ScriptFiles.Add("Assets/js/enhanced_downloader_utils.js");
        ScriptFiles.Add("Assets/js/providers/civitai.js");
        ScriptFiles.Add("Assets/js/providers/huggingface.js");
        ScriptFiles.Add("Assets/js/providers/hartsy.js");
        ScriptFiles.Add("Assets/js/components/model_browser.js");
        ScriptFiles.Add("Assets/js/enhanced_downloader.js");
        StyleSheetFiles.Add("Assets/css/enhanced_downloader.css");
        EnhancedDownloaderAPI.Register();
        Logs.Verbose("SwarmUI-EnhancedDownloader extension loaded (scaffold).");
    }
}
