import XCTest

final class LyannSmokeUITests: XCTestCase {
    private let reportURL = URL(fileURLWithPath: "/tmp/lyann-ios-a11y.txt")

    override func setUpWithError() throws {
        continueAfterFailure = true
        try? "".write(to: reportURL, atomically: true, encoding: .utf8)
    }

    func testQaLoginSessionAndSurfaces() throws {
        let app = XCUIApplication()
        app.launch()

        let guestButton = app.buttons["Se connecter"].firstMatch
        let memberTab = app.buttons["Profil"].firstMatch
        let painted = guestButton.waitForExistence(timeout: 30) || memberTab.waitForExistence(timeout: 8)
        save(app, "40-launch")
        dump(app, "launch")
        XCTAssertTrue(painted, "L’écran reste vide après 30 s. webViews=\(app.webViews.count)")

        if guestButton.exists {
            note("guest-button \(state(guestButton))")
            XCTAssertTrue(guestButton.isHittable, "Se connecter est visible pour XCUITest mais non atteignable. \(state(guestButton))")
            guestButton.tap()
            let email = app.textFields["Adresse email de connexion"]
            let password = app.secureTextFields["Mot de passe de connexion"]
            let formReady = email.waitForExistence(timeout: 8) && password.waitForExistence(timeout: 4)
            save(app, "41-login-form")
            dump(app, "login-form")
            XCTAssertTrue(formReady, "Le formulaire natif n’est pas exposé. \(visibleLabels(app))")
            note("email \(state(email))")
            note("password \(state(password))")
            XCTAssertTrue(email.isHittable && password.isHittable, "Les champs sont exposés mais non atteignables.")
            let mail = ProcessInfo.processInfo.environment["LYANN_E2E_QA_A_EMAIL"] ?? ""
            let secret = ProcessInfo.processInfo.environment["LYANN_E2E_QA_A_PASSWORD"] ?? ""
            XCTAssertFalse(mail.isEmpty || secret.isEmpty, "Identifiants QA absents")
            email.tap()
            email.typeText(mail)
            password.tap()
            password.typeText(secret)
            let submit = app.buttons["Valider la connexion"]
            XCTAssertTrue(submit.waitForExistence(timeout: 4), "Le bouton de validation n’a pas d’identifiant stable.")
            note("submit \(state(submit))")
            XCTAssertTrue(submit.isHittable, "Valider la connexion n’est pas atteignable.")
            submit.tap()
            note("login-submitted")
        } else {
            note("session-already-present")
        }

        let signedIn = app.buttons["Profil"].waitForExistence(timeout: 30)
        save(app, "42-after-login")
        dump(app, "after-login")
        XCTAssertTrue(signedIn, "La barre membre n’apparaît pas. \(visibleLabels(app))")

        openAccount(app, shot: "43-account")
        let emailShown = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "@lyann.invalid")).firstMatch
        let named = app.staticTexts["Qa A."].exists
        note(emailShown.exists ? "account-email-visible" : "account-email-missing")
        note(named ? "identity-qa-a" : "identity-missing")
        XCTAssertTrue(emailShown.exists && named, "Le compte ouvert n’est pas QA A. \(visibleLabels(app))")
        if app.buttons["Fermer"].exists { app.buttons["Fermer"].firstMatch.tap() }

        app.terminate()
        app.launch()
        let persisted = app.buttons["Profil"].waitForExistence(timeout: 25)
        save(app, "44-relaunch")
        if persisted { openAccount(app, shot: "44b-relaunch-account") }
        let stillQa = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "@lyann.invalid")).firstMatch.exists
        note(stillQa ? "session-persisted" : "session-lost")
        XCTAssertTrue(persisted && stillQa, "La session QA A ne survit pas à la fermeture.")

        visit(app, "Annonces", "45-annonces", ready: "annonces")
        visit(app, "Bokantaj", "46-bokantaj", ready: "Bokantaj")
        visit(app, "Lyanneurs", "47-lyanneurs", ready: "Lyanneurs")

        if tapIfHittable(app.buttons["Messages"].firstMatch, name: "Messages") {
            let loaded = waitUntil(app, seconds: 16) {
                app.staticTexts["Impossible de charger les conversations."].exists
                    || app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Réessayer")).firstMatch.exists
                    || app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Qa L")).firstMatch.exists
            }
            save(app, "48-messages")
            let retry = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Réessayer")).firstMatch
            if retry.exists { note("messages-error \(retry.label)") }
            else { note(loaded ? "messages-open" : "messages-still-loading") }
            if app.buttons["Fermer"].exists { app.buttons["Fermer"].firstMatch.tap() }
        }

        if tapIfHittable(app.buttons["Notifications"].firstMatch, name: "Notifications") {
            sleep(2)
            save(app, "49-notifications")
            note(app.staticTexts["Notifications"].exists ? "notifications-open" : "notifications-not-open")
            if app.buttons["Fermer"].exists { app.buttons["Fermer"].firstMatch.tap() }
        }

        if tapIfHittable(app.buttons["Menu Principal"].firstMatch, name: "Menu") {
            sleep(1)
            save(app, "50-menu")
            dump(app, "menu")
            if tapIfHittable(app.links["Ouvrir Mon activité"].firstMatch, name: "Mon activité")
                || tapIfHittable(app.staticTexts["Mon activité"].firstMatch, name: "Mon activité texte") {
                sleep(2)
                save(app, "51-activity")
                note(app.staticTexts["Mes missions"].exists || app.navigationBars["Mon activité"].exists ? "activity-open" : "activity-not-open")
                if app.buttons["Fermer"].exists { app.buttons["Fermer"].firstMatch.tap() }
            }
        }

        if !app.links["Ouvrir Finances"].exists {
            _ = tapIfHittable(app.buttons["Menu Principal"].firstMatch, name: "Menu finances")
            sleep(1)
        }
        if tapIfHittable(app.links["Ouvrir Finances"].firstMatch, name: "Finances") {
            sleep(2)
            save(app, "52-finances")
            note(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "À recevoir")).firstMatch.exists ? "finances-open" : "finances-not-open")
        } else {
            note("finances-not-hittable")
            save(app, "52-finances")
        }

        XCUIDevice.shared.press(.home)
        sleep(1)
        app.activate()
        let resumed = app.buttons["Profil"].waitForExistence(timeout: 12)
        save(app, "53-resumed")
        note(resumed ? "resumed" : "resume-failed")
    }

    func testInboxActivityAndFinanceLedger() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Profil"].waitForExistence(timeout: 25), "Session absente")
        if app.buttons["Retour"].waitForExistence(timeout: 2), app.buttons["Retour"].firstMatch.isHittable {
            app.buttons["Retour"].firstMatch.tap()
        }

        if tapIfHittable(app.buttons["Messages"].firstMatch, name: "Messages") {
            _ = waitUntil(app, seconds: 18) {
                app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Réessayer")).firstMatch.exists
                    || app.staticTexts["Impossible de charger les conversations."].exists
                    || app.cells.firstMatch.exists
            }
            save(app, "60-messages")
            let retry = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Réessayer")).firstMatch
            if retry.exists { note("messages-error \(retry.label)") }
            else if app.staticTexts["Impossible de charger les conversations."].exists { note("messages-error-without-detail") }
            else { note("messages-list-visible") }
            if app.buttons["Fermer"].exists, app.buttons["Fermer"].firstMatch.isHittable {
                app.buttons["Fermer"].firstMatch.tap()
            }
        }

        if tapIfHittable(app.buttons["Menu Principal"].firstMatch, name: "Menu") {
            sleep(1)
            if tapIfHittable(app.links["Ouvrir Mon activité"].firstMatch, name: "Activité") {
                sleep(3)
                save(app, "61-activity")
                let missions = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "CAMPAGNE")).firstMatch.exists
                    || app.staticTexts["Mes missions"].exists
                note(missions ? "activity-content" : "activity-empty")
                if app.buttons["Fermer"].firstMatch.exists, app.buttons["Fermer"].firstMatch.isHittable {
                    app.buttons["Fermer"].firstMatch.tap()
                } else if app.buttons["Retour"].firstMatch.exists, app.buttons["Retour"].firstMatch.isHittable {
                    app.buttons["Retour"].firstMatch.tap()
                }
            }
        }

        if tapIfHittable(app.buttons["Menu Principal"].firstMatch, name: "Menu") {
            sleep(1)
            if tapIfHittable(app.links["Ouvrir Finances"].firstMatch, name: "Finances") {
                _ = waitUntil(app, seconds: 16) {
                    !app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Chargement de vos mouvements")).firstMatch.exists
                }
                save(app, "62-finances")
                note(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Dépenses sécurisées")).firstMatch.exists ? "finances-ledger" : "finances-ledger-missing")
            }
        }

        if tapIfHittable(app.buttons["Notifications"].firstMatch, name: "Notifications") {
            sleep(2)
            save(app, "63-notifications")
            note(app.staticTexts["Notifications"].exists ? "notifications-open" : "notifications-not-open")
        }
    }

    private func openAccount(_ app: XCUIApplication, shot: String) {
        guard tapIfHittable(app.buttons["Menu Principal"].firstMatch, name: "Menu compte") else { return }
        sleep(1)
        if tapIfHittable(app.links["Ouvrir Mon compte"].firstMatch, name: "Mon compte")
            || tapIfHittable(app.staticTexts["Mon compte"].firstMatch, name: "Mon compte texte") {
            sleep(2)
        }
        save(app, shot)
    }

    private func visit(_ app: XCUIApplication, _ label: String, _ shot: String, ready: String) {
        guard tapIfHittable(app.buttons[label].firstMatch, name: label) else {
            note("missing-\(label)")
            return
        }
        _ = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", ready)).firstMatch.waitForExistence(timeout: 12)
        let loading = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Chargement")).firstMatch
        let deadline = Date().addingTimeInterval(16)
        while Date() < deadline && loading.exists {
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        }
        save(app, shot)
        note(loading.exists ? "\(label)-still-loading" : "\(label)-shown")
    }

    @discardableResult
    private func tapIfHittable(_ element: XCUIElement, name: String) -> Bool {
        guard element.waitForExistence(timeout: 5) else {
            note("absent \(name)")
            return false
        }
        note("\(name) \(state(element))")
        guard element.isHittable else {
            note("not-hittable \(name)")
            return false
        }
        element.tap()
        return true
    }

    private func waitUntil(_ app: XCUIApplication, seconds: TimeInterval, _ condition: () -> Bool) -> Bool {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if condition() { return true }
            RunLoop.current.run(until: Date().addingTimeInterval(0.4))
        }
        return condition()
    }

    private func state(_ element: XCUIElement) -> String {
        guard element.exists else { return "exists=false" }
        return "exists=true hittable=\(element.isHittable) frame=\(element.frame)"
    }

    private func dump(_ app: XCUIApplication, _ moment: String) {
        note("--- \(moment) webViews=\(app.webViews.count) ---")
        for element in app.buttons.allElementsBoundByIndex.prefix(25) where element.exists {
            note("button \(state(element)) \(element.label)")
        }
        for element in app.textFields.allElementsBoundByIndex.prefix(8) where element.exists {
            note("text \(state(element)) \(element.label)")
        }
        for element in app.secureTextFields.allElementsBoundByIndex.prefix(4) where element.exists {
            note("secure \(state(element)) \(element.label)")
        }
    }

    private func visibleLabels(_ app: XCUIApplication) -> String {
        app.staticTexts.allElementsBoundByIndex.prefix(10).map(\.label).joined(separator: " | ")
    }

    private func note(_ line: String) {
        guard let data = (line + "\n").data(using: .utf8) else { return }
        if FileManager.default.fileExists(atPath: reportURL.path),
           let handle = try? FileHandle(forWritingTo: reportURL) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            try? data.write(to: reportURL)
        }
    }

    private func save(_ app: XCUIApplication, _ name: String) {
        let shot = XCUIScreen.main.screenshot()
        try? shot.pngRepresentation.write(to: URL(fileURLWithPath: "/tmp/lyann-ios-ui-\(name).png"))
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
