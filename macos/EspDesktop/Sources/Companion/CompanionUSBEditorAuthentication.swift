import CryptoKit
import Foundation

struct USBEditorWebCredentials: Equatable {
    let username: String
    let password: String
}

enum USBEditorSignInError: LocalizedError {
    case required, rejected

    var errorDescription: String? {
        switch self {
        case .required: "Sign in with the display’s web editor username and password."
        case .rejected: "The display rejected the web editor sign-in."
        }
    }
}

struct USBEditorWebChallenge {
    private enum Scheme {
        case basic
        case digest(realm: String, nonce: String, opaque: String)
    }

    private let scheme: Scheme
    private let cnonce = UUID().uuidString.lowercased()
    private var count: UInt32 = 0
    let stale: Bool

    init?(_ value: String?) {
        guard let value else { return nil }
        if value.hasPrefix("Basic ") {
            scheme = .basic
            stale = false
            return
        }
        // ESPDesktop's HTTP server advertises MD5 with qop=auth.
        let pattern = /^Digest realm="([^"]+)", qop="auth", algorithm=MD5, nonce="([0-9a-f]{32})", opaque="([0-9a-f]{32})"(, stale=true)?$/
        guard let match = value.wholeMatch(of: pattern) else { return nil }
        scheme = .digest(realm: String(match.1), nonce: String(match.2), opaque: String(match.3))
        stale = match.4 != nil
    }

    mutating func authorization(for request: USBEditorRequest, credentials: USBEditorWebCredentials) -> String? {
        let username = credentials.username
        guard !username.isEmpty, username.utf8.count + credentials.password.utf8.count < 255,
              !username.contains(":"), !request.path.contains("\""),
              username.utf8.allSatisfy({ (32...126).contains($0) && $0 != 34 && $0 != 92 })
        else { return nil }
        switch scheme {
        case .basic:
            return "Basic " + Data("\(username):\(credentials.password)".utf8).base64EncodedString()
        case let .digest(realm, nonce, opaque):
            count += 1
            let nc = String(format: "%08x", count)
            let ha1 = Self.md5("\(username):\(realm):\(credentials.password)")
            let ha2 = Self.md5("\(request.method):\(request.path)")
            let digest = Self.md5("\(ha1):\(nonce):\(nc):\(cnonce):auth:\(ha2)")
            return "Digest username=\"\(username)\", realm=\"\(realm)\", nonce=\"\(nonce)\", uri=\"\(request.path)\", " +
                "algorithm=MD5, response=\"\(digest)\", qop=auth, nc=\(nc), cnonce=\"\(cnonce)\", opaque=\"\(opaque)\""
        }
    }

    private static func md5(_ value: String) -> String {
        Insecure.MD5.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
