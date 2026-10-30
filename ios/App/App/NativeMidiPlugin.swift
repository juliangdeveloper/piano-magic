import Foundation
import Capacitor
import CoreMIDI

@objc(NativeMidiPlugin)
public class NativeMidiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeMidiPlugin"
    public let jsName = "NativeMidi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise)
    ]

    private static let clientName = "PianoMagic" as CFString
    private static let portName = "PianoMagicInput" as CFString
    private static let messageEvent = "midi"
    private static let devicesEvent = "devices"
    private static let messageTypeShift: UInt32 = 28
    private static let statusShift: UInt32 = 16
    private static let data1Shift: UInt32 = 8
    private static let byteMask: UInt32 = 0xFF
    private static let dataMask: UInt32 = 0x7F
    private static let commandMask: UInt8 = 0xF0
    private static let noteOff: UInt8 = 0x80
    private static let noteOn: UInt8 = 0x90
    private static let midi1ChannelVoice: UInt8 = 0x2
    private static let nanosPerMilli = 1_000_000.0
    private static let wordsPerType: [Int] = [1, 1, 1, 2, 2, 4, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4]
    private static let timebase: mach_timebase_info_data_t = {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        return info
    }()

    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var connected = Set<MIDIEndpointRef>()
    private var started = false

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if !self.started {
                let status = self.setup()
                if status != noErr {
                    self.teardown()
                    call.reject("CoreMIDI \(status)")
                    return
                }
                self.started = true
            }
            call.resolve(["count": self.connectSources()])
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.teardown()
            call.resolve()
        }
    }

    private func setup() -> OSStatus {
        let clientStatus = MIDIClientCreateWithBlock(Self.clientName, &client) { [weak self] notification in
            let id = notification.pointee.messageID
            guard id == .msgSetupChanged || id == .msgObjectAdded || id == .msgObjectRemoved else { return }
            DispatchQueue.main.async {
                self?.refresh()
            }
        }
        guard clientStatus == noErr else { return clientStatus }
        return MIDIInputPortCreateWithProtocol(client, Self.portName, ._1_0, &inputPort) { [weak self] list, _ in
            self?.handle(list)
        }
    }

    private func teardown() {
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

    private func refresh() {
        guard started else { return }
        notifyListeners(Self.devicesEvent, data: ["count": connectSources()])
    }

    private func connectSources() -> Int {
        var present = Set<MIDIEndpointRef>()
        let total = MIDIGetNumberOfSources()
        for index in 0..<total {
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

    private func handle(_ list: UnsafePointer<MIDIEventList>) {
        for packet in list.unsafeSequence() {
            let count = Int(packet.pointee.wordCount)
            let stamp = Self.milliseconds(packet.pointee.timeStamp)
            let words: [UInt32] = withUnsafeBytes(of: packet.pointee.words) { raw in
                Array(raw.bindMemory(to: UInt32.self).prefix(count))
            }
            var index = 0
            while index < words.count {
                let word = words[index]
                let type = UInt8(word >> Self.messageTypeShift)
                if type == Self.midi1ChannelVoice {
                    emit(word, stamp)
                }
                index += Self.wordsPerType[Int(type)]
            }
        }
    }

    private func emit(_ word: UInt32, _ stamp: Double) {
        let status = UInt8((word >> Self.statusShift) & Self.byteMask)
        let command = status & Self.commandMask
        guard command == Self.noteOn || command == Self.noteOff else { return }
        notifyListeners(Self.messageEvent, data: [
            "status": Int(status),
            "data1": Int((word >> Self.data1Shift) & Self.dataMask),
            "data2": Int(word & Self.dataMask),
            "timestamp": stamp
        ])
    }

    private static func milliseconds(_ stamp: MIDITimeStamp) -> Double {
        let ticks = stamp == 0 ? mach_absolute_time() : stamp
        return Double(ticks) * Double(timebase.numer) / Double(timebase.denom) / nanosPerMilli
    }
}
