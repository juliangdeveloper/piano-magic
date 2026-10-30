#if canImport(UIKit)
import Foundation
import PianoMagicCore
import SwiftUI
import WebKit

struct WebContainer: UIViewRepresentable {
    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.setURLSchemeHandler(context.coordinator.files, forURLScheme: WebFiles.scheme)
        configuration.userContentController.add(context.coordinator.midi, name: BridgeScript.handlerName)

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.uiDelegate = context.coordinator
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.midi.webView = webView
        webView.load(URLRequest(url: WebFiles.entryURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: BridgeScript.handlerName)
        coordinator.midi.stop()
    }

    @MainActor
    final class Coordinator: NSObject, WKUIDelegate {
        let files = BundleSchemeHandler()
        let midi = MidiBridge()

        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void
        ) {
            decisionHandler(origin.protocol == WebFiles.scheme ? .grant : .prompt)
        }
    }
}
#endif
