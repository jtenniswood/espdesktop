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
                Section("Break Settings") {
                    Picker("Break scene", selection: Binding(
                        get: { connection.breakConfiguration?.sceneID ?? "" },
                        set: { connection.configureBreak(sceneID: $0, micID: connection.breakConfiguration?.micID) }
                    )) {
                        Text("Choose a scene").tag("")
                        ForEach(state.scenes) { scene in Text(scene.name).tag(scene.id) }
                        if let saved = connection.breakConfiguration?.sceneID, !saved.isEmpty,
                           !state.scenes.contains(where: { $0.id == saved }) {
                            Text("Saved scene unavailable").tag(saved)
                        }
                    }
                    .disabled(!connection.canConfigureBreak)
                    Picker("Mute during break", selection: Binding(
                        get: { connection.breakConfiguration?.micID ?? "" },
                        set: { connection.configureBreak(sceneID: connection.breakConfiguration?.sceneID ?? "",
                                                         micID: $0.isEmpty ? nil : $0) }
                    )) {
                        Text("Leave audio as is").tag("")
                        ForEach(state.inputs.filter { state.inputMutes[$0.id] != nil }) { input in
                            Text(input.name).tag(input.id)
                        }
                        if let saved = connection.breakConfiguration?.micID, state.inputMutes[saved] == nil {
                            Text("Saved input unavailable").tag(saved)
                        }
                    }
                    .disabled(!connection.canConfigureBreak)
                    if connection.breakNeedsReview {
                        Text("Check the Program scene and microphone in OBS before continuing.")
                        Button("Clear BRB alert") { connection.acknowledgeBreakReview() }
                    }
                }
            }
        }
        .formStyle(.grouped)
        .onAppear { port = String(connection.port) }
    }
}
