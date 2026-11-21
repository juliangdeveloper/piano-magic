#if canImport(UIKit)
import SwiftUI

@main
struct PianoMagicApp: App {
    var body: some Scene {
        WindowGroup {
            WebContainer()
                .ignoresSafeArea()
                .statusBarHidden()
        }
    }
}
#endif
