import Foundation

struct TwitchBroadcastConfiguration: Codable, Equatable {
    struct Question: Codable, Equatable {
        var title = ""
        var choices = ""
        var seconds: Int

        var options: [String] {
            choices.split(whereSeparator: \.isNewline)
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }

        func valid(maxTitle: Int, maxChoice: Int, count: ClosedRange<Int>, duration: ClosedRange<Int>) -> Bool {
            let options = options
            return (1...maxTitle).contains(title.trimmingCharacters(in: .whitespacesAndNewlines).count)
                && count.contains(options.count)
                && options.allSatisfy { $0.count <= maxChoice }
                && Set(options.map { $0.lowercased() }).count == options.count
                && duration.contains(seconds)
        }
    }

    var streamTitle = ""
    var category: TwitchAPI.Category?
    var streamTags = ""
    var replaceTags = false
    var markerDescription = ""
    var commercialSeconds = 30
    var poll = Question(seconds: 60)
    var prediction = Question(seconds: 60)
    var adsEnabled = false
    var pollsEnabled = false
    var predictionsEnabled = false

    var scopes: Set<TwitchScope> {
        var scopes: Set<TwitchScope> = [.broadcast, .clips]
        if adsEnabled { scopes.insert(.commercials) }
        if pollsEnabled { scopes.insert(.polls) }
        if predictionsEnabled { scopes.insert(.predictions) }
        return scopes
    }

    var tags: [String] {
        streamTags.split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    var validStreamDetails: Bool {
        let title = streamTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        return (1...140).contains(title.count)
            && (!replaceTags || (tags.count <= 10 && tags.allSatisfy {
                (1...25).contains($0.count) && !$0.contains(where: \.isWhitespace)
            }))
    }

    var validPoll: Bool { poll.valid(maxTitle: 60, maxChoice: 25, count: 2...5, duration: 15...1800) }
    var validPrediction: Bool { prediction.valid(maxTitle: 45, maxChoice: 25, count: 2...10, duration: 30...1800) }
}
