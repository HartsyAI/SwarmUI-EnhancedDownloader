using SwarmUI.Accounts;
using SwarmUI.Core;
using SwarmUI.Utils;
using SwarmUI.WebAPI;
using Hartsy.Extensions.Downloads;
using Microsoft.AspNetCore.Html;

namespace Hartsy.Extensions;

/// <summary>Main extension class that registers scripts, styles, API endpoints, and permissions for the Model Browser.</summary>
public class ModelBrowser : Extension
{
    public static readonly PermInfo PermModelBrowser = Permissions.Register(new("enhanced_downloader", "Model Browser", "Allows access to the Model Browser APIs.", PermissionDefault.POWERUSERS, Permissions.GroupControl, PermSafetyLevel.UNTESTED));

    public static readonly PermInfo PermModelBrowserBrowse = Permissions.Register(new("enhanced_downloader_browse", "Model Browser: Browse", "Allows browsing/searching models via the Model Browser.", PermissionDefault.POWERUSERS, Permissions.GroupControl, PermSafetyLevel.UNTESTED));

    public static readonly PermInfo PermModelBrowserNSFW = Permissions.Register(new("enhanced_downloader_nsfw", "Model Browser: NSFW", "Allows NSFW results in the Model Browser.", PermissionDefault.POWERUSERS, Permissions.GroupControl, PermSafetyLevel.UNTESTED));

    /// <inheritdoc/>
    public override void OnPreInit()
    {
        ScriptFiles.Add("Assets/js/model_browser_utils.js");
        ScriptFiles.Add("Assets/js/download_history.js");
        ScriptFiles.Add("Assets/js/downloads/download_manager.js");
        ScriptFiles.Add("Assets/js/folder_browser_injection.js");
        ScriptFiles.Add("Assets/js/providers/civitai.js");
        ScriptFiles.Add("Assets/js/providers/huggingface.js");
        ScriptFiles.Add("Assets/js/providers/hartsy.js");
        ScriptFiles.Add("Assets/js/components/model_card.js");
        ScriptFiles.Add("Assets/js/components/model_popover.js");
        ScriptFiles.Add("Assets/js/components/featured_models.js");
        ScriptFiles.Add("Assets/js/components/model_browser.js");
        ScriptFiles.Add("Assets/js/model_browser_main.js");
        StyleSheetFiles.Add("Assets/css/model_browser.css");
    }

    /// <inheritdoc/>
    public override void OnInit()
    {
        DownloadManager.Init();
        ModelBrowserAPI.Register();
        BasicAPIFeatures.AcceptedAPIKeyTypes.Add("hartsy");
        if (!UserUpstreamApiKeys.KeysByType.ContainsKey("hartsy"))
        {
            UserUpstreamApiKeys.Register(new("hartsy", "hartsy", "Hartsy", "https://hartsy.ai", new HtmlString("To browse and download models from Hartsy, you must set your Hartsy API key.")));
        }
        Logs.Verbose("SwarmUI-ModelBrowser loaded.");
    }
}
