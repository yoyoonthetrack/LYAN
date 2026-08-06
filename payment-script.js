/**
 * LYANN - Payment, Escrow & Dispute Engine
 * Simulated Local Storage Database & Stripe Connect Orchestrator
 */

(function() {
    // Safe storage wrapper to prevent crashes under file:// when localStorage is disabled or blocked
    const safeStorage = {
        _cache: {},
        getItem(key) {
            try {
                const val = window.localStorage.getItem(key);
                return val;
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
        },
        removeItem(key) {
            try {
                window.localStorage.removeItem(key);
            } catch (e) {
                delete this._cache[key];
            }
        }
    };

    // --------------------------------------------------------------------------
    // 1. INITIALISATION DE LA BASE DE DONNÉES LOCALE (MOCK)
    // --------------------------------------------------------------------------
    const STORAGE_KEY_TX = 'lyann_transactions_db';
    const STORAGE_KEY_CONFIG = 'lyann_payment_config';
    const STORAGE_KEY_WALLET = 'lyann_provider_wallets';

    const DEFAULT_CONFIG = {
        commissionRate: 3.0, // Commission de base (%)
        protectionFee: 4.90  // Tarif fixe de la Protection LYANN en €
    };

    const DEFAULT_WALLETS = {
        // ID 1: David Jean-Baptiste
        1: {
            availableBalance: 320.00,
            pendingBalance: 180.00,
            releasedPayments: 980.00,
            completedPaymentsCount: 5,
            withdrawals: [
                { id: "W-8801", date: "2026-07-28T14:32:00Z", amount: 450.00, status: "completed", iban: "FR76 3000 6000 0001 2345 6789 001" },
                { id: "W-8802", date: "2026-08-01T09:15:00Z", amount: 210.00, status: "completed", iban: "FR76 3000 6000 0001 2345 6789 001" }
            ],
            kycStatus: "verified", // verified, pending, unverified
            stripeAccountId: "acct_1N2yConnectDavid"
        },
        // ID 2: Marie-Line Popotte
        2: {
            availableBalance: 0.00,
            pendingBalance: 720.00,
            releasedPayments: 480.00,
            completedPaymentsCount: 2,
            withdrawals: [],
            kycStatus: "pending",
            stripeAccountId: "acct_1N2yConnectMarie"
        },
        // ID 3: Jean-Michel Télèphe
        3: {
            availableBalance: 120.00,
            pendingBalance: 0.00,
            releasedPayments: 340.00,
            completedPaymentsCount: 2,
            withdrawals: [],
            kycStatus: "unverified",
            stripeAccountId: "acct_1N2yConnectJean"
        }
    };

    const DEFAULT_TRANSACTIONS = [
        {
            id: "TX-9021",
            title: "Installation Clim Inverter & Réglage",
            customerName: "Huguette Élisabeth",
            customerId: 101,
            providerName: "David Jean-Baptiste",
            providerId: 1,
            amount: 450.00,
            commissionRate: 3.0,
            commissionAmount: 13.50,
            protectionFee: 4.90,
            hasProtection: true,
            totalPaid: 468.40,
            status: "en_cours", // en_cours, litige, termine, rembourse
            timestamp: "2026-08-02T10:00:00Z",
            paymentMethod: "Visa ending in 4242",
            requiresMilestones: true,
            milestones: [
                {
                    id: 1,
                    title: "Préparation & Pose de l'unité extérieure",
                    description: "Ancrage des supports muraux, raccordement du compresseur et perçage du béton.",
                    percentage: 30,
                    amount: 135.00,
                    status: "approved", // pending, submitted, approved, rejected
                    completionDate: "2026-08-03",
                    deliverables: "Supports extérieurs fixés de niveau, lignes de fluide passées.",
                    photos: ["https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=400&q=80"]
                },
                {
                    id: 2,
                    title: "Raccordement de l'unité intérieure & Tirage au vide",
                    description: "Fixation du split intérieur, câblage électrique et mise en dépression des tuyaux.",
                    percentage: 40,
                    amount: 180.00,
                    status: "submitted",
                    completionDate: "2026-08-04",
                    deliverables: "Split raccordé, pression vérifiée au mano, tirage au vide de 30 min validé.",
                    photos: ["https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=400&q=80"],
                    comments: "Le tirage au vide s'est fait sans fuite. Prêt pour le raccordement électrique."
                },
                {
                    id: 3,
                    title: "Mise en service & Tests de température",
                    description: "Lancement du gaz réfrigérant, relevé de température en sortie et nettoyage.",
                    percentage: 30,
                    amount: 135.00,
                    status: "pending",
                    completionDate: "2026-08-05",
                    deliverables: "Climatisation soufflant à 17°C, évacuation condensats testée.",
                    photos: []
                }
            ],
            dispute: null
        },
        {
            id: "TX-9022",
            title: "Peinture et Rénovation Salon Créole",
            customerName: "Saint-Louis Marie-Galante",
            customerId: 102,
            providerName: "Marie-Line Popotte",
            providerId: 2,
            amount: 1200.00,
            commissionRate: 3.0,
            commissionAmount: 36.00,
            protectionFee: 4.90,
            hasProtection: true,
            totalPaid: 1240.90,
            status: "litige",
            timestamp: "2026-07-30T09:15:00Z",
            paymentMethod: "Mastercard ending in 9876",
            requiresMilestones: true,
            milestones: [
                {
                    id: 1,
                    title: " Lessivage & Ponçage préparatoire",
                    description: "Préparation des murs, rebouchage des fissures et masquage des plinthes.",
                    percentage: 40,
                    amount: 480.00,
                    status: "approved",
                    completionDate: "2026-07-31",
                    deliverables: "Tous les murs poncés et sains.",
                    photos: ["https://images.unsplash.com/photo-1562259949-e8e7689d7828?auto=format&fit=crop&w=400&q=80"]
                },
                {
                    id: 2,
                    title: "Application de l'enduit & Peinture de finition",
                    description: "2 couches de peinture acrylique anti-humidité et pose des bordures.",
                    percentage: 60,
                    amount: 720.00,
                    status: "rejected",
                    completionDate: "2026-08-02",
                    deliverables: "Double couche appliquée uniformément.",
                    photos: ["https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=400&q=80"],
                    comments: "Peinture terminée. C'est propre et sec."
                }
            ],
            dispute: {
                id: "DISP-4401",
                reporter: "client", // client or provider
                reason: "Qualité non conforme",
                description: "Le client affirme que la peinture s'écaille dans le coin droit à cause de l'humidité et exige que le jalon 2 soit remboursé ou refait entièrement. Le prestataire affirme avoir fait le traitement mais que l'humidité vient du plafond extérieur.",
                status: "open", // open, resolved_client, resolved_provider, resolved_split
                timestamp: "2026-08-03T15:20:00Z",
                evidenceFiles: [
                    { name: "photo_humidite.jpg", uploader: "client", url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=400&q=80" },
                    { name: "facture_peinture_traitement.pdf", uploader: "provider", url: "#" }
                ],
                messages: [
                    { sender: "client", text: "Il y a des cloques énormes sur le mur droit du salon. Le travail de ponçage a été mal fait sur cette partie humide !", time: "2026-08-03T15:22:00Z" },
                    { sender: "provider", text: "J'ai appliqué un traitement anti-humidité spécifique. Le problème vient d'une fuite de gouttière du toit qui s'infiltre. Ce n'est pas dans mon devis peinture !", time: "2026-08-03T16:05:00Z" }
                ]
            }
        },
        {
            id: "TX-9023",
            title: "Entretien Jardin & Élagage Cocotiers",
            customerName: "Sarah Louison",
            customerId: 103,
            providerName: "Jean-Michel Télèphe",
            providerId: 3,
            amount: 150.00,
            commissionRate: 3.0,
            commissionAmount: 4.50,
            protectionFee: 0.00,
            hasProtection: false,
            totalPaid: 154.50,
            status: "termine",
            timestamp: "2026-08-01T16:40:00Z",
            paymentMethod: "Apple Pay (Amex)",
            requiresMilestones: false,
            milestones: [],
            dispute: null
        }
    ];

    // --------------------------------------------------------------------------
    // 2. LOGIQUE D'ACCÈS ET SAUVEGARDE DB
    // --------------------------------------------------------------------------
    window.LYANN_PAYMENTS = {
        getConfig: function() {
            const data = safeStorage.getItem(STORAGE_KEY_CONFIG);
            return data ? JSON.parse(data) : DEFAULT_CONFIG;
        },
        saveConfig: function(config) {
            safeStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
            this.dispatchEvent('config_changed');
        },
        getTransactions: function() {
            const data = safeStorage.getItem(STORAGE_KEY_TX);
            return data ? JSON.parse(data) : DEFAULT_TRANSACTIONS;
        },
        saveTransactions: function(txs) {
            safeStorage.setItem(STORAGE_KEY_TX, JSON.stringify(txs));
            this.dispatchEvent('tx_changed');
        },
        getWallets: function() {
            const data = safeStorage.getItem(STORAGE_KEY_WALLET);
            return data ? JSON.parse(data) : DEFAULT_WALLETS;
        },
        saveWallets: function(wallets) {
            safeStorage.setItem(STORAGE_KEY_WALLET, JSON.stringify(wallets));
            this.dispatchEvent('wallets_changed');
        },

        // Helper event dispatching
        dispatchEvent: function(name) {
            const event = new CustomEvent('lyann_payment_' + name);
            window.dispatchEvent(event);
        },

        // ----------------------------------------------------------------------
        // 3. API METRICS POUR L'ADMINISTRATION
        // ----------------------------------------------------------------------
        getBIReport: function() {
            const txs = this.getTransactions();
            const config = this.getConfig();
            
            let gmv = 0;
            let platformFeeRevenue = 0;
            let protectionRevenue = 0;
            let completedPayouts = 0;
            let pendingEscrowFunds = 0;
            let activeLitigesCount = 0;
            let totalTxs = txs.length;

            const wallets = this.getWallets();
            Object.values(wallets).forEach(w => {
                pendingEscrowFunds += w.pendingBalance;
                w.withdrawals.forEach(withd => {
                    if (withd.status === "completed") {
                        completedPayouts += withd.amount;
                    }
                });
            });

            txs.forEach(t => {
                gmv += t.amount;
                platformFeeRevenue += t.commissionAmount;
                if (t.hasProtection) {
                    protectionRevenue += t.protectionFee;
                }
                if (t.status === "litige") {
                    activeLitigesCount++;
                }
            });

            const refundRate = (txs.filter(t => t.status === "rembourse").length / (totalTxs || 1)) * 100;
            const disputeRate = (txs.filter(t => t.dispute).length / (totalTxs || 1)) * 100;

            return {
                gmv: gmv,
                platformFeeRevenue: platformFeeRevenue,
                protectionRevenue: protectionRevenue,
                totalRevenue: platformFeeRevenue + protectionRevenue,
                averageTransaction: gmv / (totalTxs || 1),
                completedPayments: txs.filter(t => t.status === "termine").length,
                pendingPayments: txs.filter(t => t.status === "en_cours").length,
                payoutVolume: completedPayouts,
                pendingEscrowFunds: pendingEscrowFunds,
                refundRate: refundRate,
                disputeRate: disputeRate,
                activeDisputes: activeLitigesCount,
                topProviders: [
                    { name: "David Jean-Baptiste", amount: 450, count: 1 },
                    { name: "Marie-Line Popotte", amount: 1200, count: 1 },
                    { name: "Jean-Michel Télèphe", amount: 150, count: 1 }
                ]
            };
        },

        // ----------------------------------------------------------------------
        // 4. WORKFLOW TRANSACTIONNEL & ESCROW
        // ----------------------------------------------------------------------
        createServiceRequest: function(data) {
            const txs = this.getTransactions();
            const config = this.getConfig();

            const newTx = {
                id: "TX-" + Math.floor(1000 + Math.random() * 9000),
                title: data.title || "Prestation de Service LYANN",
                customerName: data.customerName || "Habitant Anonyme",
                customerId: data.customerId || 999,
                providerName: data.providerName || "Prestataire Non Assigné",
                providerId: data.providerId || 0,
                amount: 0.00, // Défini par le devis
                commissionRate: config.commissionRate,
                commissionAmount: 0.00,
                protectionFee: config.protectionFee,
                hasProtection: false,
                totalPaid: 0.00,
                status: "devis_attente", // devis_attente, devis_recu, en_cours, litige, termine
                timestamp: new Date().toISOString(),
                paymentMethod: "",
                requiresMilestones: false,
                milestones: [],
                dispute: null,
                requestDetails: {
                    description: data.description,
                    location: data.location || "Guadeloupe",
                    schedule: data.schedule || "Dès que possible",
                    budget: data.budget || "",
                    photos: data.photos || []
                }
            };

            txs.push(newTx);
            this.saveTransactions(txs);

            // Notification de demande de service
            if (window.LYANN_NOTIFICATIONS) {
                window.LYANN_NOTIFICATIONS.sendSMS(
                    '+590690001122', 
                    newTx.providerName, 
                    `Bonjour ${newTx.providerName}, vous avez reçu une demande de service "${newTx.title}" de la part de ${newTx.customerName}. Connectez-vous pour envoyer votre devis.`
                );
            }

            return newTx;
        },

        submitQuotation: function(txId, quoteData) {
            const txs = this.getTransactions();
            const idx = txs.findIndex(t => t.id === txId);
            if (idx === -1) return null;

            const tx = txs[idx];
            tx.amount = quoteData.total;
            tx.commissionAmount = (tx.amount * tx.commissionRate) / 100;
            tx.status = "devis_recu";
            tx.quoteDetails = {
                labour: quoteData.labour,
                travel: quoteData.travel,
                materials: quoteData.materials,
                equipment: quoteData.equipment,
                warranty: quoteData.warranty || "Aucune",
                notes: quoteData.notes || ""
            };

            // Jalons requis si total > 200€
            if (tx.amount > 200) {
                tx.requiresMilestones = true;
                tx.milestones = quoteData.milestones.map((m, i) => ({
                    id: i + 1,
                    title: m.title,
                    description: m.description,
                    percentage: m.percentage,
                    amount: (tx.amount * m.percentage) / 100,
                    status: "pending",
                    completionDate: m.completionDate || "",
                    deliverables: m.deliverables || "",
                    photos: []
                }));
            } else {
                tx.requiresMilestones = false;
                tx.milestones = [];
            }

            txs[idx] = tx;
            this.saveTransactions(txs);

            // Notification de devis envoyé
            if (window.LYANN_NOTIFICATIONS) {
                window.LYANN_NOTIFICATIONS.sendEmail(
                    'client@lyann-dom.com',
                    tx.customerName,
                    '📄 Nouveau devis de prestation reçu sur LYANN',
                    `
                    <p>Le prestataire <strong>${tx.providerName}</strong> a envoyé une proposition de devis de <strong>${tx.amount} €</strong> pour la prestation <strong>"${tx.title}"</strong>.</p>
                    <p>Rendez-vous sur LYANN DOM pour accepter la proposition et bloquer les fonds en séquestre Stripe Connect.</p>
                    `
                );
            }

            return tx;
        },

        approveQuotationAndPay: function(txId, hasProtection, paymentDetails) {
            const txs = this.getTransactions();
            const idx = txs.findIndex(t => t.id === txId);
            if (idx === -1) return null;

            const tx = txs[idx];
            tx.hasProtection = hasProtection;
            tx.protectionFee = hasProtection ? this.getConfig().protectionFee : 0;
            tx.totalPaid = tx.amount + tx.commissionAmount + tx.protectionFee;
            tx.status = "en_cours";
            tx.paymentMethod = paymentDetails.method || "Carte Bancaire";
            tx.timestamp = new Date().toISOString();

            // Placer l'intégralité du solde des jalons dans le solde séquestre
            const wallets = this.getWallets();
            if (wallets[tx.providerId]) {
                wallets[tx.providerId].pendingBalance += tx.amount;
            }
            this.saveWallets(wallets);

            txs[idx] = tx;
            this.saveTransactions(txs);
            this.logSecurityAudit("PAIEMENT_VALIDE", `Paiement sécurisé de ${tx.totalPaid}€ par ${tx.customerName} pour la transaction ${tx.id}.`);

            // Notification de paiement séquestré
            if (window.LYANN_NOTIFICATIONS) {
                window.LYANN_NOTIFICATIONS.sendSMS(
                    '+590690001122',
                    tx.providerName,
                    `Félicitations! Le client ${tx.customerName} a accepté votre devis. Les fonds (${tx.amount} €) sont bloqués en séquestre sécurisé. Vous pouvez démarrer la prestation.`
                );
            }

            return tx;
        },

        submitMilestoneCompletion: function(txId, milestoneId, data) {
            const txs = this.getTransactions();
            const idx = txs.findIndex(t => t.id === txId);
            if (idx === -1) return null;

            const tx = txs[idx];
            const milestone = tx.milestones.find(m => m.id === milestoneId);
            if (milestone) {
                milestone.status = "submitted";
                milestone.completionComments = data.comments;
                milestone.photos = data.photos || [];
                milestone.completionDate = new Date().toISOString().split('T')[0];
            }

            txs[idx] = tx;
            this.saveTransactions(txs);

            // Notification de jalon soumis
            if (window.LYANN_NOTIFICATIONS && milestone) {
                window.LYANN_NOTIFICATIONS.sendEmail(
                    'client@lyann-dom.com',
                    tx.customerName,
                    '✅ Validation de jalon requise sur LYANN DOM',
                    `
                    <p>Le prestataire <strong>${tx.providerName}</strong> a complété le jalon <strong>"${milestone.title}"</strong> (${milestone.amount} €) pour votre projet <strong>"${tx.title}"</strong>.</p>
                    <p><strong>Livrables déclarés :</strong> "${milestone.deliverables || 'Non spécifiés'}"</p>
                    <p>Veuillez inspecter le travail et valider le jalon pour libérer les fonds du séquestre.</p>
                    `
                );
            }

            return tx;
        },

        approveMilestone: function(txId, milestoneId) {
            const txs = this.getTransactions();
            const idx = txs.findIndex(t => t.id === txId);
            if (idx === -1) return null;

            const tx = txs[idx];
            const milestone = tx.milestones.find(m => m.id === milestoneId);
            if (milestone && milestone.status !== "approved") {
                milestone.status = "approved";

                // Libération progressive de la part vers le portefeuille
                const wallets = this.getWallets();
                const providerWallet = wallets[tx.providerId];
                if (providerWallet) {
                    providerWallet.pendingBalance -= milestone.amount;
                    providerWallet.availableBalance += milestone.amount;
                    providerWallet.releasedPayments += milestone.amount;
                }
                this.saveWallets(wallets);

                // Vérifier si tous les jalons sont approuvés pour marquer terminé
                const allApproved = tx.milestones.every(m => m.status === "approved");
                if (allApproved) {
                    tx.status = "termine";
                    if (providerWallet) {
                        providerWallet.completedPaymentsCount++;
                    }
                    this.saveWallets(wallets);
                }
            }

            txs[idx] = tx;
            this.saveTransactions(txs);
            this.logSecurityAudit("JALON_APPROUVE", `Jalon ${milestoneId} de la transaction ${tx.id} approuvé par le client.`);

            // Notification de jalon libéré
            if (window.LYANN_NOTIFICATIONS && milestone) {
                window.LYANN_NOTIFICATIONS.sendSMS(
                    '+590690001122',
                    tx.providerName,
                    `Super! Le jalon "${milestone.title}" a été validé. ${milestone.amount} € ont été libérés vers votre portefeuille Stripe Connect disponible.`
                );
            }

            return tx;
        },

        rejectMilestone: function(txId, milestoneId, comments) {
            const txs = this.getTransactions();
            const idx = txs.findIndex(t => t.id === txId);
            if (idx === -1) return null;

            const tx = txs[idx];
            const milestone = tx.milestones.find(m => m.id === milestoneId);
            if (milestone) {
                milestone.status = "rejected";
                milestone.rejectionComments = comments;
            }

            txs[idx] = tx;
            this.saveTransactions(txs);
            return tx;
        },

        openDispute: function(txId, data) {
            const txs = this.getTransactions();
            const idx = txs.findIndex(t => t.id === txId);
            if (idx === -1) return null;

            const tx = txs[idx];
            tx.status = "litige";
            tx.dispute = {
                id: "DISP-" + Math.floor(4000 + Math.random() * 999),
                reporter: data.reporter || "client",
                reason: data.reason || "Qualité non conforme",
                description: data.description,
                status: "open",
                timestamp: new Date().toISOString(),
                evidenceFiles: data.photos ? data.photos.map(p => ({ name: "preuve_" + Date.now() + ".jpg", uploader: data.reporter, url: p })) : [],
                messages: [
                    { sender: data.reporter, text: data.description, time: new Date().toISOString() }
                ]
            };

            txs[idx] = tx;
            this.saveTransactions(txs);
            this.logSecurityAudit("LITIGE_OUVERT", `Ouverture du litige ${tx.dispute.id} pour la prestation ${tx.id}.`);

            // Notification de litige ouvert
            if (window.LYANN_NOTIFICATIONS) {
                // Notifier les administrateurs médiateurs
                window.LYANN_NOTIFICATIONS.sendEmail(
                    'mediation@lyann-dom.com',
                    'Équipe de Médiation LYANN',
                    `⚠️ Nouveau litige ouvert - ${tx.dispute.id}`,
                    `
                    <p>Un litige a été déclaré sur la prestation <strong>"${tx.title}"</strong> (ID: ${tx.id}).</p>
                    <p><strong>Déclarant :</strong> ${data.reporter === 'client' ? tx.customerName : tx.providerName}</p>
                    <p><strong>Motif :</strong> ${tx.dispute.reason}</p>
                    <p>Veuillez intervenir depuis la Console Admin pour arbitrer l'accord.</p>
                    `
                );
            }

            return tx;
        },

        sendDisputeMessage: function(txId, sender, text) {
            const txs = this.getTransactions();
            const idx = txs.findIndex(t => t.id === txId);
            if (idx === -1) return null;

            const tx = txs[idx];
            if (tx.dispute) {
                tx.dispute.messages.push({
                    sender: sender,
                    text: text,
                    time: new Date().toISOString()
                });
            }

            txs[idx] = tx;
            this.saveTransactions(txs);
            return tx;
        },

        resolveDispute: function(txId, decision) {
            const txs = this.getTransactions();
            const idx = txs.findIndex(t => t.id === txId);
            if (idx === -1) return null;

            const tx = txs[idx];
            if (!tx.dispute) return null;

            const wallets = this.getWallets();
            const providerWallet = wallets[tx.providerId];

            // Récupérer le montant restant en séquestre pour cette transaction
            const totalRemainingEscrow = tx.milestones.reduce((acc, m) => {
                return acc + (m.status !== "approved" ? m.amount : 0);
            }, tx.requiresMilestones ? 0 : tx.amount);

            tx.dispute.status = decision; // resolved_client, resolved_provider, resolved_split

            if (decision === "resolved_client") {
                tx.status = "rembourse";
                if (providerWallet) {
                    providerWallet.pendingBalance = Math.max(0, providerWallet.pendingBalance - totalRemainingEscrow);
                }
                this.logSecurityAudit("LITIGE_RESOLU_CLIENT", `Remboursement intégral de ${totalRemainingEscrow}€ à ${tx.customerName} pour la transaction ${tx.id}.`);
            } else if (decision === "resolved_provider") {
                tx.status = "termine";
                tx.milestones.forEach(m => {
                    if (m.status !== "approved") m.status = "approved";
                });
                if (providerWallet) {
                    providerWallet.pendingBalance = Math.max(0, providerWallet.pendingBalance - totalRemainingEscrow);
                    providerWallet.availableBalance += totalRemainingEscrow;
                    providerWallet.releasedPayments += totalRemainingEscrow;
                    providerWallet.completedPaymentsCount++;
                }
                this.logSecurityAudit("LITIGE_RESOLU_PRESTATAIRE", `Libération des fonds séquestrés de ${totalRemainingEscrow}€ vers le prestataire ${tx.providerName} pour la transaction ${tx.id}.`);
            } else if (decision === "resolved_split") {
                tx.status = "termine";
                const clientPart = totalRemainingEscrow * 0.5;
                const providerPart = totalRemainingEscrow * 0.5;

                if (providerWallet) {
                    providerWallet.pendingBalance = Math.max(0, providerWallet.pendingBalance - totalRemainingEscrow);
                    providerWallet.availableBalance += providerPart;
                    providerWallet.releasedPayments += providerPart;
                }
                this.logSecurityAudit("LITIGE_RESOLU_SPLIT", `Arbitrage 50/50. Client remboursé de ${clientPart}€, prestataire payé de ${providerPart}€.`);
            }

            this.saveWallets(wallets);
            txs[idx] = tx;
            this.saveTransactions(txs);
            return tx;
        },

        // ----------------------------------------------------------------------
        // 5. PORTEFEUILLE & PAYOUTS STRIPE CONNECT
        // ----------------------------------------------------------------------
        requestPayout: function(providerId, amount, iban) {
            const wallets = this.getWallets();
            const w = wallets[providerId];
            if (!w || w.availableBalance < amount || w.kycStatus !== "verified") return null;

            w.availableBalance -= amount;
            const withdrawalId = "W-" + Math.floor(1000 + Math.random() * 9000);
            w.withdrawals.unshift({
                id: withdrawalId,
                date: new Date().toISOString(),
                amount: amount,
                status: "completed",
                iban: iban
            });

            wallets[providerId] = w;
            this.saveWallets(wallets);
            this.logSecurityAudit("VIREMENT_INITIE", `Virement Stripe Connect de ${amount}€ initié vers le compte connecté ${w.stripeAccountId}.`);

            // Notification de virement initié
            if (window.LYANN_NOTIFICATIONS) {
                window.LYANN_NOTIFICATIONS.sendEmail(
                    'prestataire@lyann-dom.com',
                    w.stripeAccountId,
                    '💸 Demande de virement initiée sur LYANN',
                    `
                    <p>Votre virement de <strong>${amount} €</strong> vers votre compte bancaire (IBAN: ${iban}) a bien été transmis aux serveurs Stripe Connect.</p>
                    <p>Les fonds seront disponibles sous 2 à 3 jours ouvrés.</p>
                    `
                );
            }

            return withdrawalId;
        },

        updateKycStatus: function(providerId, status) {
            const wallets = this.getWallets();
            if (wallets[providerId]) {
                wallets[providerId].kycStatus = status;
                this.saveWallets(wallets);
                this.logSecurityAudit("KYC_MIS_A_JOUR", `Statut d'identité du prestataire ${providerId} mis à jour : ${status}.`);
                return true;
            }
            return false;
        },

        // ----------------------------------------------------------------------
        // 6. LOGS D'AUDIT SÉCURITÉ & FRAUDE
        // ----------------------------------------------------------------------
        logSecurityAudit: function(action, details) {
            const logs = JSON.parse(safeStorage.getItem('lyann_security_audit_logs') || '[]');
            logs.unshift({
                timestamp: new Date().toISOString(),
                action: action,
                details: details,
                ipAddress: "192.168.1." + Math.floor(2 + Math.random() * 254),
                userAgent: navigator.userAgent
            });
            safeStorage.setItem('lyann_security_audit_logs', JSON.stringify(logs.slice(0, 100)));
        }
    };

    // Initialisation forcée si localStorage vide
    if (!safeStorage.getItem(STORAGE_KEY_TX)) {
        safeStorage.setItem(STORAGE_KEY_TX, JSON.stringify(DEFAULT_TRANSACTIONS));
    }
    if (!safeStorage.getItem(STORAGE_KEY_CONFIG)) {
        safeStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(DEFAULT_CONFIG));
    }
    if (!safeStorage.getItem(STORAGE_KEY_WALLET)) {
        safeStorage.setItem(STORAGE_KEY_WALLET, JSON.stringify(DEFAULT_WALLETS));
    }
})();
