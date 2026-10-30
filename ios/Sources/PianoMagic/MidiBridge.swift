#if canImport(UIKit)
import CoreMIDI
import Foundation
import PianoMagicCore
import WebKit

@MainActor
final class MidiBridge: NSObject, WKScriptMessageHandler {
    private static let clientName = "PianoMagic" as CFString
    private static let portName = "PianoMagicInput" as CFString
    private nonisolated static let scriptSeparator = ";"

    weak var webView: WKWebView?

    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var connected = Set<MIDIEndpointRef>()
    private var started = false

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard
            let body = message.body as? [String: Any],
            body[BridgeScript.actionKey] as? String == BridgeScript.startAction
        else { return }
        start()
    }

    func stop() {
        if inputPort != 0 {
            MIDIPortDispose(inputPort)
            inputPort = 0
        }
        if client != 0 {
            MIDIClientDispose(client)
            client = 0
        }
        connected.removeAll()
        started = false
    }

    private func start() {
        if !started {
            guard setup() == noErr else {
                stop()
                run(BridgeScript.blocked())
                return
            }
            started = true
        }
        run(BridgeScript.devices(connectSources()))
    }

    private func setup() -> OSStatus {
        let notify = Self.notifier { [weak self] in
            Task { @MainActor in self?.refresh() }
        }
        let clientStatus = MIDIClientCreateWithBlock(Self.clientName, &client, notify)
        guard clientStatus == noErr else { return clientStatus }
        let receive = Self.receiver { [weak self] script in
            Task { @MainActor in self?.run(script) }
        }
        return MIDIInputPortCreateWithProtocol(client, Self.portName, ._1_0, &inputPort, receive)
    }

    private func refresh() {
        guard started else { return }
        run(BridgeScript.devices(connectSources()))
    }

    private func connectSources() -> Int {
        var present = Set<MIDIEndpointRef>()
        for index in 0..<MIDIGetNumberOfSources() {
            let source = MIDIGetSource(index)
            guard source != 0 else { continue }
            present.insert(source)
            if !connected.contains(source) && MIDIPortConnectSource(inputPort, source, nil) == noErr {
                connected.insert(source)
            }
        }
        for gone in connected.subtracting(present) {
            MIDIPortDisconnectSource(inputPort, gone)
        }
        connected.formIntersection(present)
        return connected.count
    }

    private func run(_ script: String) {
        webView?.evaluateJavaScript(script, completionHandler: nil)
    }

    private nonisolated static func notifier(_ changed: @escaping @Sendable () -> Void) -> MIDINotifyBlock {
        { notification in
            let id = notification.pointee.messageID
            guard id == .msgSetupChanged || id == .msgObjectAdded || id == .msgObjectRemoved else { return }
            changed()
        }
    }

    private nonisolated static func receiver(_ forward: @escaping @Sendable (String) -> Void) -> MIDIReceiveBlock {
        { list, _ in
            var scripts: [String] = []
            for packet in list.unsafeSequence() {
                let count = Int(packet.pointee.wordCount)
                let stamp = MidiClock.milliseconds(packet.pointee.timeStamp)
                let words: [UInt32] = withUnsafeBytes(of: packet.pointee.words) { raw in
                    Array(raw.bindMemory(to: UInt32.self).prefix(count))
                }
                for note in MidiWords.notes(in: words) {
                    scripts.append(BridgeScript.emit(note, timestamp: stamp))
                }
            }
            guard !scripts.isEmpty else { return }
            forward(scripts.joined(separator: scriptSeparator))
        }
    }
}

enum MidiClock {
    private static let nanosPerMilli = 1_000_000.0
    private static let millisPerTick: Double = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return Double(info.numer) / Double(info.denom) / nanosPerMilli
    }()

    static func milliseconds(_ stamp: MIDITimeStamp) -> Double {
        let ticks = stamp == 0 ? mach_absolute_time() : stamp
        return Double(ticks) * millisPerTick
    }
}
#endif
