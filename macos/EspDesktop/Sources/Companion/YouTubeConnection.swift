import AppKit
import Combine
import Foundation

@MainActor
final class YouTubeConnection: ObservableObject {
    nonisolated static let cardID = "obs.status.youtube"
    private static let service = "io.espdesktop.youtube"
    private static let account = "desktop"
    private static let eventPreference = "youtube.eventID"

    private struct Credentials: Codable {
        let client: YouTubeDesktopClient
        var refreshToken: String
    }

    enum Status: Equatable {
        case disconnected, authorizing, chooseEvent, checking, active(YouTubeBroadcast)
        case signInRequired, eventUnavailable, unavailable, quota, signInFailed, storageUnavailable

        var title: String {
            switch self {
            case .disconnected: return "YouTube monitoring is off"
            case .authorizing: return "Complete sign-in in your browser"
            case .chooseEvent: return "Choose a broadcast"
            case .checking: return "Checking YouTube…"
            case .active(let event): return event.panelDetail
            case .signInRequired: return "Sign in again"
            case .eventUnavailable: return "Check the event link and the signed-in channel"
            case .unavailable: return "YouTube status unavailable"
            case .quota: return "YouTube API limit reached. Checking again in a few minutes."
            case .signInFailed: return "Sign-in didn’t finish. Check your Desktop client and try again."
            case .storageUnavailable: return "EspDesktop couldn’t save the YouTube connection in Keychain."
            }
        }

        var card: OBSConnection.CatalogueEntry {
            let title: String
            let detail: String
            switch self {
            case .active(let event):
                // The label travels through the existing bounded OBS catalogue. Keep room for status
                // and privacy even when a creator uses a long title or multi-byte characters.
                let clean = event.title.components(separatedBy: .controlCharacters).joined(separator: " ")
                    .replacingOccurrences(of: " · ", with: " / ").trimmingCharacters(in: .whitespacesAndNewlines)
                title = String(decoding: clean.utf8.prefix(48), as: UTF8.self)
                    .trimmingCharacters(in: CharacterSet(charactersIn: "\u{FFFD}"))
                detail = event.panelDetail
            case .disconnected, .authorizing: (title, detail) = ("YouTube", "Set up on Mac")
            case .chooseEvent: (title, detail) = ("YouTube", "Choose broadcast")
            case .checking: (title, detail) = ("YouTube", "Checking")
            case .signInRequired: (title, detail) = ("YouTube", "Sign in on Mac")
            default: (title, detail) = ("YouTube", "Unavailable")
            }
            return .init(id: YouTubeConnection.cardID, label: (title.isEmpty ? "YouTube" : title) + " · " + detail)
        }
    }

    @Published private(set) var status: Status = .disconnected
    @Published private(set) var eventID = ""
    @Published private(set) var hasCredentials = false
    private let defaults: UserDefaults
    private let api: YouTubeAPI
    private var credentials: Credentials?
    private var connectionTask: Task<Void, Never>?
    private var callback: YouTubeOAuthCallback?
    private var accessToken: String?
    private var expiresAt = Date.distantPast

    init(defaults: UserDefaults, api: YouTubeAPI = YouTubeAPI()) {
        self.defaults = defaults
        self.api = api
        eventID = defaults.string(forKey: Self.eventPreference).flatMap(YouTubeAPI.videoID) ?? ""
    }

    var studioURL: URL? {
        guard !eventID.isEmpty else { return nil }
        return URL(string: "https://studio.youtube.com/video/\(eventID)/livestreaming")
    }

    func start() {
        guard let data = KeychainStore.load(service: Self.service, account: Self.account),
              let saved = try? JSONDecoder().decode(Credentials.self, from: data) else { return }
        credentials = saved
        hasCredentials = true
        monitor()
    }

    func stop() {
        cancelWork()
    }

    func disconnect() {
        cancelWork()
        KeychainStore.remove(service: Self.service, account: Self.account)
        credentials = nil
        accessToken = nil
        expiresAt = .distantPast
        hasCredentials = false
        status = .disconnected
    }

    func selectEvent(_ input: String) -> Bool {
        let value = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard value.isEmpty || YouTubeAPI.videoID(from: value) != nil else { return false }
        eventID = YouTubeAPI.videoID(from: value) ?? ""
        defaults.set(eventID, forKey: Self.eventPreference)
        if status != .authorizing { monitor() }
        return true
    }

    func signIn(client: YouTubeDesktopClient? = nil) {
        guard let client = client ?? credentials?.client else { return }
        cancelWork()
        status = .authorizing
        connectionTask = Task { [weak self] in
            guard let self else { return }
            do {
                let callback = try YouTubeOAuthCallback()
                self.callback = callback
                let state = UUID().uuidString
                let verifier = UUID().uuidString + UUID().uuidString
                let redirect = try await callback.start(state: state)
                try Task.checkCancellation()
                guard NSWorkspace.shared.open(YouTubeAPI.authorizationURL(client: client, redirect: redirect,
                                                                         state: state, verifier: verifier)) else {
                    throw YouTubeOAuthCallback.Failure.listenerUnavailable
                }
                let code = try await callback.code()
                let tokens = try await api.exchange(client: client, code: code, verifier: verifier, redirect: redirect)
                try Task.checkCancellation()
                guard let refreshToken = tokens.refreshToken, !refreshToken.isEmpty else {
                    throw YouTubeAPI.Failure.signInRequired
                }
                let saved = Credentials(client: client, refreshToken: refreshToken)
                guard save(saved) else { status = .storageUnavailable; return }
                credentials = saved
                hasCredentials = true
                cache(tokens)
                monitor()
            } catch {
                guard !Task.isCancelled else { return }
                callback?.cancel()
                callback = nil
                status = .signInFailed
            }
        }
    }

    private func cancelWork() {
        connectionTask?.cancel()
        connectionTask = nil
        callback?.cancel()
        callback = nil
    }

    func monitor() {
        cancelWork()
        guard credentials != nil else { status = .disconnected; return }
        let id = eventID
        guard !id.isEmpty else { status = .chooseEvent; return }
        status = .checking
        connectionTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let delay = await self?.poll(id: id) else { return }
                try? await Task.sleep(for: .seconds(delay))
            }
        }
    }

    private func poll(id: String) async -> Int? {
        do {
            let token = try await authorization()
            try Task.checkCancellation()
            let event = try await api.broadcast(id: id, token: token)
            try Task.checkCancellation()
            status = .active(event)
            switch event.status {
            case .complete, .revoked: return nil
            case .live, .liveStarting, .testing, .testStarting: return 30
            default: return 60
            }
        } catch {
            guard !Task.isCancelled else { return nil }
            switch error {
            case YouTubeAPI.Failure.signInRequired:
                accessToken = nil
                status = .signInRequired
                return nil
            case YouTubeAPI.Failure.quota:
                status = .quota
                return 300
            case YouTubeAPI.Failure.eventUnavailable:
                status = .eventUnavailable
                return 120
            default:
                status = .unavailable
                return 60
            }
        }
    }

    private func authorization() async throws -> String {
        if let accessToken, Date() < expiresAt { return accessToken }
        guard var saved = credentials else { throw YouTubeAPI.Failure.signInRequired }
        let tokens = try await api.refresh(client: saved.client, refreshToken: saved.refreshToken)
        try Task.checkCancellation()
        if let refresh = tokens.refreshToken, refresh != saved.refreshToken {
            saved.refreshToken = refresh
            if save(saved) { credentials = saved }
        }
        cache(tokens)
        return tokens.accessToken
    }

    private func cache(_ tokens: YouTubeTokens) {
        accessToken = tokens.accessToken
        expiresAt = Date().addingTimeInterval(max(0, tokens.expiresIn - 60))
    }

    private func save(_ saved: Credentials) -> Bool {
        guard let data = try? JSONEncoder().encode(saved) else { return false }
        return KeychainStore.save(data, service: Self.service, account: Self.account)
    }
}
