import AppKit
import XCTest
@testable import Companion

final class CompanionArtworkTests: XCTestCase {
    @MainActor
    func testSupportButtonReusesDiskCacheWhenBundledArtworkIsMissingOrUnreadable() throws {
        let files = FileManager.default
        let root = files.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let bundledURL = root.appendingPathComponent("bundled.png")
        let cacheURL = root.appendingPathComponent("Cache/cached.png")
        let originalURL = try XCTUnwrap(Bundle.companionResources?.url(
            forResource: "buy-me-a-coffee-button", withExtension: "png"
        ))
        let original = try Data(contentsOf: originalURL)
        try files.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? files.removeItem(at: root) }
        try original.write(to: bundledURL)

        let bundledImage = try XCTUnwrap(CompanionArtwork.loadSupportButton(
            bundledURL: bundledURL, cacheURL: cacheURL
        ))
        let expectedArtwork = try XCTUnwrap(bundledImage.tiffRepresentation)
        XCTAssertEqual(try Data(contentsOf: cacheURL), original)

        try Data("unreadable image".utf8).write(to: bundledURL)
        let imageFromCache = CompanionArtwork.loadSupportButton(bundledURL: bundledURL, cacheURL: cacheURL)
        XCTAssertEqual(imageFromCache?.tiffRepresentation, expectedArtwork)
        XCTAssertEqual(try Data(contentsOf: cacheURL), original)

        try files.removeItem(at: bundledURL)
        let imageAfterRestart = CompanionArtwork.loadSupportButton(bundledURL: nil, cacheURL: cacheURL)
        XCTAssertEqual(imageAfterRestart?.tiffRepresentation, expectedArtwork)

        try Data("unreadable image".utf8).write(to: cacheURL)
        XCTAssertNil(CompanionArtwork.loadSupportButton(bundledURL: nil, cacheURL: cacheURL))
    }
}
