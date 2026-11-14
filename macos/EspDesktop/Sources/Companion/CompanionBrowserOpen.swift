/// Commands target the Mac's default browser. The validated URL is passed as
/// data to osascript so characters in the link cannot alter the script.
enum CompanionBrowserOpen {
    static func script(browserID: String?, newWindow: Bool) -> String? {
        let application: String
        let openWindow: String
        let openTab: String
        switch browserID {
        case "com.apple.Safari":
            application = "Safari"
            openWindow = "make new document with properties {URL:targetURL}"
            openTab = """
            set targetWindow to front window
            set newTab to make new tab at end of tabs of targetWindow with properties {URL:targetURL}
            set current tab of targetWindow to newTab
            """
        case "com.google.Chrome":
            application = "Google Chrome"
            openWindow = """
            set targetWindow to make new window
            set URL of active tab of targetWindow to targetURL
            """
            openTab = """
            set targetWindow to front window
            make new tab at end of tabs of targetWindow with properties {URL:targetURL}
            set active tab index of targetWindow to count of tabs of targetWindow
            """
        default:
            return nil
        }
        let command = newWindow ? openWindow : """
        if (count of windows) is 0 then
            \(openWindow)
        else
            \(openTab)
        end if
        """
        return """
        on run argv
            set targetURL to item 1 of argv
            try
                tell application "\(application)"
                    \(command)
                    activate
                end tell
                return "opened"
            on error number -1743
                return "denied"
            end try
        end run
        """
    }
}
