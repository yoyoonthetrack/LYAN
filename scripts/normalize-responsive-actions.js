const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'script.js');
let script = fs.readFileSync(scriptPath, 'utf8');

const startMarker = "        document.querySelectorAll('.btn-like-flash').forEach(btn => {";
const endMarker = "        // Comments Drawer Toggle & Fetch";
const start = script.indexOf(startMarker);
const end = script.indexOf(endMarker, start);

if (start === -1 || end === -1 || end <= start) {
  throw new Error('Bokantaj like handler markers not found');
}

const existing = script.slice(start, end);
if (existing.includes('OPTIMISTIC UI: paint before network round-trip')) {
  console.log('Bokantaj like interaction already uses optimistic UI.');
  process.exit(0);
}

const replacement = `        document.querySelectorAll('.btn-like-flash').forEach(btn => {
            if (btn.dataset.listenersBound === 'true') return;
            btn.dataset.listenersBound = 'true';
            btn.setAttribute('aria-pressed', btn.classList.contains('liked') ? 'true' : 'false');

            btn.addEventListener('click', async () => {
                const targetId = btn.dataset.targetId;
                const targetType = btn.dataset.targetType || 'POST';
                if (!targetId || !window.LYANN_API_CLIENT || btn.dataset.likePending === 'true') return;

                const countSpan = btn.querySelector('.like-count');
                const heart = btn.querySelector('.ph-heart');
                const previousLiked = btn.classList.contains('liked');
                const previousCount = Math.max(0, parseInt((countSpan?.textContent || '0').replace(/[^0-9]/g, ''), 10) || 0);
                const nextLiked = !previousLiked;
                const optimisticCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));

                const paintLikeState = (liked, count) => {
                    btn.classList.toggle('liked', liked);
                    btn.setAttribute('aria-pressed', liked ? 'true' : 'false');
                    btn.style.color = liked ? '#E76F51' : '#64748B';
                    btn.style.background = 'none';
                    btn.style.border = 'none';
                    if (heart) heart.style.color = liked ? '#E76F51' : '#94A3B8';
                    if (countSpan) countSpan.textContent = String(Math.max(0, Number(count) || 0)) + " J'aime";
                };

                const matchingPost = currentFlashPosts.find(post => {
                    if (!post) return false;
                    return [post.id, post.post_id, post.request_id].some(id => id && String(id) === String(targetId));
                });

                // OPTIMISTIC UI: paint before network round-trip.
                paintLikeState(nextLiked, optimisticCount);
                if (matchingPost) {
                    matchingPost.user_has_liked = nextLiked;
                    matchingPost.likes = optimisticCount;
                }
                btn.dataset.likePending = 'true';

                try {
                    const res = await window.LYANN_API_CLIENT.toggleLike(targetId, targetType);
                    if (!res || typeof res.liked !== 'boolean') throw new Error('Invalid like response');
                    const serverCount = Number.isFinite(Number(res.likesCount)) ? Number(res.likesCount) : optimisticCount;
                    paintLikeState(res.liked, serverCount);
                    if (matchingPost) {
                        matchingPost.user_has_liked = res.liked;
                        matchingPost.likes = serverCount;
                    }
                    if (window.LYANN_BOKANTAJ_REPOSITORY && typeof window.LYANN_BOKANTAJ_REPOSITORY.invalidate === 'function') {
                        window.LYANN_BOKANTAJ_REPOSITORY.invalidate();
                    }
                } catch (error) {
                    console.warn('[BOKANTAJ] Like sync failed; reverting optimistic state.', error);
                    paintLikeState(previousLiked, previousCount);
                    if (matchingPost) {
                        matchingPost.user_has_liked = previousLiked;
                        matchingPost.likes = previousCount;
                    }
                } finally {
                    delete btn.dataset.likePending;
                }
            });
        });

`;

script = script.slice(0, start) + replacement + script.slice(end);
fs.writeFileSync(scriptPath, script, 'utf8');
console.log('Normalized Bokantaj likes to optimistic UI.');
