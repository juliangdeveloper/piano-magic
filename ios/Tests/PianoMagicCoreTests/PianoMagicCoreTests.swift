import Foundation
import XCTest
@testable import PianoMagicCore

final class PianoMagicCoreTests: XCTestCase {
    func testNoteOnAndOffFromMidi1Words() {
        let words: [UInt32] = [0x2090_3C64, 0x2080_3C00, 0x20B0_4040, 0x2093_3E00]
        XCTAssertEqual(MidiWords.notes(in: words), [
            MidiNote(status: 0x90, data1: 60, data2: 100),
            MidiNote(status: 0x80, data1: 60, data2: 0),
            MidiNote(status: 0x93, data1: 62, data2: 0),
        ])
    }

    func testSkipsMultiWordMessages() {
        let words: [UInt32] = [0x4090_3C00, 0xFFFF_0000, 0x3001_0203, 0x0405_0607, 0x2090_4050]
        XCTAssertEqual(MidiWords.notes(in: words), [MidiNote(status: 0x90, data1: 64, data2: 80)])
    }

    func testBridgeScripts() {
        let note = MidiNote(status: 0x90, data1: 60, data2: 90)
        XCTAssertEqual(
            BridgeScript.emit(note, timestamp: 12.5),
            "window.__nativeMidi&&window.__nativeMidi.emit({\"status\":144,\"data1\":60,\"data2\":90,\"timestamp\":12.5})"
        )
        XCTAssertEqual(BridgeScript.devices(2), "window.__nativeMidi&&window.__nativeMidi.devices(2)")
        XCTAssertEqual(BridgeScript.blocked(), "window.__nativeMidi&&window.__nativeMidi.blocked()")
    }

    func testFileResolution() {
        let root = URL(fileURLWithPath: "/bundle/web")
        XCTAssertEqual(WebFiles.entryURL.absoluteString, "app://localhost/index.html")
        XCTAssertEqual(WebFiles.file(for: URL(string: "app://localhost/")!, in: root)?.path, "/bundle/web/index.html")
        XCTAssertEqual(
            WebFiles.file(for: URL(string: "app://localhost/charts/a.json?v=0.2.2")!, in: root)?.path,
            "/bundle/web/charts/a.json"
        )
        XCTAssertNil(WebFiles.file(for: URL(string: "app://localhost/../secret")!, in: root))
        XCTAssertNil(WebFiles.file(for: URL(string: "app://localhost/a/%2E%2E/%2E%2E/x")!, in: root))
        XCTAssertNil(WebFiles.file(for: URL(string: "https://localhost/index.html")!, in: root))
        XCTAssertNil(WebFiles.file(for: URL(string: "app://other/index.html")!, in: root))
    }

    func testMimeTypes() {
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/js/app.js")), "text/javascript; charset=utf-8")
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/charts/a.JSON")), "application/json; charset=utf-8")
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/VERSION")), "text/plain; charset=utf-8")
        XCTAssertEqual(WebFiles.mimeType(for: URL(fileURLWithPath: "/w/blob.bin")), "application/octet-stream")
    }
}
