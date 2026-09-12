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

const replacement = `        document.querySelectorAll('.btn-like-flash').forEach(btn => {\n            if (btn.dataset.listenersBound === 'true') return;\n            btn.dataset.listenersBound = 'true';\n            btn.setAttribute('aria-pressed', btn.classList.contains('liked') ? 'true' : 'false');\n\n            btn.addEventListener('click', async () => {\n                const targetId = btn.dataset.targetId;\n                const targetType = btn.dataset.targetType || 'POST';\n                if (!targetId || !window.LYANN_API_CLIENT || btn.dataset.likePending === 'true') return;\n\n                const countSpan = btn.querySelector('.like-count');\n                const heart = btn.querySelector('.ph-heart');\n                const previousLiked = btn.classList.contains('liked');\n                const previousCount = Math.max(0, parseInt((countSpan?.textContent || '0').replace(/[^0-9]/g, ''), 10) || 0);\n                const nextLiked = !previousLiked;\n                const optimisticCount = Math.max(0, previousCount + (nextLiked ? 1 : -1));\n\n                const paintLikeState = (liked, count) => {\n                    btn.classList.toggle('liked', liked);\n                    btn.setAttribute('aria-pressed', liked ? 'true' : 'false');\n                    btn.style.color = liked ? '#E76F51' : '#64748B';\n                    btn.style.background = 'none';\n                    btn.style.border = 'none';\n                    if (heart) heart.style.color = liked ? '#E76F51' : '#94A3B8';\n                    if (countSpan) countSpan.textContent = \\`${'${Math.max(0, Number(count) || 0)}'} J'aime\\`;\n                };\n\n                const matchingPost = currentFlashPosts.find(post => {\n                    if (!post) return false;\n                    return [post.id, post.post_id, post.request_id].some(id => id && String(id) === String(targetId));\n                });\n\n                // OPTIMISTIC UI: paint before network round-trip.\n                paintLikeState(nextLiked, optimisticCount);\n                if (matchingPost) {\n                    matchingPost.user_has_liked = nextLiked;\n                    matchingPost.likes = optimisticCount;\n                }\n                btn.dataset.likePending = 'true';\n\n                try {\n                    const res = await window.LYANN_API_CLIENT.toggleLike(targetId, targetType);\n                    if (!res || typeof res.liked !== 'boolean') throw new Error('Invalid like response');\n                    const serverCount = Number.isFinite(Number(res.likesCount)) ? Number(res.likesCount) : optimisticCount;\n                    paintLikeState(res.liked, serverCount);\n                    if (matchingPost) {\n                        matchingPost.user_has_liked = res.liked;\n                        matchingPost.likes = serverCount;\n                    }\n                    if (window.LYANN_BOKANTAJ_REPOSITORY && typeof window.LYANN_BOKANTAJ_REPOSITORY.invalidate === 'function') {\n                        window.LYANN_BOKANTAJ_REPOSITORY.invalidate();\n                    }\n                } catch (error) {\n                    console.warn('[BOKANTAJ] Like sync failed; reverting optimistic state.', error);\n                    paintLikeState(previousLiked, previousCount);\n                    if (matchingPost) {\n                        matchingPost.user_has_liked = previousLiked;\n                        matchingPost.likes = previousCount;\n                    }\n                } finally {\n                    delete btn.dataset.likePending;\n                }\n            });\n        });\n\n`;

script = script.slice(0, start) + replacement + script.slice(end);
fs.writeFileSync(scriptPath, script, 'utf8');
console.log('Normalized Bokantaj likes to optimistic UI.');
