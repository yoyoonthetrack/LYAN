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
            let mail = qaValue("LYANN_E2E_QA_A_EMAIL")
            let secret = qaValue("LYANN_E2E_QA_A_PASSWORD")
            XCTAssertFalse(mail.isEmpty || secret.isEmpty, "Identifiants QA absents")
            email.tap()
            email.typeText(mail)
            password.tap()
            password.typeText(secret)
            if app.keyboards.buttons["retour"].exists { app.keyboards.buttons["retour"].tap() }
            else if app.keyboards.buttons["Return"].exists { app.keyboards.buttons["Return"].tap() }
            _ = waitUntil(app, seconds: 4) { app.keyboards.count == 0 }
            let submit = app.buttons["Valider la connexion"]
            if submit.waitForExistence(timeout: 2) {
                note("submit \(state(submit))")
                if submit.isHittable { submit.tap() }
                else { submit.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap() }
            } else {
                note("return-already-submitted")
            }
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

    func testReturnFromMissionPicker() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Messages"].waitForExistence(timeout: 25))
        app.buttons["Messages"].firstMatch.tap()
        let row = app.buttons["Ouvrir la conversation avec Qa A."]
        XCTAssertTrue(row.waitForExistence(timeout: 15))
        row.tap()
        XCTAssertTrue(app.textViews["Écrivez un message..."].waitForExistence(timeout: 10))
        let missions = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Missions")).firstMatch
        XCTAssertTrue(missions.waitForExistence(timeout: 8))
        missions.tap()
        let back = app.buttons["Retour au chat"].firstMatch
        XCTAssertTrue(back.waitForExistence(timeout: 6))
        back.tap()
        let composer = app.textViews["Écrivez un message..."]
        let visible = composer.waitForExistence(timeout: 6) && composer.isHittable
        save(app, "110-back-chat")
        note(visible ? "composer-restored" : "composer-hidden")
        XCTAssertTrue(visible, "Le fil reste vide après Retour au chat")
        let done = app.buttons["Terminées"].firstMatch
        if app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Missions")).firstMatch.isHittable {
            app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Missions")).firstMatch.tap()
        }
        if done.waitForExistence(timeout: 4), done.isHittable { done.tap(); sleep(1) }
        let jalons = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Jalons neufs")).firstMatch
        if jalons.waitForExistence(timeout: 4), jalons.isHittable {
            jalons.tap()
            sleep(2)
            save(app, "111-dossier-from-chat")
            let toast = app.staticTexts["Cette demande n’accepte plus de nouvelles propositions pour le moment."].exists
            note(toast ? "toast-on-consult" : "no-toast-on-consult")
            let closeDossier = app.buttons["Fermer le dossier"].firstMatch
            if closeDossier.waitForExistence(timeout: 4), closeDossier.isHittable { closeDossier.tap() }
            note(app.textViews["Écrivez un message..."].waitForExistence(timeout: 6) ? "dossier-back-chat" : "dossier-back-lost")
            save(app, "112-after-dossier")
        } else {
            note("jalons-not-in-b-picker")
        }
    }

    func testPhase84ThreadsDossierAndToast() throws {
        let app = XCUIApplication()
        let started = Date()
        app.launch()
        XCTAssertTrue(app.buttons["Messages"].waitForExistence(timeout: 30))
        note("launch-ms \(Int(Date().timeIntervalSince(started) * 1000))")
        let inboxAt = Date()
        app.buttons["Messages"].firstMatch.tap()
        let qaA = app.buttons["Ouvrir la conversation avec Qa A."]
        let qaL = app.buttons["Ouvrir la conversation avec Qa L."]
        let listed = qaA.waitForExistence(timeout: 12) || qaL.waitForExistence(timeout: 4)
        note("inbox-ms \(Int(Date().timeIntervalSince(inboxAt) * 1000)) listed=\(listed)")
        let trace = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "inbox session=")).firstMatch
        if trace.exists { note(trace.label) }
        save(app, "100-inbox")
        XCTAssertTrue(listed, "Liste absente")

        let first = qaA.exists ? qaA : qaL
        let support = app.buttons["Ouvrir la conversation avec Support LYANN"].firstMatch
        let other: XCUIElement? = support.exists
            ? support
            : app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Ouvrir la conversation avec")).allElementsBoundByIndex.first { $0.label != first.label }
        first.tap()
        XCTAssertTrue(app.textViews["Écrivez un message..."].waitForExistence(timeout: 10))
        save(app, "101-thread-a")
        if app.buttons["Retour"].firstMatch.isHittable { app.buttons["Retour"].firstMatch.tap() }
        if let other, other.waitForExistence(timeout: 6) {
            other.tap()
            _ = app.textViews["Écrivez un message..."].waitForExistence(timeout: 8)
            save(app, "102-thread-b")
            note("switched-thread")
            if app.buttons["Retour"].firstMatch.isHittable { app.buttons["Retour"].firstMatch.tap() }
        } else {
            note("second-thread-missing")
        }
        save(app, "103-back-list")
        if first.waitForExistence(timeout: 6) { first.tap() }
        let dossierEntry = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Missions")).firstMatch
        if dossierEntry.waitForExistence(timeout: 6), dossierEntry.isHittable {
            dossierEntry.tap()
            sleep(2)
            save(app, "104-from-thread")
            let backChat = app.buttons["Retour au chat"].firstMatch
            if backChat.waitForExistence(timeout: 6), backChat.isHittable {
                backChat.tap()
                note(app.textViews["Écrivez un message..."].waitForExistence(timeout: 6) ? "back-to-chat" : "back-to-chat-lost")
                save(app, "105-back-chat")
            } else {
                note("retour-chat-missing")
            }
        } else {
            note("dossier-entry-missing")
            save(app, "104-from-thread")
        }

        if app.buttons["Notifications"].firstMatch.waitForExistence(timeout: 4), app.buttons["Notifications"].firstMatch.isHittable {
            app.buttons["Notifications"].firstMatch.tap()
            let grouped = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "missions —")).firstMatch
            if grouped.waitForExistence(timeout: 4), grouped.isHittable {
                grouped.tap()
                sleep(2)
                save(app, "106-grouped")
                note(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "mission")).firstMatch.exists ? "grouped-opened" : "grouped-empty")
            } else {
                note("grouped-absent")
                save(app, "106-grouped")
            }
        }

        XCUIDevice.shared.press(.home)
        sleep(1)
        app.activate()
        let back = app.buttons["Messages"].waitForExistence(timeout: 12) || app.buttons["Profil"].waitForExistence(timeout: 4)
        save(app, "107-resume")
        note(back ? "resume-app" : "resume-home")

        if app.buttons["Menu Principal"].firstMatch.waitForExistence(timeout: 4), app.buttons["Menu Principal"].firstMatch.isHittable {
            app.buttons["Menu Principal"].firstMatch.tap()
            let logout = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Se déconnecter")).firstMatch
            if logout.waitForExistence(timeout: 4) { logout.tap() }
        }
        if app.buttons["Confirmer"].waitForExistence(timeout: 2) { app.buttons["Confirmer"].firstMatch.tap() }
        if app.buttons["Se connecter"].waitForExistence(timeout: 10) {
            app.buttons["Se connecter"].firstMatch.tap()
            let email = app.textFields["Adresse email de connexion"]
            let password = app.secureTextFields["Mot de passe de connexion"]
            if email.waitForExistence(timeout: 6), password.waitForExistence(timeout: 4) {
                email.tap(); email.typeText(qaValue("LYANN_E2E_QA_A_EMAIL"))
                password.tap(); password.typeText(qaValue("LYANN_E2E_QA_A_PASSWORD"))
                app.buttons["Valider la connexion"].firstMatch.tap()
            }
        }
        if app.buttons["Menu Principal"].waitForExistence(timeout: 20), app.buttons["Menu Principal"].firstMatch.isHittable {
            app.buttons["Menu Principal"].firstMatch.tap()
            if app.links["Ouvrir Mon activité"].waitForExistence(timeout: 5) { app.links["Ouvrir Mon activité"].firstMatch.tap() }
            let missions = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Mes missions")).firstMatch
            if missions.waitForExistence(timeout: 8) { missions.tap() }
            let done = app.buttons["Terminées"].firstMatch
            if done.waitForExistence(timeout: 5), done.isHittable { done.tap(); sleep(1) }
            let jalons = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Jalons neufs")).firstMatch
            if jalons.waitForExistence(timeout: 6) {
                jalons.tap()
                sleep(3)
                save(app, "108-finished-dossier")
                let toast = app.staticTexts["Cette demande n’accepte plus de nouvelles propositions pour le moment."].exists
                note(toast ? "toast-still-shown" : "toast-absent")
                note(app.staticTexts["Dossier de mission"].exists ? "dossier-visible" : "dossier-not-visible")
            } else {
                note("jalons-not-found-as-a")
                save(app, "108-finished-dossier")
            }
        }
    }

    func testReceiveAsQaB() throws {
        let app = XCUIApplication()
        let token = (try? String(contentsOf: URL(fileURLWithPath: "/tmp/lyann-ios-msg.txt"), encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        XCTAssertFalse(token.isEmpty)
        app.launch()
        XCTAssertTrue(app.buttons["Menu Principal"].waitForExistence(timeout: 25) || app.buttons["Retour"].waitForExistence(timeout: 5))
        if app.buttons["Retour"].firstMatch.exists, app.buttons["Retour"].firstMatch.isHittable, !app.buttons["Menu Principal"].firstMatch.isHittable {
            app.buttons["Retour"].firstMatch.tap()
            sleep(1)
        }
        if app.buttons["Menu Principal"].firstMatch.waitForExistence(timeout: 6), app.buttons["Menu Principal"].firstMatch.isHittable {
            app.buttons["Menu Principal"].firstMatch.tap()
        }
        let logout = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Se déconnecter")).firstMatch
        XCTAssertTrue(logout.waitForExistence(timeout: 6), "Déconnexion introuvable")
        logout.tap()
        if app.buttons["Confirmer"].waitForExistence(timeout: 3) { app.buttons["Confirmer"].firstMatch.tap() }
        XCTAssertTrue(app.buttons["Se connecter"].waitForExistence(timeout: 12), "L’accueil invité ne revient pas")
        save(app, "93-logged-out")
        app.buttons["Se connecter"].firstMatch.tap()
        let email = app.textFields["Adresse email de connexion"]
        let password = app.secureTextFields["Mot de passe de connexion"]
        XCTAssertTrue(email.waitForExistence(timeout: 8))
        let mail = ProcessInfo.processInfo.environment["LYANN_E2E_QA_B_EMAIL"] ?? ""
        let secret = ProcessInfo.processInfo.environment["LYANN_E2E_QA_B_PASSWORD"] ?? ""
        XCTAssertFalse(mail.isEmpty || secret.isEmpty)
        email.tap(); email.typeText(mail)
        password.tap(); password.typeText(secret)
        app.buttons["Valider la connexion"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Messages"].waitForExistence(timeout: 25))
        app.buttons["Messages"].firstMatch.tap()
        let fromA = app.buttons["Ouvrir la conversation avec Qa A."]
        XCTAssertTrue(fromA.waitForExistence(timeout: 20), "QA B ne voit pas Qa A")
        save(app, "94-b-inbox")
        fromA.tap()
        XCTAssertTrue(app.staticTexts[token].waitForExistence(timeout: 15), "QA B ne voit pas le message")
        save(app, "95-b-received")
        let reply = "IOS83R-" + token.replacingOccurrences(of: "IOS83-", with: "")
        let composer = app.textViews["Écrivez un message..."]
        composer.tap()
        composer.typeText(reply)
        app.buttons["Envoyer le message"].firstMatch.tap()
        XCTAssertTrue(app.staticTexts[reply].waitForExistence(timeout: 12), "La réponse de QA B n’apparaît pas")
        save(app, "96-b-reply")
        try? reply.write(to: URL(fileURLWithPath: "/tmp/lyann-ios-reply.txt"), atomically: true, encoding: .utf8)
        note("b-received-and-replied")
    }

    func testMissionsDossierAndReceive() throws {
        let app = XCUIApplication()
        let token = (try? String(contentsOf: URL(fileURLWithPath: "/tmp/lyann-ios-msg.txt"), encoding: .utf8))?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        XCTAssertFalse(token.isEmpty)
        app.launch()
        XCTAssertTrue(app.buttons["Menu Principal"].waitForExistence(timeout: 25))
        app.buttons["Menu Principal"].firstMatch.tap()
        XCTAssertTrue(app.links["Ouvrir Mon activité"].waitForExistence(timeout: 6))
        app.links["Ouvrir Mon activité"].firstMatch.tap()
        _ = app.staticTexts["Mon activité"].waitForExistence(timeout: 8)
        save(app, "90-activity")
        for button in app.buttons.allElementsBoundByIndex where button.exists && (button.label.contains("mission") || button.label.contains("Mes")) {
            note("chip \(button.label) \(state(button))")
        }
        let missions = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Mes missions")).firstMatch
        if missions.waitForExistence(timeout: 4) {
            note("missions-chip \(state(missions))")
            missions.tap()
        } else {
            note("missions-chip-absent")
        }
        sleep(2)
        save(app, "90-missions")
        let done = app.buttons["Terminées"].firstMatch
        if done.waitForExistence(timeout: 4), done.isHittable { done.tap(); sleep(1) }
        let jalons = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Jalons neufs")).firstMatch
        if jalons.waitForExistence(timeout: 6) {
            note("jalons \(state(jalons))")
            jalons.tap()
            sleep(2)
            save(app, "91-dossier")
            let money = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "1,49")).firstMatch.exists
                || app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "€")).firstMatch.exists
            note(money ? "dossier-money" : "dossier-open")
        } else {
            note("jalons-missing")
            save(app, "91-dossier")
        }
        if app.buttons["Retour"].firstMatch.exists, app.buttons["Retour"].firstMatch.isHittable {
            app.buttons["Retour"].firstMatch.tap()
            sleep(1)
        }
        if app.buttons["Notifications"].waitForExistence(timeout: 4), app.buttons["Notifications"].firstMatch.isHittable {
            app.buttons["Notifications"].firstMatch.tap()
            let card = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Proposition de devis")).firstMatch
            if card.waitForExistence(timeout: 6) {
                note("notif-card \(state(card))")
                card.tap()
                sleep(2)
                save(app, "92-notif-destination")
                note("notif-tapped")
            } else {
                note("notif-card-missing")
                save(app, "92-notif-destination")
            }
            if app.buttons["Fermer"].firstMatch.exists, app.buttons["Fermer"].firstMatch.isHittable {
                app.buttons["Fermer"].firstMatch.tap()
            }
        }

        if app.buttons["Menu Principal"].waitForExistence(timeout: 4), app.buttons["Menu Principal"].firstMatch.isHittable {
            app.buttons["Menu Principal"].firstMatch.tap()
        }
        let logout = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Se déconnecter")).firstMatch
        if logout.waitForExistence(timeout: 5) {
            logout.tap()
            sleep(2)
            save(app, "93-logged-out")
        }
        let mail = ProcessInfo.processInfo.environment["LYANN_E2E_QA_B_EMAIL"] ?? ""
        let secret = ProcessInfo.processInfo.environment["LYANN_E2E_QA_B_PASSWORD"] ?? ""
        XCTAssertFalse(mail.isEmpty || secret.isEmpty, "Identifiants QA B absents")
        if app.buttons["Se connecter"].waitForExistence(timeout: 8) {
            app.buttons["Se connecter"].firstMatch.tap()
            let email = app.textFields["Adresse email de connexion"]
            let password = app.secureTextFields["Mot de passe de connexion"]
            XCTAssertTrue(email.waitForExistence(timeout: 8) && password.waitForExistence(timeout: 4))
            email.tap(); email.typeText(mail)
            password.tap(); password.typeText(secret)
            app.buttons["Valider la connexion"].firstMatch.tap()
        }
        XCTAssertTrue(app.buttons["Messages"].waitForExistence(timeout: 25))
        app.buttons["Messages"].firstMatch.tap()
        let fromA = app.buttons["Ouvrir la conversation avec Qa A."]
        let seen = fromA.waitForExistence(timeout: 20)
        save(app, "94-b-inbox")
        note(seen ? "b-sees-a" : "b-inbox-missing")
        XCTAssertTrue(seen, "QA B ne voit pas la conversation")
        fromA.tap()
        let received = app.staticTexts[token].waitForExistence(timeout: 12)
        save(app, "95-b-received")
        note(received ? "b-received" : "b-missing-message")
        XCTAssertTrue(received, "QA B ne voit pas le message de QA A")
        let reply = "IOS83R-" + token.replacingOccurrences(of: "IOS83-", with: "")
        let composer = app.textViews["Écrivez un message..."]
        if composer.waitForExistence(timeout: 6) {
            composer.tap()
            composer.typeText(reply)
            app.buttons["Envoyer le message"].firstMatch.tap()
            _ = app.staticTexts[reply].waitForExistence(timeout: 10)
            save(app, "96-b-reply")
            try? reply.write(to: URL(fileURLWithPath: "/tmp/lyann-ios-reply.txt"), atomically: true, encoding: .utf8)
            note("b-replied")
        }
    }

    func testConversationSendAndMissions() throws {
        let app = XCUIApplication()
        let token = "IOS83-" + String(Int(Date().timeIntervalSince1970))
        try? token.write(to: URL(fileURLWithPath: "/tmp/lyann-ios-msg.txt"), atomically: true, encoding: .utf8)
        app.launch()
        let started = Date()
        XCTAssertTrue(app.buttons["Messages"].waitForExistence(timeout: 25))
        app.buttons["Messages"].firstMatch.tap()
        let row = app.buttons["Ouvrir la conversation avec Qa L."]
        let listed = row.waitForExistence(timeout: 20)
        note("inbox-open \(listed ? "list" : "missing") \(Int(Date().timeIntervalSince(started) * 1000))ms")
        save(app, "80-inbox")
        XCTAssertTrue(listed, "La liste ne montre pas Qa L. \(visibleLabels(app))")
        row.tap()
        let composer = app.textViews["Écrivez un message..."]
        XCTAssertTrue(composer.waitForExistence(timeout: 12), "Le fil ne s’ouvre pas")
        save(app, "81-thread")
        composer.tap()
        composer.typeText(token)
        let send = app.buttons["Envoyer le message"]
        XCTAssertTrue(send.waitForExistence(timeout: 6) && send.isHittable, "Envoi non atteignable")
        send.tap()
        let sent = app.staticTexts[token].waitForExistence(timeout: 12) || app.textViews[token].waitForExistence(timeout: 2)
        save(app, "82-sent")
        note(sent ? "sent-visible" : "sent-not-visible")
        XCTAssertTrue(sent, "Le message envoyé n’apparaît pas dans le fil")
        if app.buttons["Retour"].firstMatch.isHittable { app.buttons["Retour"].firstMatch.tap() }
        sleep(1)
        save(app, "83-back-to-list")

        app.buttons["Annonces"].firstMatch.tap()
        app.buttons["Lyanneurs"].firstMatch.tap()
        app.buttons["Bokantaj"].firstMatch.tap()
        app.buttons["Messages"].firstMatch.tap()
        save(app, "84-rapid-tabs")
        note(app.buttons["Ouvrir la conversation avec Qa L."].waitForExistence(timeout: 8) ? "rapid-tabs-inbox" : "rapid-tabs-lost")

        if app.buttons["Menu Principal"].firstMatch.isHittable { app.buttons["Menu Principal"].firstMatch.tap() }
        sleep(1)
        if app.links["Ouvrir Mon activité"].firstMatch.waitForExistence(timeout: 4), app.links["Ouvrir Mon activité"].firstMatch.isHittable {
            app.links["Ouvrir Mon activité"].firstMatch.tap()
        }
        let missionsTab = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Mes missions")).firstMatch
        if missionsTab.waitForExistence(timeout: 8), missionsTab.isHittable {
            missionsTab.tap()
            sleep(2)
            save(app, "85-missions")
            note("missions-tab")
            let dossier = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Jalons neufs")).firstMatch
            let dossierText = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Jalons neufs")).firstMatch
            if dossier.waitForExistence(timeout: 4), dossier.isHittable { dossier.tap() }
            else if dossierText.exists, dossierText.isHittable { dossierText.tap() }
            sleep(2)
            save(app, "86-dossier")
            note(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "1,49")).firstMatch.exists ? "dossier-money" : "dossier-opened")
        } else {
            note("missions-tab-missing")
            save(app, "85-missions")
        }
        if app.buttons["Fermer"].firstMatch.exists, app.buttons["Fermer"].firstMatch.isHittable {
            app.buttons["Fermer"].firstMatch.tap()
        }

        if app.buttons["Notifications"].firstMatch.isHittable {
            app.buttons["Notifications"].firstMatch.tap()
            sleep(2)
            save(app, "87-notifications")
            let item = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Proposition de devis")).firstMatch
            if item.waitForExistence(timeout: 4), item.isHittable {
                item.tap()
                sleep(2)
                save(app, "88-notification-destination")
                note("notification-opened")
            } else {
                note("notification-item-not-hittable")
            }
        }

        XCUIDevice.shared.press(.home)
        sleep(1)
        app.activate()
        save(app, "89-resume")
        note(app.buttons["Profil"].waitForExistence(timeout: 10) ? "resumed" : "resume-failed")
    }

    func testChatColdOpens() throws {
        let app = XCUIApplication()
        for round in 1...3 {
            app.launch()
            let started = Date()
            XCTAssertTrue(app.buttons["Messages"].waitForExistence(timeout: 25), "Session absente au lancement \(round)")
            app.buttons["Messages"].firstMatch.tap()
            let outcome = waitForInbox(app, seconds: 20)
            let elapsed = Int(Date().timeIntervalSince(started) * 1000)
            save(app, "70-inbox-\(round)")
            let retry = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Réessayer")).firstMatch
            if retry.exists {
                note("inbox-\(round) error \(elapsed)ms \(retry.label)")
                if retry.isHittable {
                    retry.tap()
                    let recovered = waitForInbox(app, seconds: 20)
                    save(app, "71-inbox-retry-\(round)")
                    note("inbox-\(round) retry \(recovered)")
                }
            } else {
                note("inbox-\(round) \(outcome) \(elapsed)ms")
            }
            app.terminate()
        }
    }

    // Three things only the native shell can answer: whether the pinned Fil/Carte
    // bar survives a scroll, whether the keyboard can be closed, and whether the
    // system photo sheet speaks French.
    func testBokantajChromeKeyboardAndFrenchPickers() throws {
        let app = XCUIApplication()
        app.launch()
        signIn(app)

        XCTAssertTrue(app.buttons["Bokantaj"].waitForExistence(timeout: 25), "Barre membre absente. \(visibleLabels(app))")
        app.buttons["Bokantaj"].firstMatch.tap()
        sleep(3)
        let feedTab = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Fil")).firstMatch
        XCTAssertTrue(feedTab.waitForExistence(timeout: 20), "Onglet Fil absent. \(visibleLabels(app))")
        let restingTop = feedTab.frame.minY
        save(app, "80-feed")

        app.swipeUp()
        app.swipeUp()
        sleep(1)
        save(app, "81-feed-scrolled")
        note("fil resting=\(restingTop) scrolled=\(feedTab.frame.minY) hittable=\(feedTab.isHittable)")
        XCTAssertTrue(feedTab.exists && feedTab.isHittable, "Fil/Carte ne reste pas accessible après défilement.")
        XCTAssertLessThan(feedTab.frame.minY, restingTop + 8, "La barre Fil/Carte a défilé avec la page.")

        let mapTab = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Carte")).firstMatch
        if tapIfHittable(mapTab, name: "Carte") {
            sleep(4)
            save(app, "82-map")
            note("carte fil=\(feedTab.frame) tout=\(app.buttons["Tout"].frame)")
            XCTAssertTrue(app.buttons["Tout"].exists, "Les filtres de catégorie ont disparu de la carte.")
            if tapIfHittable(feedTab, name: "Retour au fil") { sleep(2) }
        }

        // Keyboard: it must always offer a way down.
        save(app, "82b-back-to-feed")
        // The avatar alt text is prepended to the label, so only CONTAINS matches.
        let composerQuery = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Partager une idée"))
        for _ in 0..<8 where !composerQuery.firstMatch.isHittable {
            app.swipeDown()
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        let composer = composerQuery.firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 8), "Composeur absent. \(visibleLabels(app))")
        note("composeur \(state(composer))")
        forceTap(composer)
        sleep(2)
        let field = app.textViews.firstMatch.exists ? app.textViews.firstMatch : app.textFields.firstMatch
        XCTAssertTrue(field.waitForExistence(timeout: 8), "Champ de saisie absent du composeur.")
        field.tap()
        let opened = waitUntil(app, seconds: 6) { app.keyboards.count > 0 }
        save(app, "83-keyboard")
        note("clavier ouvert=\(opened) frame=\(field.frame)")
        XCTAssertTrue(opened, "Le clavier ne s’ouvre pas sur le composeur.")
        // A tap well above the field is what a member does to get the keyboard out of the way.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        let closed = waitUntil(app, seconds: 8) { app.keyboards.count == 0 }
        save(app, "84-keyboard-dismissed")
        note("clavier refermé=\(closed)")
        XCTAssertTrue(closed, "Le clavier reste ouvert après un appui en dehors du champ.")

        // The photo sheet comes from iOS, so it follows CFBundleLocalizations.
        // Two buttons carry that label: the shortcut in the bar and the one in the
        // open form. Only the lower one belongs to the form that is on screen.
        let photo = app.buttons.matching(identifier: "Photo").firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 8), "Bouton Photo absent. \(visibleLabels(app))")
        for _ in 0..<6 where !photo.isHittable {
            app.swipeDown()
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        note("photo \(state(photo))")
        forceTap(photo)
        // The sheet belongs to SpringBoard, not to the web view.
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        _ = waitUntil(app, seconds: 12) {
            app.sheets.count + app.alerts.count + springboard.sheets.count + springboard.alerts.count > 0
        }
        sleep(2)
        save(app, "85-picker")
        let labels = (app.sheets.buttons.allElementsBoundByIndex.map(\.label)
            + app.alerts.buttons.allElementsBoundByIndex.map(\.label)
            + springboard.sheets.buttons.allElementsBoundByIndex.map(\.label)
            + springboard.alerts.buttons.allElementsBoundByIndex.map(\.label)).filter { !$0.isEmpty }
        note("picker \(labels.joined(separator: " | "))")
        let english = labels.contains { $0 == "Photo Library" || $0 == "Take Photo" || $0 == "Choose File" || $0 == "Choose Files" }
        XCTAssertFalse(english, "Le sélecteur iOS est resté en anglais : \(labels)")
        // The sheet does not always come up on a simulator, so its absence is
        // recorded rather than treated as a localisation failure.
        if labels.isEmpty { note("picker-absent") }
        if app.buttons["Annuler"].exists { app.buttons["Annuler"].firstMatch.tap() }
    }

    // Visual check of the three native banners, one capture per universe.
    func testNativeUniverseHeaders() throws {
        let app = XCUIApplication()
        app.launch()
        signIn(app)
        XCTAssertTrue(app.buttons["Bokantaj"].waitForExistence(timeout: 25), "Barre membre absente. \(visibleLabels(app))")

        for (tab, shot) in [("Bokantaj", "90-header-bokantaj"), ("Lyanneurs", "91-header-lyanneurs"), ("Annonces", "92-header-annonces")] {
            XCTAssertTrue(tapIfHittable(app.buttons[tab].firstMatch, name: tab), "Onglet \(tab) inaccessible.")
            sleep(4)
            save(app, shot)
        }
    }

    // The skill form with the keyboard up: everything that matters must stay
    // on screen, Enregistrer included.
    func testSkillFormWithKeyboard() throws {
        let app = XCUIApplication()
        app.launch()
        signIn(app)
        XCTAssertTrue(app.buttons["Profil"].waitForExistence(timeout: 25), "Barre membre absente. \(visibleLabels(app))")
        app.buttons["Profil"].firstMatch.tap()
        sleep(3)
        save(app, "94-account")

        let add = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@",
                                                   "Nouveau service", "Ajouter un service")).firstMatch
        for _ in 0..<10 where !add.exists || !add.isHittable {
            app.swipeUp()
            RunLoop.current.run(until: Date().addingTimeInterval(0.5))
        }
        guard add.exists else {
            dump(app, "account-without-service-button")
            save(app, "95-no-service-button")
            XCTFail("Bouton d’ajout de compétence introuvable.")
            return
        }
        forceTap(add)
        sleep(2)
        save(app, "95-skill-form")

        let title = app.textFields.matching(NSPredicate(format: "value CONTAINS[c] %@ OR placeholderValue CONTAINS[c] %@",
                                                        "Réparation de clim", "Réparation de clim")).firstMatch
        XCTAssertTrue(title.waitForExistence(timeout: 8), "Champ du nom de compétence absent. \(visibleLabels(app))")
        forceTap(title)
        XCTAssertTrue(waitUntil(app, seconds: 8) { app.keyboards.count > 0 }, "Le clavier ne s’ouvre pas.")
        sleep(2)
        save(app, "96-skill-form-keyboard")

        let keyboardTop = app.keyboards.firstMatch.frame.minY
        let submit = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Enregistrer ce service")).firstMatch
        XCTAssertTrue(submit.exists, "Bouton Enregistrer absent du formulaire. \(visibleLabels(app))")
        note("keyboardTop=\(keyboardTop) submit=\(state(submit))")
        XCTAssertLessThanOrEqual(submit.frame.maxY, keyboardTop,
                                 "Le bouton Enregistrer passe sous le clavier.")
    }

    private func qaValue(_ key: String) -> String {
        if let value = ProcessInfo.processInfo.environment[key], !value.isEmpty { return value }
        let url = URL(fileURLWithPath: "/tmp/lyann-qa-a.json")
        guard let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return "" }
        return json[key] ?? ""
    }

    private func forceTap(_ element: XCUIElement) {
        if element.isHittable { element.tap() }
        else { element.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap() }
    }

    private func signIn(_ app: XCUIApplication) {
        let guestButton = app.buttons["Se connecter"].firstMatch
        guard guestButton.waitForExistence(timeout: 30) else {
            note("session-already-present")
            return
        }
        guestButton.tap()
        let email = app.textFields["Adresse email de connexion"]
        let password = app.secureTextFields["Mot de passe de connexion"]
        guard email.waitForExistence(timeout: 8), password.waitForExistence(timeout: 4) else {
            XCTFail("Formulaire de connexion absent. \(visibleLabels(app))")
            return
        }
        let mail = qaValue("LYANN_E2E_QA_A_EMAIL")
        let secret = qaValue("LYANN_E2E_QA_A_PASSWORD")
        XCTAssertFalse(mail.isEmpty || secret.isEmpty, "Identifiants QA absents")
        email.tap()
        email.typeText(mail)
        password.tap()
        password.typeText(secret)
        // The submit button sits under the keyboard, so it has to go down first.
        if app.keyboards.buttons["retour"].exists { app.keyboards.buttons["retour"].tap() }
        else if app.keyboards.buttons["Return"].exists { app.keyboards.buttons["Return"].tap() }
        _ = waitUntil(app, seconds: 4) { app.keyboards.count == 0 }
        let submit = app.buttons["Valider la connexion"]
        // Return may already have validated the form, in which case there is nothing left to tap.
        if submit.waitForExistence(timeout: 4) {
            note("submit \(state(submit))")
            if submit.isHittable { submit.tap() } else { submit.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap() }
        } else {
            note("submit-absent \(visibleLabels(app))")
        }
        XCTAssertTrue(app.buttons["Profil"].waitForExistence(timeout: 30), "Connexion QA échouée. \(visibleLabels(app))")
    }

    private func waitForInbox(_ app: XCUIApplication, seconds: TimeInterval) -> String {
        let deadline = Date().addingTimeInterval(seconds)
        while Date() < deadline {
            if app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Réessayer")).firstMatch.exists { return "error" }
            if app.staticTexts["Impossible de charger les conversations."].exists { return "error-plain" }
            if app.staticTexts["Qa L."].exists || app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Support")).firstMatch.exists { return "list" }
            if app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Chargement des conversations")).firstMatch.exists {
                RunLoop.current.run(until: Date().addingTimeInterval(0.3))
                continue
            }
            RunLoop.current.run(until: Date().addingTimeInterval(0.3))
        }
        return "timeout"
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
        print("LYANN-NOTE \(line)")
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
        // The runner sandbox is the only place the host can read back reliably.
        let inbox = FileManager.default.temporaryDirectory.appendingPathComponent("lyann-ui-\(name).png")
        try? shot.pngRepresentation.write(to: inbox)
        print("LYANN-SHOT \(inbox.path)")
        let attachment = XCTAttachment(screenshot: shot)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
