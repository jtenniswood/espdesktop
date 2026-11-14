import XCTest
@testable import Companion

final class CompanionStoreBehaviorTests: XCTestCase {
    func testRemoteCatalogueDefinitionsRequireCapabilityVersionThree() {
        XCTAssertFalse(CompanionConnection.supportsRemoteCatalogueDefinitions(capabilityVersion: 2))
        XCTAssertTrue(CompanionConnection.supportsRemoteCatalogueDefinitions(capabilityVersion: 5))
        XCTAssertTrue(CompanionConnection.supportsRemoteCatalogueDefinitions(
            capabilityVersion: UInt32(CompanionCapabilities.version)
        ))
    }

    func testSystemControlsDoNotReportApplicationActivation() {
        for identifier in CompanionCapabilities.systemActions.keys {
            XCTAssertEqual(CompanionStore.actionResultStatus(actionIdentifier: identifier, performed: true), "performed")
            XCTAssertEqual(CompanionStore.actionResultStatus(actionIdentifier: identifier, performed: false), "not_allowed")
        }
    }
}
