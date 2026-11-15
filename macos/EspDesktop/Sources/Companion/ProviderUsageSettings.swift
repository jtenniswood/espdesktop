import SwiftUI

struct ProviderUsageSettings: View {
    @ObservedObject var providers: ProviderUsageStore
    @State private var editing: UsageProvider?
    @State private var removalError = false

    var body: some View {
        Form {
            Section {
                ForEach(UsageProvider.allCases) { provider in
                    HStack {
                        Text(provider.title)
                        Spacer()
                        if let status = providers.statuses[provider] {
                            Text(status.label).foregroundStyle(.secondary)
                        }
                        if providers.hasConfiguredKey(provider) {
                            Menu("Manage") {
                                Button("Test Connection") { Task { await providers.test(provider) } }
                                Button("Replace Key…") { editing = provider }
                                Button("Remove Key", role: .destructive) {
                                    removalError = !providers.remove(provider)
                                }
                            }
                        } else {
                            Button("Connect…") { editing = provider }
                        }
                    }
                }
            } header: {
                Text("Usage Providers")
            } footer: {
                Text("Keys are stored in Keychain on this Mac. Paired displays receive usage readings only.")
            }
        }
        .formStyle(.grouped)
        .sheet(item: $editing) { provider in
            ConnectUsageProvider(providers: providers, provider: provider)
        }
        .alert("Could not remove the key", isPresented: $removalError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Unlock your login Keychain and try again.")
        }
    }
}

private struct ConnectUsageProvider: View {
    let providers: ProviderUsageStore
    let provider: UsageProvider
    @Environment(\.dismiss) private var dismiss
    @State private var key = ""
    @State private var error: String?
    @State private var connecting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Connect \(provider.title)").font(.headline)
            SecureField("Personal API key", text: $key)
            Link("Get an API key", destination: provider.keyURL)
            if let error { Text(error).foregroundStyle(.secondary) }
            HStack {
                Spacer()
                Button("Cancel") { dismiss() }.disabled(connecting)
                Button(connecting ? "Checking…" : "Connect") {
                    let input = key
                    key = ""
                    connecting = true
                    error = nil
                    Task {
                        let result = await providers.connect(provider, input: input)
                        connecting = false
                        if let result { error = result } else { dismiss() }
                    }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(key.isEmpty || connecting)
            }
        }
        .padding(20)
        .frame(width: 380)
    }
}
