const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'script.js');
let script = fs.readFileSync(scriptPath, 'utf8');

if (script.includes('OPTIMISTIC FAVORITE UI: paint before network round-trip')) {
  console.log('Favorite interactions already use optimistic UI.');
  process.exit(0);
}

const startMarker = "            favBtn.style.opacity = '0.5';";
const endMarker = "        // Bind delegator with capture: true on both touchend and click for immediate iOS WebKit response";
const start = script.indexOf(startMarker);
const end = script.indexOf(endMarker, start);

if (start === -1 || end === -1 || end <= start) {
  throw new Error('Favorite action markers not found');
}

const replacement = `            if (favBtn.dataset.favoritePending === 'true') return;

            const previousFavorite = favBtn.classList.contains('is-favorite');
            const nextFavorite = !previousFavorite;

            const paintFavoriteState = (isFavorite) => {
                favBtn.classList.toggle('is-favorite', isFavorite);
                favBtn.style.color = isFavorite ? '#4A7C59' : '#94A3B8';
                favBtn.innerHTML = isFavorite
                    ? '<i class="ph-fill ph-bookmark-simple"></i>'
                    : '<i class="ph ph-bookmark-simple"></i>';
                favBtn.setAttribute('aria-label', isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris');
                favBtn.setAttribute('title', isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris');
                favBtn.setAttribute('aria-pressed', isFavorite ? 'true' : 'false');
            };

            // OPTIMISTIC FAVORITE UI: paint before network round-trip.
            paintFavoriteState(nextFavorite);
            favBtn.dataset.favoritePending = 'true';

            try {
                const res = await window.LyannFavoritesService.toggleFavorite(type, id);

                console.log(\`[FavoriteMutation] operation=\${res.operation || 'UNKNOWN'} table=user_favorites userId=\${currentUserId || 'UNKNOWN'} entityType=\${type} entityId=\${id} result=\${res.success ? 'SUCCESS' : 'ERROR'} errorCode=\${res.errorCode || 'NONE'} errorMessage=\${res.error || 'NONE'} insertedRowId=\${res.data?.id || 'NONE'}\`);

                if (!res.success) {
                    paintFavoriteState(previousFavorite);
                    if (window.NotificationService && typeof window.NotificationService.showToast === 'function') {
                        window.NotificationService.showToast('warning', res.error || "Impossible de modifier vos favoris.");
                    } else if (typeof window.lyannAlert === 'function') {
                        window.lyannAlert(res.error || "Impossible de modifier vos favoris.");
                    }
                    return;
                }

                const serverFavorite = res.operation === 'ADD';
                paintFavoriteState(serverFavorite);

                if (window.NotificationService && typeof window.NotificationService.showToast === 'function') {
                    window.NotificationService.showToast(serverFavorite ? 'success' : 'info', serverFavorite ? 'Ajouté à vos favoris.' : 'Retiré de vos favoris.');
                }

                if (document.getElementById('favSubViewContainer')) {
                    const activeFilter = document.querySelector('.fav-tab-btn.active')?.dataset.favFilter || 'ALL';
                    window.loadAccountFavoritesSubView(activeFilter);
                }
            } catch (err) {
                console.error('[FavoriteTap] Toggle error:', err);
                paintFavoriteState(previousFavorite);
            } finally {
                delete favBtn.dataset.favoritePending;
            }
        }

`;

script = script.slice(0, start) + replacement + script.slice(end);
fs.writeFileSync(scriptPath, script, 'utf8');
console.log('Normalized favorite actions to optimistic UI.');
