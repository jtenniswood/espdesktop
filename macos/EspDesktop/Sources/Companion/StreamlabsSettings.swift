import SwiftUI

struct StreamlabsSettings: View {
    @ObservedObject var connection: StreamlabsConnection
    @State private var port = ""
    @State private var token = ""

    private var validPort: Int? {
        guard let value = Int(port), (1...65535).contains(value) else { return nil }
        return value
    }

    var body: some View {
        Form {
            Section("Streamlabs Desktop") {
                Text("On this Mac, open Streamlabs Desktop → Settings → Mobile → Third Party Connections. Turn on Allow third party connections and copy the API token.")
                    .foregroundStyle(.secondary)
                TextField("Port", text: $port)
                SecureField("API token", text: $token)
                HStack {
                    Button(connection.configured ? "Update Connection" : "Connect") {
                        if let validPort, connection.configure(port: validPort, token: token) {
                            token = ""
                        }
                    }
                    .disabled(validPort == nil || token.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if connection.configured {
                        Button("Reconnect") { connection.reconnect() }
                        Button("Forget Connection", role: .destructive) {
                            connection.disconnect()
                            token = ""
                        }
                    }
                }
                Text(connection.status)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
        .onAppear { port = String(connection.port) }
    }
}
