import SwiftUI

struct TwitchSettings: View {
    @ObservedObject var twitch: TwitchBroadcast
    @State private var categoryQuery = ""
    @State private var categories: [TwitchAPI.Category] = []
    @State private var categorySearchFailed = false
    @State private var searching = false
    @State private var winner = ""
    @State private var confirmation: TwitchControl?

    var body: some View {
        Form {
            Section("Twitch Account") {
                TextField("Public Twitch client ID", text: $twitch.clientID)
                    .disabled(twitch.connecting)
                Link("Register a public Twitch application", destination: URL(string: "https://dev.twitch.tv/console/apps")!)
                HStack {
                    Button(twitch.identity == nil ? "Connect Twitch" : "Renew Authorization") { twitch.connect() }
                        .disabled(!twitch.canConnect)
                    if twitch.connecting {
                        Button("Cancel Sign-In") { twitch.cancelSignIn() }
                    }
                    if twitch.identity != nil || twitch.status == .unavailable {
                        Button("Disconnect", role: .destructive) { twitch.disconnect() }
                    }
                }
                if let code = twitch.userCode, let url = twitch.verificationURL {
                    LabeledContent("Device code", value: code).textSelection(.enabled)
                    Link("Enter code on Twitch", destination: url)
                }
                if let who = twitch.identity {
                    LabeledContent("Channel", value: twitch.account?.displayName ?? who.login)
                }
                LabeledContent("Status", value: twitch.status.title)
                if let stream = twitch.stream, twitch.status == .live {
                    LabeledContent("Viewers", value: stream.viewerCount.formatted())
                }
                if !twitch.message.isEmpty { Text(twitch.message).foregroundStyle(.secondary) }
            }

            Section("Stream Details") {
                if let channel = twitch.channel { LabeledContent("Current title", value: channel.title) }
                TextField("Preset title", text: $twitch.configuration.streamTitle)
                HStack {
                    TextField("Search Twitch categories", text: $categoryQuery)
                        .onSubmit(searchCategories)
                    Button("Search", action: searchCategories)
                        .disabled(searching || twitch.identity == nil || categoryQuery.trimmingCharacters(in: .whitespaces).isEmpty)
                }
                if categorySearchFailed { Text("Could not load Twitch categories.").foregroundStyle(.secondary) }
                if !categories.isEmpty {
                    Picker("Category to apply", selection: Binding(
                        get: { twitch.configuration.category?.id ?? "" },
                        set: { id in
                            twitch.configuration.category = categories.first { $0.id == id }
                        }
                    )) {
                        Text("Keep current category").tag("")
                        if let saved = twitch.configuration.category, !categories.contains(saved) {
                            Text(saved.name).tag(saved.id)
                        }
                        ForEach(categories) { category in Text(category.name).tag(category.id) }
                    }
                } else if let category = twitch.configuration.category {
                    LabeledContent("Category to apply", value: category.name)
                    Button("Keep Current Category") { twitch.configuration.category = nil }
                }
                Toggle("Replace tags", isOn: $twitch.configuration.replaceTags)
                if twitch.configuration.replaceTags {
                    TextField("Tags, separated by commas", text: $twitch.configuration.streamTags)
                }
                button(.details)
            }

            Section("Highlights") {
                TextField("Marker note (optional)", text: $twitch.configuration.markerDescription)
                HStack { button(.marker); button(.clip) }
                if let clip = twitch.lastClip { Link("Open latest clip", destination: clip.url) }
            }

            Section("Ads, Polls and Predictions") {
                Toggle("Enable ad controls", isOn: $twitch.configuration.adsEnabled)
                Toggle("Enable poll controls", isOn: $twitch.configuration.pollsEnabled)
                Toggle("Enable prediction controls", isOn: $twitch.configuration.predictionsEnabled)
                if twitch.needsAuthorizationUpdate {
                    Text("Renew authorization above to enable the selected controls.").foregroundStyle(.secondary)
                }
                if let account = twitch.account, !account.eligibleForCommercialsAndPolls {
                    Text("Twitch offers these controls to Affiliates and Partners.").foregroundStyle(.secondary)
                }
            }

            if twitch.configuration.adsEnabled {
                Section("Ad Break") {
                    Picker("Requested length", selection: $twitch.configuration.commercialSeconds) {
                        ForEach([30, 60, 90, 120, 150, 180], id: \.self) { seconds in
                            Text("\(seconds) seconds").tag(seconds)
                        }
                    }
                    button(.commercial, confirm: true)
                }
            }
            if twitch.configuration.pollsEnabled {
                Section("Poll Preset") {
                    questionFields($twitch.configuration.poll, label: "Choices", range: 15...1800)
                    HStack { button(.pollStart, confirm: true); button(.pollEnd, confirm: true) }
                }
            }
            if twitch.configuration.predictionsEnabled {
                Section("Prediction Preset") {
                    questionFields($twitch.configuration.prediction, label: "Outcomes", range: 30...1800)
                    HStack {
                        button(.predictionStart, confirm: true)
                        button(.predictionLock, confirm: true)
                        button(.predictionCancel, confirm: true)
                    }
                    if let prediction = twitch.prediction, ["ACTIVE", "LOCKED"].contains(prediction.status) {
                        LabeledContent("Current prediction", value: prediction.title)
                        Picker("Winning outcome", selection: $winner) {
                            Text("Choose outcome").tag("")
                            ForEach(prediction.outcomes) { outcome in Text(outcome.title).tag(outcome.id) }
                        }
                        button(.predictionWinner, confirm: true).disabled(winner.isEmpty)
                    }
                }
            }
            Section("Twitch Tools") {
                HStack { button(.dashboard); button(.inspector) }
            }
        }
        .formStyle(.grouped)
        .onChange(of: twitch.prediction?.id) { _ in winner = "" }
        .alert(confirmation?.title ?? "", isPresented: Binding(
            get: { confirmation != nil },
            set: { if !$0 { confirmation = nil } }
        ), presenting: confirmation) { control in
            Button("Continue") { invoke(control) }
            Button("Cancel", role: .cancel) {}
        } message: { control in
            Text(control == .predictionWinner
                 ? "Award Channel Points to viewers who picked this outcome?"
                 : "Apply this action to your connected Twitch channel?")
        }
    }

    private func questionFields(_ question: Binding<TwitchBroadcastConfiguration.Question>, label: String,
                                range: ClosedRange<Int>) -> some View {
        Group {
            TextField("Question", text: question.title)
            LabeledContent(label) {
                TextEditor(text: question.choices).frame(minHeight: 64)
                    .accessibilityLabel("\(label), one per line")
            }
            Text("Enter one per line.").foregroundStyle(.secondary)
            Stepper("\(question.wrappedValue.seconds) seconds", value: question.seconds, in: range, step: 1)
        }
    }

    private func button(_ control: TwitchControl, confirm: Bool = false) -> some View {
        Button(control.title) {
            if confirm { confirmation = control }
            else { invoke(control) }
        }
        .disabled(twitch.controls.first(where: { $0.control == control })?.enabled != true)
    }

    private func invoke(_ control: TwitchControl) {
        let chosenWinner = winner
        Task { _ = await twitch.invoke(control, winner: chosenWinner) }
    }

    private func searchCategories() {
        guard twitch.identity != nil, !searching else { return }
        searching = true
        categorySearchFailed = false
        let query = categoryQuery
        Task {
            defer { searching = false }
            do { categories = try await twitch.searchCategories(query) }
            catch { categorySearchFailed = true }
        }
    }
}
