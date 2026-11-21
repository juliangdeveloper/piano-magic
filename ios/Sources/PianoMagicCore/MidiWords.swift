public struct MidiNote: Equatable, Sendable {
    public let status: UInt8
    public let data1: UInt8
    public let data2: UInt8

    public init(status: UInt8, data1: UInt8, data2: UInt8) {
        self.status = status
        self.data1 = data1
        self.data2 = data2
    }
}

public enum MidiWords {
    static let messageTypeShift: UInt32 = 28
    static let statusShift: UInt32 = 16
    static let data1Shift: UInt32 = 8
    static let byteMask: UInt32 = 0xFF
    static let dataMask: UInt32 = 0x7F
    static let commandMask: UInt8 = 0xF0
    static let noteOff: UInt8 = 0x80
    static let noteOn: UInt8 = 0x90
    static let midi1ChannelVoice: UInt8 = 0x2
    static let wordsPerType: [Int] = [1, 1, 1, 2, 2, 4, 1, 1, 2, 2, 2, 3, 3, 4, 4, 4]

    public static func notes(in words: [UInt32]) -> [MidiNote] {
        var found: [MidiNote] = []
        var index = 0
        while index < words.count {
            let word = words[index]
            let type = UInt8(word >> messageTypeShift)
            if type == midi1ChannelVoice, let note = note(from: word) {
                found.append(note)
            }
            index += wordsPerType[Int(type)]
        }
        return found
    }

    static func note(from word: UInt32) -> MidiNote? {
        let status = UInt8((word >> statusShift) & byteMask)
        let command = status & commandMask
        guard command == noteOn || command == noteOff else { return nil }
        return MidiNote(
            status: status,
            data1: UInt8((word >> data1Shift) & dataMask),
            data2: UInt8(word & dataMask)
        )
    }
}
