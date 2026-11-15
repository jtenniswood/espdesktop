import SwiftUI

struct CompanionHealthchecksSettings: View {
    @ObservedObject var store: CompanionStore
    @State private var key = ""
    @State private var saving = false
    @State private var message: String?

    var body: some View {
        Form {
            Section("Healthchecks.io") {
                Text("Connect a project to add its individual checks to your displays.")
                Link("Open Healthchecks.io", destination: URL(string: "https://healthchecks.io/projects/")!)
                SecureField(store.healthchecksUpdate.state == .unconfigured ? "Read-only API key" : "New read-only API key",
                            text: $key)
                    .disabled(saving)
                Text("Create a read-only key under Project Settings → API Access. EspDesktop saves it in your Mac’s Keychain.")
                    .foregroundStyle(.secondary)
                HStack {
                    Button("Test and Save") {
                        let candidate = key.trimmingCharacters(in: .whitespacesAndNewlines)
                        key = ""
                        saving = true
                        message = nil
                        Task {
                            message = await store.connectHealthchecks(key: candidate)
                            saving = false
                        }
                    }
                    .disabled(saving || key.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    if store.healthchecksUpdate.state != .unconfigured {
                        Button("Remove Connection", role: .destructive) {
                            message = store.removeHealthchecks()
                        }
                        .disabled(saving)
                    }
                }
                Text(message ?? status)
                    .foregroundStyle(.secondary)
            }
        }
        .formStyle(.grouped)
    }

    private var status: String {
        if saving { return "Testing connection…" }
        switch store.healthchecksUpdate.state {
        case .unconfigured: return "No project connected"
        case .waiting: return "Checking connection…"
        case .ready: return "Connected · \(store.healthchecksUpdate.checks.count) checks"
        case .stale: return "Could not refresh checks. EspDesktop will try again."
        }
    }
}
