import AuthenticationServices
import Capacitor
import CryptoKit
import UIKit

@objc(LyannAppleSignIn)
public class LyannAppleSignIn: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "LyannAppleSignIn"
    public let jsName = "LyannAppleSignIn"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private var rawNonce: String?
    private var authController: ASAuthorizationController?

    @objc func authorize(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.pendingCall = call
            let nonce = LyannAppleSignIn.randomNonce()
            self.rawNonce = nonce
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            request.nonce = LyannAppleSignIn.sha256(nonce)
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            self.authController = controller
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        if let window = bridge?.viewController?.view.window {
            return window
        }
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        return scene?.windows.first(where: { $0.isKeyWindow }) ?? UIWindow()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8),
              let nonce = rawNonce else {
            pendingCall?.reject("Connexion Apple impossible")
            clearPending()
            return
        }
        var payload: [String: Any] = [
            "identityToken": token,
            "nonce": nonce
        ]
        if let given = credential.fullName?.givenName, !given.isEmpty {
            payload["givenName"] = given
        }
        if let family = credential.fullName?.familyName, !family.isEmpty {
            payload["familyName"] = family
        }
        pendingCall?.resolve(payload)
        clearPending()
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        let nsError = error as NSError
        if nsError.domain == ASAuthorizationError.errorDomain && nsError.code == ASAuthorizationError.canceled.rawValue {
            pendingCall?.resolve(["canceled": true])
        } else {
            pendingCall?.reject("Connexion Apple impossible")
        }
        clearPending()
    }

    private func clearPending() {
        pendingCall = nil
        rawNonce = nil
        authController = nil
    }

    private static func randomNonce(length: Int = 32) -> String {
        var bytes = [UInt8](repeating: 0, count: length)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        if status != errSecSuccess {
            return UUID().uuidString.replacingOccurrences(of: "-", with: "")
        }
        return Data(bytes).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    private static func sha256(_ input: String) -> String {
        let digest = SHA256.hash(data: Data(input.utf8))
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

class LyannBridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(LyannAppleSignIn())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        let cream = UIColor(red: 250.0 / 255.0, green: 247.0 / 255.0, blue: 242.0 / 255.0, alpha: 1)
        window?.backgroundColor = cream
        let bridge = LyannBridgeViewController()
        bridge.view.backgroundColor = cream
        window?.rootViewController = bridge
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
