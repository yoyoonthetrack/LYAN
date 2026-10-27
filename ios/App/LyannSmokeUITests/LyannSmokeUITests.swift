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
        let identity = accountIdentityVisible(app)
        note(identity.email ? "account-email-visible" : "account-email-missing")
        note(identity.name ? "identity-qa-a" : "identity-missing")
        XCTAssertTrue(identity.email && identity.name, "Le compte ouvert n’est pas QA A. \(visibleLabels(app))")
        dismissSheet(app)

        app.terminate()
        app.launch()
        let persisted = app.buttons["Profil"].waitForExistence(timeout: 25)
        save(app, "44-relaunch")
        if persisted { openAccount(app, shot: "44b-relaunch-account") }
        let stillQa = accountIdentityVisible(app).email
        note(stillQa ? "session-persisted" : "session-lost")
        XCTAssertTrue(persisted && stillQa, "La session QA A ne survit pas à la fermeture.")
        dismissSheet(app)
        XCTAssertTrue(app.buttons["Profil"].firstMatch.isHittable, "La feuille compte recouvre encore la barre.")

        visit(app, "Annonces", "45-annonces", ready: "annonces")
        visit(app, "Bokantaj", "46-bokantaj", ready: "Bokantaj")
        if tapIfHittable(app.buttons["Carte"].firstMatch, name: "Carte") {
            let canvas = app.otherElements["Carte des publications géolocalisées"].firstMatch
            let mapReady = canvas.waitForExistence(timeout: 8)
            note(mapReady ? "map-canvas-shown" : "map-canvas-missing")
            save(app, "46b-carte")
            _ = tapIfHittable(app.buttons["Fil"].firstMatch, name: "Fil")
        }
        let composer = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Partager une idée")).firstMatch
        if tapIfHittable(composer, name: "Compositeur") {
            let field = app.textViews.matching(NSPredicate(format: "label CONTAINS %@ OR placeholderValue CONTAINS %@", "Écrivez votre Lyann", "Écrivez votre Lyann")).firstMatch
            if field.waitForExistence(timeout: 4) {
                field.tap()
                let keyboard = app.keyboards.firstMatch.waitForExistence(timeout: 4)
                note(keyboard ? "keyboard-open" : "keyboard-missing")
                if keyboard { field.typeText("Repere simulateur v18") }
                let publish = app.buttons["Publier"].firstMatch
                if publish.waitForExistence(timeout: 3), publish.isHittable {
                    publish.tap()
                    let posted = app.staticTexts["Repere simulateur v18"].firstMatch.waitForExistence(timeout: 12)
                    note(posted ? "bokantaj-published" : "bokantaj-publish-unconfirmed")
                } else {
                    note("publish-not-hittable")
                }
            } else {
                note("composer-field-missing")
            }
            save(app, "46c-clavier")
        }
        let photo = app.buttons["Photo"].firstMatch
        if photo.waitForExistence(timeout: 3), photo.isHittable {
            photo.tap()
            let cancel = app.buttons["Annuler"].firstMatch
            if cancel.waitForExistence(timeout: 4), cancel.isHittable {
                note("photo-picker-open")
                cancel.tap()
                note("photo-picker-cancelled")
            } else {
                note("photo-picker-not-shown")
            }
            save(app, "46e-photo")
        } else {
            note("photo-control-absent")
        }
        let poster = app.buttons["Lire la vidéo"].firstMatch
        if poster.waitForExistence(timeout: 4), poster.isHittable {
            poster.tap()
            note("video-tapped")
            save(app, "46d-video")
        } else {
            note("video-poster-absent")
        }
        visit(app, "Lyanneurs", "47-lyanneurs", ready: "Lyanneurs")

        if tapIfHittable(app.buttons["Messages"].firstMatch, name: "Messages") {
            let loaded = waitUntil(app, seconds: 16) {
                app.staticTexts["Impossible de charger les conversations."].exists
                    || app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Réessayer")).firstMatch.exists
                    || app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Qa L")).firstMatch.exists
                    || app.staticTexts["Support LYANN"].firstMatch.exists
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

    func testDeviceRemainder() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Bokantaj"].waitForExistence(timeout: 25))
        dismissOverlay(app)
        if let lyanneurs = hittable(app, "Lyanneurs") {
            lyanneurs.tap()
            let ready = waitUntil(app, seconds: 16) {
                app.buttons["Contacter"].firstMatch.exists
                    || app.staticTexts["Aucun Lyanneur trouvé pour cette recherche."].exists
                    || app.staticTexts["Lyanneurs"].exists
            }
            note(ready ? "lyanneurs-shown" : "lyanneurs-pending")
            save(app, "v22-lyanneurs")
        } else {
            note("lyanneurs-absent")
        }
        dismissOverlay(app)
        if let messages = hittable(app, "Messages") {
            messages.tap()
            let ready = waitUntil(app, seconds: 16) {
                app.staticTexts["Impossible de charger les conversations."].exists
                    || app.staticTexts["Support LYANN"].exists
                    || app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Qa")).firstMatch.exists
                    || app.staticTexts["Messages"].exists
            }
            note(ready ? "messages-shown" : "messages-pending")
            save(app, "v22-messages")
        } else {
            note("messages-absent")
        }
        dismissOverlay(app)
        _ = hittable(app, "Bokantaj")?.tap()
        let field = app.textViews.firstMatch
        if field.waitForExistence(timeout: 6) {
            if field.isHittable { field.tap() }
            let keyboard = app.keyboards.firstMatch.waitForExistence(timeout: 4)
            note(keyboard ? "keyboard-open" : "keyboard-missing")
            save(app, "v22-keyboard")
            dismissKeyboard(app)
            note(app.keyboards.count == 0 ? "keyboard-closed" : "keyboard-still-open")
        } else {
            note("composer-field-missing")
        }
        if let place = hittable(app, "Ajouter une localisation") {
            place.tap()
            let allow = app.buttons["Une fois"].firstMatch
            if allow.waitForExistence(timeout: 2), allow.isHittable { allow.tap(); note("location-once") }
            if let locate = hittable(app, "Me localiser") {
                locate.tap()
                note("locate-tapped")
                _ = waitUntil(app, seconds: 8) { !app.staticTexts["Recherche de votre position…"].exists }
                save(app, "v22-locate")
            } else {
                note("locate-absent")
                save(app, "v22-locate")
            }
            if let closePlace = hittable(app, "Ajouter une localisation") { closePlace.tap() }
        } else {
            note("place-trigger-absent")
        }
        let first = playNextFeedVideo(app, shot: "v22-video-a")
        note(first ? "device-video-a" : "device-video-a-missing")
        app.swipeUp()
        let second = playNextFeedVideo(app, shot: "v22-video-b")
        note(second ? "device-video-b" : "device-video-b-missing")
        XCUIDevice.shared.press(.home)
        sleep(1)
        app.activate()
        note(app.buttons["Bokantaj"].waitForExistence(timeout: 12) ? "device-resumed" : "device-resume-failed")
        save(app, "v22-resumed")
    }

    func testQaPhysicalPass() throws {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Bokantaj"].waitForExistence(timeout: 30) || app.buttons["Se connecter"].waitForExistence(timeout: 8))
        ensureQaAccount(app)
        openAccount(app, shot: "v23-account")
        let qa = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "@lyann.invalid")).firstMatch.exists
            || app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Qa A")).firstMatch.exists
        note(qa ? "qa-identity" : "qa-identity-missing")
        dismissSheet(app)
        guard qa else {
            note("stopped-personal-session")
            XCTFail("La session n’est pas QA A. Aucune écriture. \(visibleLabels(app))")
            return
        }

        _ = hittable(app, "Bokantaj")?.tap()
        let field = app.textViews.firstMatch
        if field.waitForExistence(timeout: 6) {
            if field.isHittable { field.tap() }
            note(app.keyboards.firstMatch.waitForExistence(timeout: 4) ? "keyboard-open" : "keyboard-missing")
            field.typeText("QA-IOS-V23-TEXT")
            dismissKeyboard(app)
            let publish = app.buttons["Publier"].firstMatch
            if publish.waitForExistence(timeout: 3), publish.isHittable { publish.tap() }
            note(app.staticTexts["QA-IOS-V23-TEXT"].firstMatch.waitForExistence(timeout: 20) ? "qa-text-published" : "qa-text-missing")
            save(app, "v23-published")
        }
        if let photo = hittable(app, "Photo") {
            photo.tap()
            let library = app.buttons["Photothèque"].firstMatch
            note(library.waitForExistence(timeout: 4) ? "photo-chooser" : "photo-chooser-missing")
            save(app, "v23-photo")
            if library.exists, library.isHittable { library.tap() }
            let cancel = app.buttons["Annuler"].firstMatch
            if cancel.waitForExistence(timeout: 4), cancel.isHittable {
                note("photo-library-open")
                cancel.tap()
                note("photo-library-cancelled")
            }
        }
        if let place = hittable(app, "Ajouter une localisation") {
            place.tap()
            let once = app.buttons["Autoriser une fois"].firstMatch
            if once.waitForExistence(timeout: 2), once.isHittable { once.tap() }
            if let locate = hittable(app, "Me localiser") { locate.tap(); note("locate-tapped") }
            _ = waitUntil(app, seconds: 8) { !app.staticTexts["Recherche de votre position…"].exists }
            publishSharedPlace(app, exact: false, marker: "QA-IOS-V23-QUARTIER")
        }
        _ = hittable(app, "Bokantaj")?.tap()
        dismissKeyboard(app)
        if let place = hittable(app, "Ajouter une localisation") {
            place.tap()
            if let locate = hittable(app, "Me localiser") { locate.tap() }
            _ = waitUntil(app, seconds: 6) { !app.staticTexts["Recherche de votre position…"].exists }
            publishSharedPlace(app, exact: true, marker: "QA-IOS-V23-EXACT")
        }
        let played = playApprovedVideo(app)
        note(played ? "qa-video-played" : "qa-video-missing")
        if let annonces = hittable(app, "Annonces") {
            annonces.tap()
            let details = app.buttons["Détails"].firstMatch
            note(details.waitForExistence(timeout: 12) ? "annonces-list" : "annonces-empty")
            save(app, "v23-annonces")
            if details.exists, details.isHittable {
                details.tap()
                note(app.buttons["Contacter"].firstMatch.waitForExistence(timeout: 6) || app.buttons["Modifier"].firstMatch.exists ? "annonce-detail" : "annonce-detail-empty")
                save(app, "v23-annonce-detail")
                if app.buttons["Fermer"].firstMatch.exists, app.buttons["Fermer"].firstMatch.isHittable { app.buttons["Fermer"].firstMatch.tap() }
            }
        }
        dismissOverlay(app)
        if let people = hittable(app, "Lyanneurs") {
            people.tap()
            let contact = app.buttons["Contacter"].firstMatch
            note(contact.waitForExistence(timeout: 12) ? "lyanneurs-list" : "lyanneurs-empty")
            save(app, "v23-lyanneurs")
        }
        dismissOverlay(app)
        if let messages = hittable(app, "Messages") {
            messages.tap()
            let ready = waitUntil(app, seconds: 12) {
                app.staticTexts["Support LYANN"].exists || app.staticTexts["Messages"].exists || app.cells.firstMatch.exists
            }
            note(ready ? "messages-open" : "messages-pending")
            save(app, "v23-messages")
            if app.buttons["Fermer"].firstMatch.exists, app.buttons["Fermer"].firstMatch.isHittable { app.buttons["Fermer"].firstMatch.tap() }
        }
        if let bell = hittable(app, "Notifications") {
            bell.tap()
            note(app.staticTexts["Notifications"].waitForExistence(timeout: 4) ? "notifications-open" : "notifications-missing")
            save(app, "v23-notifications")
            if app.buttons["Fermer"].firstMatch.exists, app.buttons["Fermer"].firstMatch.isHittable { app.buttons["Fermer"].firstMatch.tap() }
        }
        XCUIDevice.shared.press(.home)
        sleep(1)
        app.activate()
        note(app.buttons["Bokantaj"].waitForExistence(timeout: 12) ? "qa-resumed" : "qa-resume-failed")
        save(app, "v23-resumed")
        app.swipeUp()
        note("qa-scrolled")
    }

    private func dismissLeftoverLocationPrompt() {
        let board = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let deny = board.buttons["Ne pas autoriser"].firstMatch
        guard deny.waitForExistence(timeout: 2), deny.isHittable else { return }
        deny.tap()
        note("location-prompt-dismissed")
    }

    private func ensureQaAccount(_ app: XCUIApplication) {
        dismissLeftoverLocationPrompt()
        if app.buttons["Se connecter"].waitForExistence(timeout: 6), app.buttons["Se connecter"].firstMatch.isHittable {
            signIn(app)
            note("qa-signed-in")
            return
        }
        openAccount(app, shot: "v23-before")
        let qa = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "@lyann.invalid")).firstMatch.exists
            || app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Qa A")).firstMatch.exists
        dismissSheet(app)
        if qa {
            note("qa-already")
            return
        }
        note("personal-session-logout")
        _ = hittable(app, "Menu Principal")?.tap()
        guard app.buttons["Fermer le menu"].firstMatch.waitForExistence(timeout: 6) else {
            note("drawer-not-open")
            save(app, "v23-drawer")
            return
        }
        let matches = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Se déconnecter"))
        var logout = matches.firstMatch
        for _ in 0..<4 {
            if logout.exists, logout.isHittable, logout.frame.height > 20 { break }
            app.swipeUp()
            logout = matches.firstMatch
        }
        note("logout-count \(matches.count) \(logout.exists ? state(logout) : "absent")")
        guard logout.exists, logout.isHittable else {
            note("logout-control-missing")
            return
        }
        logout.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let guest = waitUntil(app, seconds: 15) {
            app.buttons["Se connecter"].firstMatch.exists
                || app.links["Se connecter"].firstMatch.exists
                || app.links["Connexion"].firstMatch.isHittable
        }
        save(app, "v23-after-logout")
        note(guest ? "logged-out" : "logout-failed")
        guard guest else { return }
        signIn(app)
        note("qa-signed-in")
    }

    private func publishSharedPlace(_ app: XCUIApplication, exact: Bool, marker: String) {
        let label = exact ? "Partager la localisation précise" : "Partager le nom du quartier"
        var choice = hittable(app, label)
        for _ in 0..<4 where choice == nil {
            scrollPage(app, up: true)
            choice = hittable(app, label)
        }
        guard let choice else {
            note(exact ? "exact-missing" : "quarter-missing")
            save(app, exact ? "v23-exact" : "v23-quarter")
            return
        }
        choice.tap()
        let field = app.textViews.firstMatch
        if field.waitForExistence(timeout: 3), field.isHittable {
            field.tap()
            field.typeText(marker)
        }
        dismissKeyboard(app)
        let publish = app.buttons["Publier"].firstMatch
        if publish.waitForExistence(timeout: 3), publish.isHittable { publish.tap() }
        note(app.staticTexts[marker].firstMatch.waitForExistence(timeout: 20) ? "published-\(marker)" : "missing-\(marker)")
        save(app, exact ? "v23-exact" : "v23-quarter")
    }

    private func playApprovedVideo(_ app: XCUIApplication) -> Bool {
        _ = hittable(app, "Bokantaj")?.tap()
        for _ in 0..<6 {
            guard let poster = hittable(app, "Lire la vidéo") else {
                scrollPage(app, up: true)
                continue
            }
            if app.staticTexts["Vidéo en cours de vérification"].firstMatch.exists, poster.frame.minY > 200 {
                scrollPage(app, up: true)
            }
            poster.tap()
            let playing = app.staticTexts["Lecture en cours"].firstMatch
            guard playing.waitForExistence(timeout: 22) else {
                note(app.staticTexts["La vidéo n’a pas pu être chargée."].exists ? "video-failed" : "video-not-playing")
                scrollPage(app, up: true)
                continue
            }
            note("video-playing")
            if let pause = hittable(app, "Pause") {
                pause.tap()
                note(app.staticTexts["Lecture en pause"].firstMatch.waitForExistence(timeout: 4) ? "video-paused" : "video-pause-missing")
            }
            if let resume = hittable(app, "Lecture") {
                resume.tap()
                note(playing.waitForExistence(timeout: 6) ? "video-resumed" : "video-resume-missing")
            }
            if let expand = hittable(app, "Ouvrir le lecteur") {
                expand.tap()
                let close = app.buttons["Fermer le lecteur"].firstMatch
                note(close.waitForExistence(timeout: 4) ? "video-stage" : "video-stage-missing")
                save(app, "v23-video")
                if close.exists, close.isHittable { close.tap() }
                note(app.buttons["Fil"].firstMatch.waitForExistence(timeout: 4) ? "video-back-feed" : "video-back-missing")
            }
            return true
        }
        return false
    }

    func testTwoFeedVideos() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Bokantaj"].waitForExistence(timeout: 25))
        _ = hittable(app, "Bokantaj")?.tap()
        note("prefetch-window")
        RunLoop.current.run(until: Date().addingTimeInterval(4))
        let first = playNextFeedVideo(app, shot: "v22-sim-video-a")
        note(first ? "sim-video-a" : "sim-video-a-missing")
        app.swipeUp()
        let second = playNextFeedVideo(app, shot: "v22-sim-video-b")
        note(second ? "sim-video-b" : "sim-video-b-missing")
        note("network-cut-unavailable")
        XCUIDevice.shared.press(.home)
        sleep(1)
        app.activate()
        let stillPlaying = app.staticTexts["Lecture en cours"].firstMatch.exists
        note(stillPlaying ? "blob-still-playing" : "blob-cleared")
        note(app.buttons["Fil"].waitForExistence(timeout: 8) ? "sim-resumed-feed" : "sim-resume-missing")
        save(app, "v22-sim-resumed")
    }

    private func playNextFeedVideo(_ app: XCUIApplication, shot: String) -> Bool {
        for _ in 0..<5 {
            guard let poster = hittable(app, "Lire la vidéo") else {
                scrollPage(app, up: true)
                continue
            }
            poster.tap()
            let playing = app.staticTexts["Lecture en cours"].firstMatch
            let started = playing.waitForExistence(timeout: 22)
            let failed = app.staticTexts["La vidéo n’a pas pu être chargée."].firstMatch.exists
            note(started ? "video-playing" : failed ? "video-failed" : "video-not-playing")
            save(app, shot)
            guard started else {
                scrollPage(app, up: true)
                continue
            }
            var expand = hittable(app, "Ouvrir le lecteur")
            if expand == nil {
                scrollPage(app, up: false)
                expand = hittable(app, "Ouvrir le lecteur")
            }
            if let expand {
                expand.tap()
                let close = app.buttons["Fermer le lecteur"].firstMatch
                let staged = close.waitForExistence(timeout: 4)
                note(staged ? "video-stage" : "video-stage-missing")
                if staged, close.isHittable {
                    close.tap()
                    let back = app.buttons["Fil"].firstMatch.waitForExistence(timeout: 4) && !app.buttons["Fermer le lecteur"].firstMatch.exists
                    note(back ? "video-back-feed" : "video-back-missing")
                }
            } else {
                note("video-expand-missing")
            }
            return true
        }
        note("video-poster-absent")
        return false
    }

    private func dismissOverlay(_ app: XCUIApplication) {
        let close = app.buttons["Fermer"].firstMatch
        if close.exists, close.isHittable { close.tap() }
        let menu = app.buttons["Fermer le menu"].firstMatch
        if menu.exists, menu.isHittable { menu.tap() }
    }

    func testAnnoncesMapAndMedia() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Annonces"].waitForExistence(timeout: 30))
        XCTAssertTrue(app.buttons["Annonces"].firstMatch.isHittable)
        app.buttons["Annonces"].firstMatch.tap()
        let details = app.buttons["Détails"].firstMatch
        let empty = app.staticTexts["Pas encore d'annonce correspondant à votre recherche."].firstMatch
        let failed = app.staticTexts["Impossible de charger les résultats."].firstMatch
        let listed = waitUntil(app, seconds: 20) { details.exists || empty.exists || failed.exists }
        note(details.exists ? "annonces-cards" : empty.exists ? "annonces-empty" : failed.exists ? "annonces-error" : "annonces-pending")
        save(app, "v19-annonces")
        XCTAssertTrue(listed, "Les annonces ne quittent pas le chargement.")
        if details.exists, details.isHittable {
            details.tap()
            let own = app.buttons["Modifier"].firstMatch.waitForExistence(timeout: 6)
            let contact = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Contacter")).firstMatch
            note(own ? "annonce-own-detail" : contact.exists ? "annonce-detail" : "annonce-detail-empty")
            save(app, "v19-annonce-detail")
            let close = app.buttons["Fermer"].firstMatch
            if close.waitForExistence(timeout: 2), close.isHittable { close.tap() }
        }

        let lyanneurs = app.buttons["Lyanneurs"].firstMatch
        XCTAssertTrue(lyanneurs.waitForExistence(timeout: 5) && lyanneurs.isHittable)
        lyanneurs.tap()
        let contactTalent = app.buttons["Contacter"].firstMatch
        let noTalent = app.staticTexts["Aucun Lyanneur trouvé pour cette recherche."].firstMatch
        let talents = waitUntil(app, seconds: 20) { contactTalent.exists || noTalent.exists }
        note(contactTalent.exists ? "lyanneurs-cards" : noTalent.exists ? "lyanneurs-empty" : "lyanneurs-pending")
        save(app, "v19-lyanneurs")
        XCTAssertTrue(talents, "Les Lyanneurs ne quittent pas le chargement.")

        app.buttons["Bokantaj"].firstMatch.tap()
        XCTAssertTrue(app.buttons["Carte"].firstMatch.waitForExistence(timeout: 8))
        app.buttons["Carte"].firstMatch.tap()
        let arriving = app.staticTexts["La carte arrive…"].firstMatch
        let basemapFailed = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Fond de carte")).firstMatch
        let shares = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "partages ici")).firstMatch
        _ = shares.waitForExistence(timeout: 8)
        let basemap = waitUntil(app, seconds: 18) { !arriving.exists || basemapFailed.exists }
        note(basemapFailed.exists ? "map-basemap-error" : basemap && !arriving.exists ? "map-basemap-ready" : "map-basemap-stuck")
        save(app, "v19-carte")
        XCTAssertTrue(basemap && !basemapFailed.exists, "Le fond de carte reste sur « La carte arrive… ».")

        app.buttons["Fil"].firstMatch.tap()
        let poster = app.buttons["Lire la vidéo"].firstMatch
        if !poster.waitForExistence(timeout: 4) { app.swipeUp() }
        if poster.waitForExistence(timeout: 6), poster.isHittable {
            poster.tap()
            let playing = app.staticTexts["Lecture en cours"].firstMatch
            let failed = app.staticTexts["La vidéo n’a pas pu être chargée."].firstMatch
            let started = waitUntil(app, seconds: 25) { playing.exists || failed.exists }
            note(playing.exists ? "video-playing" : failed.exists ? "video-failed" : "video-no-frame")
            save(app, "v19-video")
            if playing.exists {
                let pause = app.buttons["Pause"].firstMatch
                if pause.waitForExistence(timeout: 4), pause.isHittable {
                    pause.tap()
                    note(app.staticTexts["Lecture en pause"].firstMatch.waitForExistence(timeout: 4) ? "video-paused" : "video-pause-missing")
                    let resume = app.buttons["Lecture"].firstMatch
                    if resume.waitForExistence(timeout: 3), resume.isHittable {
                        resume.tap()
                        note(playing.waitForExistence(timeout: 4) ? "video-resumed" : "video-resume-missing")
                    }
                }
            }
            XCTAssertTrue(started && playing.exists, "La vidéo iOS ne quitte pas l’image blanche.")
        } else {
            note("video-poster-absent")
            XCTAssertTrue(false, "L’affiche vidéo est absente.")
        }

        let composer = app.buttons["Ouvrir le compositeur"].firstMatch
        if composer.waitForExistence(timeout: 4), composer.isHittable { composer.tap() }
        let photoButton = app.buttons["Photo"].firstMatch
        let photoOther = app.otherElements["Photo"].firstMatch
        var photo = photoButton.exists ? photoButton : photoOther
        let photoReady = waitUntil(app, seconds: 6) {
            photo = photoButton.exists ? photoButton : photoOther
            return photo.exists && photo.isHittable
        }
        if photoReady {
            photo.tap()
            let library = app.buttons["Photothèque"].firstMatch
            let cancel = app.buttons["Annuler"].firstMatch
            if library.waitForExistence(timeout: 5), library.isHittable {
                note("photo-chooser-open")
                library.tap()
                if cancel.waitForExistence(timeout: 6), cancel.isHittable {
                    note("photo-picker-open")
                    save(app, "v19-photo")
                    cancel.tap()
                    note("photo-picker-cancelled")
                } else {
                    note("photo-picker-not-shown")
                    save(app, "v19-photo")
                }
            } else if cancel.waitForExistence(timeout: 2), cancel.isHittable {
                note("photo-picker-open")
                cancel.tap()
                note("photo-picker-cancelled")
                save(app, "v19-photo")
            } else {
                note("photo-picker-not-shown")
                save(app, "v19-photo")
            }
        } else {
            note("photo-control-absent")
        }
        XCTAssertTrue(app.buttons["Photo"].firstMatch.exists, "Le bouton Photo n’est pas exposé.")

        let place = app.buttons["Ajouter une localisation"].firstMatch
        if place.waitForExistence(timeout: 4), place.isHittable {
            place.tap()
            let locate = app.buttons["Me localiser"].firstMatch
            if locate.waitForExistence(timeout: 6), locate.isHittable {
                locate.tap()
                let searching = app.staticTexts["Recherche de votre position…"].firstMatch
                _ = waitUntil(app, seconds: 8) { !searching.exists }
            }
            let zoom = app.buttons["Zoomer"].firstMatch
            if zoom.waitForExistence(timeout: 4), zoom.isHittable { zoom.tap(); note("place-zoom") }
            let quarter = app.buttons["Partager le nom du quartier"].firstMatch
            if quarter.waitForExistence(timeout: 4), quarter.isHittable {
                quarter.tap()
                let shared = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "quartier")).firstMatch
                note(shared.waitForExistence(timeout: 4) ? "place-quarter" : "place-quarter-missing")
            } else {
                note("place-quarter-missing")
            }
            save(app, "v19-place")
            let exactTrigger = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "quartier")).firstMatch
            if exactTrigger.waitForExistence(timeout: 3), exactTrigger.isHittable { exactTrigger.tap() }
            let exact = app.buttons["Partager la localisation précise"].firstMatch
            if exact.waitForExistence(timeout: 4), exact.isHittable {
                exact.tap()
                let precise = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "position exacte")).firstMatch
                note(precise.waitForExistence(timeout: 4) ? "place-exact" : "place-exact-missing")
            }
            app.buttons["Fil"].firstMatch.tap()
            note(app.buttons["Lire la vidéo"].firstMatch.waitForExistence(timeout: 4) ? "place-back-feed" : "place-back-missing")
        } else {
            note("place-trigger-absent")
        }
        let expand = app.buttons["Ouvrir le lecteur"].firstMatch
        if expand.waitForExistence(timeout: 3), expand.isHittable {
            expand.tap()
            note("video-fullscreen")
            save(app, "v19-video-full")
        }
    }

    func testPhotoGpsAndPlayerClose() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.buttons["Bokantaj"].waitForExistence(timeout: 30))
        app.buttons["Bokantaj"].firstMatch.tap()
        let composer = app.buttons["Ouvrir le compositeur"].firstMatch
        XCTAssertTrue(composer.waitForExistence(timeout: 8))
        if composer.isHittable { composer.tap() }

        let photoReady = tapNamed(app, "Photo")
        note(photoReady ? "photo-tapped" : "photo-not-hittable")
        let library = app.buttons["Photothèque"].firstMatch
        if library.waitForExistence(timeout: 5), library.isHittable {
            note("photo-chooser-open")
            library.tap()
            let cancel = app.buttons["Annuler"].firstMatch
            if cancel.waitForExistence(timeout: 8), cancel.isHittable {
                note("photo-picker-open")
                save(app, "v21-photo-library")
                cancel.tap()
                note("photo-picker-cancelled")
            } else {
                note("photo-picker-not-shown")
                save(app, "v21-photo-library")
            }
        } else {
            note("photo-chooser-missing")
            save(app, "v21-photo-chooser")
        }

        if tapNamed(app, "Photo"), library.waitForExistence(timeout: 5), library.isHittable {
            library.tap()
            let cancel = app.buttons["Annuler"].firstMatch
            let cancelEn = app.buttons["Cancel"].firstMatch
            let picker = cancel.waitForExistence(timeout: 8) || cancelEn.waitForExistence(timeout: 2)
            note(picker ? "photo-picker-reopened" : "photo-picker-reopen-missing")
            if picker {
                selectLibraryPhoto(app)
                let stillOpen = app.buttons["Annuler"].firstMatch
                if stillOpen.waitForExistence(timeout: 2), stillOpen.isHittable {
                    note("photo-add-missing")
                    save(app, "v21-photo-picker")
                    stillOpen.tap()
                }
            }
        }
        let preview = app.images["Aperçu de la photo"].firstMatch
        let badge = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "photo(s) jointe")).firstMatch
        let attached = waitUntil(app, seconds: 8) { preview.exists || badge.exists }
        note(attached ? "photo-preview" : "photo-preview-missing")
        save(app, "v21-photo-preview")
        if attached {
            let field = app.textViews.firstMatch
            if field.waitForExistence(timeout: 3) {
                field.tap()
                field.typeText("QA-IOS-V21-PHOTO")
            }
            let publish = app.buttons["Publier"].firstMatch
            if publish.waitForExistence(timeout: 3) {
                if publish.isHittable { publish.tap() } else { publish.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap() }
            }
            note(app.staticTexts["QA-IOS-V21-PHOTO"].firstMatch.waitForExistence(timeout: 20) ? "photo-published" : "photo-publish-missing")
            save(app, "v21-photo-published")
        }

        app.buttons["Bokantaj"].firstMatch.tap()
        dismissKeyboard(app)
        var poster: XCUIElement?
        for _ in 0..<6 {
            poster = hittable(app, "Lire la vidéo")
            if poster != nil { break }
            app.swipeUp()
        }
        if let poster {
            let posters = app.buttons.matching(NSPredicate(format: "label == %@", "Lire la vidéo")).count
            note(posters > 1 ? "video-several" : "video-single")
            poster.tap()
            let playing = app.staticTexts["Lecture en cours"].firstMatch
            note(playing.waitForExistence(timeout: 25) ? "video-playing" : "video-not-playing")
            var expand = hittable(app, "Ouvrir le lecteur")
            if expand == nil {
                scrollPage(app, up: false)
                expand = hittable(app, "Ouvrir le lecteur")
            }
            if let expand {
                expand.tap()
                let close = app.buttons["Fermer le lecteur"].firstMatch
                note(close.waitForExistence(timeout: 4) ? "video-stage" : "video-stage-missing")
                save(app, "v21-video-stage")
                if close.exists, close.isHittable {
                    close.tap()
                    let back = app.buttons["Fil"].firstMatch
                    note(back.waitForExistence(timeout: 4) && back.isHittable && !close.exists ? "video-back-feed" : "video-back-missing")
                    save(app, "v21-video-back")
                    let played = poster.frame
                    var second: XCUIElement?
                    for _ in 0..<4 {
                        let videoButtons = app.buttons.matching(NSPredicate(format: "label == %@", "Lire la vidéo"))
                        let count = min(videoButtons.count, 6)
                        for index in 0..<count {
                            let button = videoButtons.element(boundBy: index)
                            if button.exists, button.isHittable, abs(button.frame.minY - played.minY) > 30 {
                                second = button
                                break
                            }
                        }
                        if second != nil { break }
                        app.swipeUp()
                    }
                    if let second {
                        second.tap()
                        note(app.staticTexts["Lecture en cours"].firstMatch.waitForExistence(timeout: 20) ? "video-second-playing" : "video-second-missing")
                        let inlineClose = app.buttons["Fermer le lecteur"].firstMatch
                        if inlineClose.exists, inlineClose.isHittable { inlineClose.tap() }
                    } else {
                        note("video-second-covered")
                    }
                }
            } else {
                note("video-stage-missing")
            }
        } else {
            note("video-poster-absent")
            save(app, "v21-video-missing")
        }

        openComposer(app)
        publishPlace(app, exact: false, marker: "QA-IOS-V21-QUARTIER")
        app.buttons["Bokantaj"].firstMatch.tap()
        openComposer(app)
        publishPlace(app, exact: true, marker: "QA-IOS-V21-EXACT")
    }

    private func selectLibraryPhoto(_ app: XCUIApplication) {
        let cell = app.cells.firstMatch
        if cell.exists, cell.isHittable {
            cell.tap()
            note("photo-cell")
        } else {
            // The system library grid is visible but its tiles are not buttons.
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.165, dy: 0.433)).tap()
            note("photo-tile-tapped")
        }
        _ = waitUntil(app, seconds: 2) {
            app.buttons["Ajouter"].firstMatch.exists || app.buttons["Add"].firstMatch.exists
        }
        let confirmLabels = ["Ajouter", "Add", "OK", "Terminé", "Done"]
        for label in confirmLabels {
            let button = app.buttons[label].firstMatch
            if button.exists, button.isHittable {
                button.tap()
                note("photo-added")
                return
            }
        }
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.904, dy: 0.122)).tap()
        note("photo-confirm-tapped")
    }

    private func scrollPage(_ app: XCUIApplication, up: Bool) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: up ? 0.78 : 0.42))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: up ? 0.42 : 0.78))
        start.press(forDuration: 0.05, thenDragTo: end)
    }

    private func dismissKeyboard(_ app: XCUIApplication) {
        guard app.keyboards.count > 0 else { return }
        let done = app.keyboards.buttons["retour"].firstMatch
        if done.exists { done.tap() }
    }

    private func openComposer(_ app: XCUIApplication) {
        dismissKeyboard(app)
        app.buttons["Bokantaj"].firstMatch.tap()
        var opener: XCUIElement?
        for _ in 0..<4 {
            app.swipeDown()
            opener = hittable(app, "Ouvrir le compositeur")
            if opener != nil { break }
        }
        guard let opener else { note("composer-missing"); return }
        opener.tap()
    }

    private func hittable(_ app: XCUIApplication, _ label: String) -> XCUIElement? {
        let buttons = app.buttons.matching(NSPredicate(format: "label == %@", label))
        let count = min(buttons.count, 6)
        for index in 0..<count {
            let button = buttons.element(boundBy: index)
            if button.exists, button.isHittable { return button }
        }
        return nil
    }

    private func tapNamed(_ app: XCUIApplication, _ label: String) -> Bool {
        let buttons = app.buttons.matching(NSPredicate(format: "label == %@", label))
        let count = min(buttons.count, 4)
        for index in 0..<count {
            let button = buttons.element(boundBy: index)
            if button.exists, button.isHittable {
                button.tap()
                return true
            }
        }
        return false
    }

    private func publishPlace(_ app: XCUIApplication, exact: Bool, marker: String) {
        var trigger = hittable(app, "Ajouter une localisation")
        for _ in 0..<4 where trigger == nil {
            app.swipeUp()
            trigger = hittable(app, "Ajouter une localisation")
        }
        guard let trigger else {
            note("place-trigger-absent")
            save(app, exact ? "v21-place-exact" : "v21-place-quarter")
            return
        }
        trigger.tap()
        let locate = app.buttons["Me localiser"].firstMatch
        if locate.waitForExistence(timeout: 6), locate.isHittable { locate.tap() }
        let searching = app.staticTexts["Recherche de votre position…"].firstMatch
        _ = waitUntil(app, seconds: 8) { !searching.exists }
        let zoom = app.buttons["Zoomer"].firstMatch
        if zoom.waitForExistence(timeout: 4), zoom.isHittable { zoom.tap() }
        let choiceLabel = exact ? "Partager la localisation précise" : "Partager le nom du quartier"
        var choice = hittable(app, choiceLabel)
        for _ in 0..<5 where choice == nil {
            scrollPage(app, up: true)
            choice = hittable(app, choiceLabel)
        }
        guard let choice else {
            note(exact ? "place-exact-missing" : "place-quarter-missing")
            save(app, exact ? "v21-place-exact" : "v21-place-quarter")
            return
        }
        choice.tap()
        let label = exact ? "position exacte" : "quartier"
        let shared = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", label)).firstMatch
        note(shared.waitForExistence(timeout: 4) ? (exact ? "place-exact" : "place-quarter") : (exact ? "place-exact-missing" : "place-quarter-missing"))
        save(app, exact ? "v21-place-exact" : "v21-place-quarter")
        let field = app.textViews.firstMatch
        if field.waitForExistence(timeout: 3) {
            field.tap()
            field.typeText(marker)
        }
        let publish = app.buttons["Publier"].firstMatch
        if publish.waitForExistence(timeout: 3) {
            if publish.isHittable { publish.tap() } else { publish.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap() }
        }
        note(app.staticTexts[marker].firstMatch.waitForExistence(timeout: 20) ? "published-\(marker)" : "publish-missing-\(marker)")
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
        let email = app.textFields["Adresse email de connexion"]
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline, !email.exists {
            if app.buttons["Se connecter"].firstMatch.isHittable {
                app.buttons["Se connecter"].firstMatch.tap()
            } else if app.links["Se connecter"].firstMatch.isHittable {
                app.links["Se connecter"].firstMatch.tap()
            } else if app.links["Connexion"].firstMatch.isHittable {
                app.links["Connexion"].firstMatch.tap()
            }
            if email.waitForExistence(timeout: 2) { break }
        }
        guard email.exists else {
            note("session-already-present")
            return
        }
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

    private func accountIdentityVisible(_ app: XCUIApplication) -> (email: Bool, name: Bool) {
        let email = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "@lyann.invalid")).firstMatch
        let name = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Qa A")).firstMatch
        let ready = waitUntil(app, seconds: 8) { email.exists || name.exists }
        return (ready && email.exists, ready && name.exists)
    }

    private func sheetIsOpen(_ app: XCUIApplication) -> Bool {
        app.buttons["Modifier mon profil public"].firstMatch.exists
            || app.staticTexts["Formule actuelle"].firstMatch.exists
            || app.staticTexts["Paiements sécurisés"].firstMatch.exists
            || app.staticTexts["Mes missions"].firstMatch.exists
    }

    private func dismissSheet(_ app: XCUIApplication) {
        guard sheetIsOpen(app) else {
            note("sheet-absent")
            return
        }
        let close = app.buttons["Fermer"].firstMatch
        if close.exists, close.isHittable {
            close.tap()
        } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.89, dy: 0.08)).tap()
        }
        let gone = waitUntil(app, seconds: 3) { !sheetIsOpen(app) }
        if !gone {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.89, dy: 0.08)).tap()
        }
        let menu = app.buttons["Fermer le menu"].firstMatch
        if menu.exists, menu.isHittable { menu.tap() }
        note(waitUntil(app, seconds: 2) { !sheetIsOpen(app) } ? "sheet-closed" : "sheet-still-open")
    }

    private func openAccount(_ app: XCUIApplication, shot: String) {
        guard tapIfHittable(app.buttons["Menu Principal"].firstMatch, name: "Menu compte") else { return }
        let account = app.links["Ouvrir Mon compte"].firstMatch
        guard account.waitForExistence(timeout: 4), account.isHittable else {
            note("account-link-missing")
            return
        }
        account.tap()
        let opened = waitUntil(app, seconds: 8) { sheetIsOpen(app) }
        note(opened ? "account-open" : "account-not-open")
        save(app, shot)
    }

    private func visit(_ app: XCUIApplication, _ label: String, _ shot: String, ready: String) {
        guard tapIfHittable(app.buttons[label].firstMatch, name: label) else {
            note("missing-\(label)")
            return
        }
        _ = app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", ready)).firstMatch.waitForExistence(timeout: 12)
        let loading = app.staticTexts["Chargement…"].firstMatch
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
        for label in ["Se connecter", "Valider la connexion", "Profil", "Bokantaj", "Fil", "Carte", "Messages", "Notifications"] {
            let button = app.buttons[label].firstMatch
            guard button.exists else { continue }
            note("button \(label) hittable=\(button.isHittable)")
        }
    }

    private func visibleLabels(_ app: XCUIApplication) -> String {
        ["Profil", "Bokantaj", "Messages", "Se connecter"].compactMap { label in
            app.buttons[label].firstMatch.exists ? label : nil
        }.joined(separator: " | ")
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
