namespace EspDesktop;

internal static class WindowsPresets
{
    public static (string Label, string Keys, string Icon)[] For(string executable) => executable switch
    {
        "chrome.exe" or "msedge.exe" or "brave.exe" or "vivaldi.exe" or "firefox.exe" =>
        [
            ("New Tab", "control+t", "New Tab"), ("New Window", "control+n", "New Window"),
            ("Reopen Tab", "control+shift+t", "Undo"), ("Find", "control+f", "Search"),
            ("Refresh", "control+r", "Refresh"), ("Close Tab", "control+w", "Close"),
            ("Next Tab", "control+tab", "Chevron Right"), ("Previous Tab", "control+shift+tab", "Chevron Left")
        ],
        "code.exe" or "cursor.exe" =>
        [
            ("Command Palette", "control+shift+p", "Command"), ("Quick Open", "control+p", "Search"),
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
        _ => []
    };
}
