import Foundation
import XCTest
@testable import Companion

@MainActor
final class CompanionPreviewReleaseTests: XCTestCase {
    func testFeedMustMatchProtocolAndPublishedAsset() throws {
        let release = try decode(tag: "v2.0.0-beta.1", protocolVersion: 3)
        XCTAssertNotNil(release.feedURL(protocolVersion: 3))
        XCTAssertNil(release.feedURL(protocolVersion: 4))
        XCTAssertNil(try decode(tag: "v2.0.0/../../bad", protocolVersion: 3).feedURL(protocolVersion: 3))
        XCTAssertNil(try decode(tag: "v2.0.0", protocolVersion: 3, draft: true).feedURL(protocolVersion: 3))
    }

    func testStableBeatsPreviewOfSameVersion() async throws {
        let releases = "[\(json(tag: "v2.0.0-beta.1")),\(json(tag: "v2.0.0"))]"
        let feed = try await select(releases)
        XCTAssertTrue(feed!.absoluteString.contains("/v2.0.0/"))
    }

    func testNewerPreviewBeatsOlderStable() async throws {
        let releases = "[\(json(tag: "v2.9.0")),\(json(tag: "v2.10.0-beta.2")),\(json(tag: "v2.10.0-beta.10"))]"
        let feed = try await select(releases)
        XCTAssertTrue(feed!.absoluteString.contains("/v2.10.0-beta.10/"))
    }

    func testEmptyHistoryFallsBackToStableFeed() async throws {
        let feed = try await select("[]")
        XCTAssertNil(feed)
    }

    func testNetworkErrorDoesNotLookLikeEmptyHistory() async {
        do {
            _ = try await CompanionPreviewRelease.latestFeed(protocolVersion: 3) { request in
                (Data("[]".utf8), HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: nil)!)
            }
            XCTFail("Expected failure")
        } catch { }
    }

    private func select(_ json: String) async throws -> URL? {
        try await CompanionPreviewRelease.latestFeed(protocolVersion: 3) { request in
            (Data(json.utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
        }
    }

    private func decode(tag: String, protocolVersion: Int, draft: Bool = false) throws -> CompanionPreviewRelease {
        try JSONDecoder().decode(CompanionPreviewRelease.self, from: Data(json(tag: tag, protocolVersion: protocolVersion, draft: draft).utf8))
    }

    private func json(tag: String, protocolVersion: Int = 3, draft: Bool = false) -> String {
        """
        {"tag_name":"\(tag)","draft":\(draft),"assets":[{"name":"companion-appcast-v\(protocolVersion).xml","state":"uploaded","size":100}]}
        """
    }
}
