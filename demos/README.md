# Battle animation preview

Run `npm run dev`, then open <http://127.0.0.1:5177/demos/battle-fx.html>.

Four silent, code-rendered sequences reuse the game's existing monster illustrations:

- **日冕斩击** — anticipation, dash afterimages, crescent slash, sparks.
- **裂阵重击** — jump, landing compression, ground fracture, flying rubble.
- **星芒爆裂** — charging sigils, traveling energy orb, radial starburst.
- **神格降临** — rotating portal, rising light, dragon reveal, final hold.

Click a sequence to play it once. Space toggles playback outside controls. The
timeline and phase buttons pause on the selected frame. Playback supports 0.5×,
1× and 1.5×; reduced screen shake is optional. OS reduced-motion preferences
start the preview paused. No audio API or voice assets are loaded.

“导出 WebM” records the current sequence at 1600 × 900, nominally 30fps, without
sound. Keep the tab visible while recording, then use the download link. Export
uses native Canvas/MediaRecorder support; unsupported browsers disable the
button. Exported frames contain the animated scene, not the surrounding UI.

`src/battle-vfx.js` contains the deterministic renderer. `getBattleFrame()` and
`renderBattleFrame()` take time in seconds, so export, replay and seeking use the
same timing. The demo does not import the game engine, update saved progress,
alter LP, or replace live combat animations. Damage text is illustrative only.

Run the isolated checks with `node --test tests/battle-vfx.test.mjs`; the normal
`npm test` command also discovers them. Browser QA should cover all four clips,
seeking in both directions, phase buttons, speed, replay, export and viewport
sizes. Pure renderer tests do not substitute for visual/browser testing.
