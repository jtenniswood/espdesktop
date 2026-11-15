import SwiftUI

struct OBSSettings: View {
    @ObservedObject var connection: OBSConnection
    @State private var port = ""
    @State private var password = ""

    private var validPort: UInt16? {
        UInt16(port).flatMap { $0 > 0 ? $0 : nil }
    }

    var body: some View {
        Form {
            Section("OBS Studio") {
                Text("In OBS Studio, open Tools → WebSocket Server Settings. Enable the server and enter its port and password here.")
                    .foregroundStyle(.secondary)
                TextField("Port", text: $port)
                SecureField("Password", text: $password)
                LabeledContent("Status", value: connection.status.title)

                HStack {
                    Button(connection.enabled ? "Reconnect" : "Connect") {
                        guard let validPort else { return }
                        connection.configure(port: validPort, password: password)
                        password = ""
                    }
                    .disabled(validPort == nil)

                    if connection.enabled {
                        Button("Disconnect", role: .destructive) {
                            connection.disable()
                            password = ""
                        }
                    }
                }
            }

            if let state = connection.state {
                Section("Current broadcast") {
                    LabeledContent("Scene collection", value: state.collection)
                    LabeledContent(state.streaming ? "On air" : "Program", value: state.program?.name ?? "Unknown")
                    if state.studioMode {
                        LabeledContent("Preview", value: state.preview?.name ?? "Unknown")
                    }
                    LabeledContent("Stream", value: state.streamReconnecting ? "Reconnecting" : state.streaming ? "Streaming" : "Idle")
                    LabeledContent("Recording", value: state.recording ? "Recording" : "Idle")
                }
            }
        }
        .formStyle(.grouped)
        .onAppear { port = String(connection.port) }
    }
}
