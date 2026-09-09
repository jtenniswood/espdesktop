// swift-tools-version: 6.0
import Foundation
import PackageDescription

let package = Package(
    name: "EspDesktop",
    platforms: [.macOS(.v13)],
    products: [.executable(name: "EspDesktop", targets: ["Companion"])],
    dependencies: [.package(url: "https://github.com/sparkle-project/Sparkle", exact: "2.9.6")],
    targets: [
        .target(
            name: "MediaRemoteShim",
            path: "Sources/MediaRemoteShim",
            publicHeadersPath: "include",
            linkerSettings: [.linkedFramework("Foundation")]
        ),
        .executableTarget(
            name: "Companion",
            dependencies: ["MediaRemoteShim", .product(name: "Sparkle", package: "Sparkle")],
            path: "Sources/Companion",
            resources: [.process("Resources")],
            linkerSettings: [
                .unsafeFlags(["-Xlinker", "-rpath", "-Xlinker", "@executable_path/../Frameworks"]),
                .linkedFramework("IOKit"),
                .linkedFramework("SystemConfiguration"),
            ]
        ),
        .testTarget(
            name: "CompanionTests",
            dependencies: ["Companion"],
            path: "Tests/CompanionTests"
        ),
    ]
)
