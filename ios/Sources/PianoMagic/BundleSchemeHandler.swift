#if canImport(UIKit)
import Foundation
import PianoMagicCore
import WebKit

@MainActor
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    private static let okStatus = 200
    private static let notFoundStatus = 404
    private static let httpVersion = "HTTP/1.1"

    private let root: URL? = Bundle.module.url(forResource: WebFiles.directory, withExtension: nil)

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return }
        guard
            let root,
            let file = WebFiles.file(for: url, in: root),
            let data = try? Data(contentsOf: file)
        else {
            respond(task, url: url, status: Self.notFoundStatus, type: "text/plain", data: Data())
            return
        }
        respond(task, url: url, status: Self.okStatus, type: WebFiles.mimeType(for: file), data: data)
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func respond(_ task: WKURLSchemeTask, url: URL, status: Int, type: String, data: Data) {
        let headers = [
            "Content-Type": type,
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
        ]
        guard let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: Self.httpVersion, headerFields: headers) else {
            task.didFailWithError(URLError(.badServerResponse))
            return
        }
        task.didReceive(response)
        task.didReceive(data)
        task.didFinish()
    }
}
#endif
