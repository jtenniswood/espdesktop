import SwiftUI

struct YouTubeSettings: View {
    @ObservedObject var connection: YouTubeConnection
    @State private var link = ""
    @State private var clientID = ""
    @State private var clientSecret = ""
    @State private var editClient = false
    @State private var invalidLink = false

    var body: some View {
        Section("YouTube Broadcast") {
            Text("Monitor a scheduled or live YouTube event on your paired display. OBS controls work independently.")
                .foregroundStyle(.secondary)
            LabeledContent("Status", value: connection.status.title)
            if case .active(let event) = connection.status {
                LabeledContent("Broadcast", value: event.title)
            }
            TextField("Broadcast link or video ID", text: $link)
                .onSubmit(saveLink)
            if invalidLink {
                Text("Enter a YouTube watch link, Live Control Room link, or video ID.")
                    .foregroundStyle(.red)
            }
            HStack {
                Button("Use Broadcast", action: saveLink)
                if let url = connection.studioURL {
                    Link("Open Live Control Room", destination: url)
                }
            }

            if connection.status == .authorizing {
                Button("Cancel Sign-In") { connection.monitor() }
            } else {
                if connection.hasCredentials {
                    HStack {
                        Button("Sign In Again") { connection.signIn() }
                        Button("Disconnect", role: .destructive) { connection.disconnect() }
                        Button(editClient ? "Hide Client Setup" : "Use Another Client") { editClient.toggle() }
                    }
                }
                if !connection.hasCredentials || editClient {
                    Text("For this preview, use a Google Cloud Desktop OAuth client with the YouTube Data API v3 enabled.")
                        .foregroundStyle(.secondary)
                    TextField("Desktop client ID", text: $clientID)
                    SecureField("Desktop client secret", text: $clientSecret)
                    Button("Connect to YouTube") {
                        connection.signIn(client: .init(clientID: clientID.trimmingCharacters(in: .whitespacesAndNewlines),
                                                        clientSecret: clientSecret.trimmingCharacters(in: .whitespacesAndNewlines)))
                        clientSecret = ""
                    }
                    .disabled(clientID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                              clientSecret.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .onAppear { link = connection.eventID }
    }

    private func saveLink() {
        invalidLink = !connection.selectEvent(link)
        if !invalidLink { link = connection.eventID }
    }
}
