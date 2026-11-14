using System.IO;

namespace EspDesktop;

internal static class WindowsPresets
{
    public static (string Label, string Keys, string Icon)[] For(string? executable, string target)
    {
        var app = target.ToLowerInvariant() switch
        {
            "msedge" or "microsoft.microsoftedge.stable_8wekyb3d8bbwe!app" => "msedge.exe",
            "microsoft.windowsnotepad_8wekyb3d8bbwe!app" => "notepad.exe",
            _ => Path.GetFileName(executable ?? target).ToLowerInvariant()
        };
        return ForExecutable(app);
    }

    // The position is the preset ID saved by the display editor. Append new
    // choices for an existing app to preserve IDs in saved configurations.
    private static (string Label, string Keys, string Icon)[] ForExecutable(string executable) => executable switch
    {
        "chrome.exe" or "msedge.exe" or "brave.exe" or "vivaldi.exe" or "firefox.exe" or "opera.exe" =>
        [
            ("New Tab", "control+t", "New Tab"), ("New Window", "control+n", "New Window"),
            ("Reopen Tab", "control+shift+t", "Undo"), ("Find", "control+f", "Search"),
            ("Refresh", "control+r", "Refresh"), ("Close Tab", "control+w", "Close"),
            ("Next Tab", "control+tab", "Chevron Right"), ("Previous Tab", "control+shift+tab", "Chevron Left")
        ],
        "code.exe" or "cursor.exe" =>
        [
            ("Command Palette", "control+shift+p", "Shortcut Command"), ("Quick Open", "control+p", "Search"),
            ("Find in Files", "control+shift+f", "Search"), ("Save", "control+s", "Save"),
            ("Terminal", "control+keybackquote", "Terminal"), ("Explorer", "control+shift+e", "Folder")
        ],
        "winword.exe" or "excel.exe" or "powerpnt.exe" =>
        [
            ("New", "control+n", "New Window"), ("Open", "control+o", "Folder"),
            ("Save", "control+s", "Save"), ("Print", "control+p", "Printer"),
            ("Undo", "control+z", "Undo"), ("Redo", "control+y", "Redo")
        ],
        "notepad.exe" =>
        [
            ("New", "control+n", "New Window"), ("Open", "control+o", "Folder"),
            ("Save", "control+s", "Save"), ("Find", "control+f", "Search")
        ],
        "slack.exe" =>
        [
            ("New Message", "control+n", "Chat Plus"), ("Search", "control+g", "Search"),
            ("Browse DMs", "control+shift+2", "Chat"), ("All Unread", "control+shift+a", "Message Unread"),
            ("Search Chat", "control+f", "Search"), ("Set Status", "control+shift+y", "Bell"),
            ("Preferences", "control+keycomma", "Settings")
        ],
        "discord.exe" =>
        [
            ("Direct Message", "control+k", "Chat"), ("Search All", "control+shift+f", "Search"),
            ("Toggle Mic", "control+shift+m", "Microphone Off"), ("Toggle Deafen", "control+shift+d", "Headphones"),
            ("Upload File", "control+shift+u", "Upload"), ("Show Pins", "control+p", "Pin"),
            ("Show Hotkeys", "control+keyslash", "Keyboard")
        ],
        "spotify.exe" =>
        [
            ("Search", "control+k", "Search"), ("Filter", "control+f", "Search"),
            ("Shuffle", "control+s", "Shuffle"), ("Repeat", "control+r", "Repeat"),
            ("Queue", "option+shift+q", "Playlist Music"), ("Preferences", "control+keycomma", "Settings")
        ],
        "githubdesktop.exe" =>
        [
            ("Repositories", "control+t", "Git"), ("Changes", "control+1", "Git"),
            ("History", "control+2", "History"), ("Branches", "control+b", "Git"),
            ("Open Editor", "control+shift+a", "Code Tags"), ("Show in Explorer", "control+shift+f", "Folder"),
            ("Options", "control+keycomma", "Settings")
        ],
        _ => []
    };
}
