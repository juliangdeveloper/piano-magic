public enum BridgeScript {
    public static let handlerName = "nativeMidi"
    public static let actionKey = "action"
    public static let startAction = "start"
    static let globalName = "window.__nativeMidi"

    public static func emit(_ note: MidiNote, timestamp: Double) -> String {
        let payload = "{\"status\":\(note.status),\"data1\":\(note.data1),\"data2\":\(note.data2),\"timestamp\":\(timestamp)}"
        return call("emit", payload)
    }

    public static func devices(_ count: Int) -> String {
        call("devices", String(count))
    }

    public static func blocked() -> String {
        call("blocked", "")
    }

    static func call(_ method: String, _ argument: String) -> String {
        "\(globalName)&&\(globalName).\(method)(\(argument))"
    }
}
