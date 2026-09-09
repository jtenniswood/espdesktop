/// Pair first, then customize. An existing saved pairing can resume unfinished setup.
enum CompanionSetupRoute: Equatable {
    case settings, pairing, preferences

    static func resolve(completed: Bool, showingHelp: Bool, hasSavedPairing: Bool, pairingInProgress: Bool, pairingConnected: Bool = false) -> Self {
        if completed || showingHelp { return .settings }
        if !hasSavedPairing || (pairingInProgress && !pairingConnected) { return .pairing }
        return .preferences
    }
}
