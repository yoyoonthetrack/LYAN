/**
 * LYANN - Client Notification Service (SendGrid & Twilio Orchestrator Client)
 * Handles client-side triggering, simulation, audit logs, and secure API requests.
 */

(function() {
    // Safe storage wrapper to prevent crashes under file:// when localStorage is disabled or blocked
    const safeStorage = {
        _cache: {},
        getItem(key) {
            try {
                return window.localStorage.getItem(key);
            } catch (e) {
                return this._cache[key] || null;
            }
        },
        setItem(key, value) {
            try {
                window.localStorage.setItem(key, value);
            } catch (e) {
                this._cache[key] = String(value);
            }
        }
    };

    const STORAGE_KEY_NOTIFS = 'lyann_notifications_log';

    const NotifService = {
        // Obtenir l'historique des notifications
        getLogs: function() {
            try {
                const data = safeStorage.getItem(STORAGE_KEY_NOTIFS);
                return data ? JSON.parse(data) : [];
            } catch (e) {
                console.error("Erreur de lecture de l'historique des notifications", e);
                return [];
            }
        },

        // Effacer l'historique des notifications
        clearLogs: function() {
            try {
                safeStorage.removeItem(STORAGE_KEY_NOTIFS);
            } catch (e) {
                console.error("Erreur d'effacement de l'historique des notifications", e);
            }
        },

        // Enregistrer une notification dans l'historique
        logNotification: function(recipientName, recipientContact, channel, status, subject, content) {
            const logs = this.getLogs();
            const newLog = {
                id: 'NTF-' + Date.now() + Math.floor(Math.random() * 1000),
                timestamp: new Date().toISOString(),
                recipientName: recipientName,
                recipientContact: recipientContact,
                channel: channel, // 'email' or 'sms'
                status: status, // 'sent' or 'simulated' or 'failed'
                subject: subject || 'Notification automatique',
                content: content
            };

            logs.unshift(newLog);
            
            // Limiter à 100 logs pour la performance
            if (logs.length > 100) logs.pop();
            
            try {
                safeStorage.setItem(STORAGE_KEY_NOTIFS, JSON.stringify(logs));
                // Émettre un événement pour informer la Console Admin en temps réel
                window.dispatchEvent(new CustomEvent('lyann_notification_sent', { detail: newLog }));
            } catch (e) {
                console.error("Erreur d'écriture de la notification", e);
            }

            // Affichage d'un toast informatif
            if (typeof window.showLyanToast === 'function') {
                const icon = channel === 'email' ? '✉️' : '💬';
                window.showLyanToast(`${channel.toUpperCase()} ${status === 'sent' ? 'envoyé' : 'simulé'} pour ${recipientName}`, icon);
            }
        },

        // Envoyer un SMS
        sendSMS: async function(toPhone, toName, message) {
            console.log(`[Notification SMS Twilio] Destinataire: ${toName} (${toPhone}) | Message: "${message}"`);
            
            let status = 'simulated';
            try {
                // Tentative d'appel du serveur backend de production réel
                const response = await fetch('/api/notifications/send-sms', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: toPhone, body: message })
                });

                if (response.ok) {
                    status = 'sent';
                    console.log('✅ SMS transmis avec succès via l\'API Twilio.');
                } else {
                    console.warn('⚠️ Le serveur backend a retourné une erreur de transmission SMS, basculement en mode simulation.');
                }
            } catch (e) {
                // Le backend n'est pas démarré (développement local)
                console.log('ℹ️ Serveur backend injoignable ou en local, SMS traité en simulation locale.');
            }

            this.logNotification(toName, toPhone, 'sms', status, 'Alerte SMS Twilio', message);
        },

        // Envoyer un Email
        sendEmail: async function(toEmail, toName, subject, htmlContent) {
            console.log(`[Notification Email SendGrid] Destinataire: ${toName} (${toEmail}) | Sujet: "${subject}"`);
            
            let status = 'simulated';
            try {
                // Tentative d'appel du serveur backend de production réel
                const response = await fetch('/api/notifications/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ to: toEmail, name: toName, subject: subject, html: htmlContent })
                });

                if (response.ok) {
                    status = 'sent';
                    console.log('✅ E-mail transmis avec succès via l\'API SendGrid.');
                } else {
                    console.warn('⚠️ Le serveur backend a retourné une erreur de transmission Email, basculement en mode simulation.');
                }
            } catch (e) {
                console.log('ℹ️ Serveur backend injoignable ou en local, E-mail traité en simulation locale.');
            }

            this.logNotification(toName, toEmail, 'email', status, subject, htmlContent);
        }
    };

    window.LYANN_NOTIFICATIONS = NotifService;
})();
