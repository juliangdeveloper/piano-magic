// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "PianoMagic",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(
            name: "PianoMagic",
            targets: ["PianoMagic"]
        ),
    ],
    targets: [
        .target(
            name: "PianoMagicCore"
        ),
        .target(
            name: "PianoMagic",
            dependencies: ["PianoMagicCore"],
            resources: [
                .copy("web"),
            ]
        ),
        .testTarget(
            name: "PianoMagicCoreTests",
            dependencies: ["PianoMagicCore"]
        ),
    ]
)
