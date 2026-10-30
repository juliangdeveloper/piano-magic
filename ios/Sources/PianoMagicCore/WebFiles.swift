import Foundation

public enum WebFiles {
    public static let scheme = "app"
    public static let host = "localhost"
    public static let directory = "web"
    static let entry = "index.html"
    static let fallbackType = "application/octet-stream"
    static let types: [String: String] = [
        "html": "text/html; charset=utf-8",
        "js": "text/javascript; charset=utf-8",
        "mjs": "text/javascript; charset=utf-8",
        "css": "text/css; charset=utf-8",
        "json": "application/json; charset=utf-8",
        "txt": "text/plain; charset=utf-8",
        "svg": "image/svg+xml",
        "png": "image/png",
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "webp": "image/webp",
        "gif": "image/gif",
        "wav": "audio/wav",
        "mp3": "audio/mpeg",
        "m4a": "audio/mp4",
        "ogg": "audio/ogg",
        "woff2": "font/woff2",
        "wasm": "application/wasm",
    ]

    public static var entryURL: URL {
        var parts = URLComponents()
        parts.scheme = scheme
        parts.host = host
        parts.path = "/" + entry
        return parts.url!
    }

    public static func mimeType(for file: URL) -> String {
        if file.lastPathComponent == "VERSION" { return types["txt"]! }
        return types[file.pathExtension.lowercased()] ?? fallbackType
    }

    public static func file(for url: URL, in root: URL) -> URL? {
        guard url.scheme == scheme, url.host == host else { return nil }
        let relative = url.path.split(separator: "/").map(String.init)
        let parts = relative.isEmpty ? [entry] : relative
        guard !parts.contains(where: { $0 == ".." || $0 == "." }) else { return nil }
        let base = root.standardizedFileURL
        let target = parts.reduce(base) { $0.appendingPathComponent($1) }.standardizedFileURL
        guard target.path.hasPrefix(base.path + "/") else { return nil }
        return target
    }
}
