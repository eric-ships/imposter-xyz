// /home — the signed-in / returning-player face of the home screen.
//
// `/` and `/home` render the same adaptive component: it picks the
// new-visitor or returning-player face from the player's data and
// keeps the URL in sync (returning players settle on /home, new
// visitors on /). Re-exporting keeps both routes on one implementation.
export { default } from "../page";
