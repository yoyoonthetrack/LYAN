import re

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# I want to replace everything inside <div class="chat-main-area"> ... </div> for the chatModal.
# The chat-main-area ends before the closing of chat-modal-layout.

start_tag = '<!-- Chat Main Area -->'
end_tag = '</div>\n        </div>\n    </div>\n\n    <!-- ========== MODAL PRESTATAIRE : DEVIS DÉTAILLÉ =========='

# Because regex can be tricky over hundreds of lines, I will manually build the replacement block.
new_chat_main = """<!-- Chat Main Area -->
                <div class="chat-main-area">
                    <!-- HEADER BAR -->
                    <div class="chat-header-bar" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
                        <div class="chat-header-user" style="display: flex; align-items: center; gap: 8px;">
                            <button type="button" class="chat-back-to-contacts-btn" style="display: none;"><i class="ph ph-arrow-left"></i></button>
                            <img src="" alt="Avatar" id="chatHeaderAvatar" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                            <div>
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <strong id="chatHeaderName" style="font-size: 1rem; color: var(--text);">Nom</strong>
                                    <span id="chatDevAiBadge" class="profile-role-badge" style="display: none; background: #6366f1; color: white; padding: 2px 6px; font-size: 0.65rem;">Profil IA</span>
                                </div>
                                <div id="chatMissionContext" style="font-size: 0.8rem; color: var(--primary); font-weight: 700; margin-top: 2px; display: none;">
                                    <!-- Context injected here. Ex: Réparation portail • 80€ -->
                                </div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 8px;" id="chatHeaderActionBtns">
                            <button type="button" class="btn btn-outline" id="chatViewMissionBtn" style="display:none; padding: 6px 12px; font-size: 0.82rem; border-radius: var(--radius-full);">
                                Voir la mission
                            </button>
                        </div>
                    </div>

                    <!-- MESSAGES WRAPPER -->
                    <div class="chat-messages-scroll" id="chatMessagesContainer" style="flex:1; overflow-y:auto; padding: 16px; display: flex; flex-direction: column; gap: 15px;">
                        <!-- Messages dynamically rendered -->
                    </div>

                    <!-- CONTEXTUAL ACTIONS BAR -->
                    <div id="chatContextualActionsBar" style="padding: 10px 16px; display: flex; flex-wrap: wrap; gap: 8px; border-top: 1px solid var(--border-light); background: var(--bg-alt);">
                        <!-- Buttons injected dynamically -->
                    </div>

                    <!-- INPUT AREA -->
                    <div class="chat-input-area" style="padding: 16px; border-top: 1px solid var(--border);">
                        <form id="chatInputForm" style="display: flex; gap: 10px; align-items: flex-end;">
                            <button type="button" class="btn-chat-attach" id="chatAttachBtn" title="Ajouter une pièce jointe"><i class="ph ph-paperclip"></i></button>
                            <textarea id="chatInputField" class="modal-input" placeholder="Écrivez un message..." rows="1" style="flex: 1; resize: none; min-height: 44px; padding-top: 12px;"></textarea>
                            <button type="submit" class="btn-chat-send"><i class="ph-fill ph-paper-plane-right"></i></button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ========== MODAL PRESTATAIRE : DEVIS DÉTAILLÉ =========="""

regex = r'<!-- Chat Main Area -->.*?<!-- ========== MODAL PRESTATAIRE : DEVIS DÉTAILLÉ =========='
content = re.sub(regex, new_chat_main, content, flags=re.DOTALL)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)
