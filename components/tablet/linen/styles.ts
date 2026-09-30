// Stylesheet for the Linen tablet display, scoped under .ln-root. Every button sets an
// explicit colour: globals.css makes body text near-white for the landing pages.
export const LINEN_CSS = `
.ln-root { --linen:#f3ede3; --card:#fbf8f2; --ink:#2a2522; --muted:#5e554d; --soft:#6b6158; --line:#ebe3d6;
  --accent:#6f8f6a; --busy:#a4553a; --go:#4f6b4a;
  position:fixed; inset:0; overflow:hidden; background:var(--linen); color:var(--ink);
  font-family:var(--ln-sans), system-ui, sans-serif; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none;
  touch-action:manipulation; -webkit-tap-highlight-color:transparent; }
/* :where() keeps these resets at zero specificity so .ln-serif and friends can override them */
:where(.ln-root, .ln-modal) * { box-sizing:border-box; }
:where(.ln-root, .ln-modal) button { font:inherit; cursor:pointer; -webkit-tap-highlight-color:transparent; }
:where(.ln-root, .ln-modal) button:active:not(:disabled) { transform:scale(0.97); }
.ln-serif { font-family:var(--ln-serif), Georgia, serif; }

.ln-stage { position:absolute; left:50%; top:50%; width:820px; transform-origin:center center; padding:44px 56px;
  display:flex; flex-direction:column; gap:28px; }
.ln-head { display:flex; justify-content:space-between; align-items:baseline; }
.ln-room { font-size:34px; font-weight:600; margin:0; }
.ln-clock { font-size:22px; color:var(--muted); }

.ln-ringwrap { position:relative; height:var(--ring); display:flex; align-items:center; justify-content:center; }
.ln-ringwrap svg { position:absolute; left:calc((708px - var(--ring)) / 2); top:0; width:var(--ring); height:var(--ring); }
.ln-ringwrap circle.fg { transition:stroke-dasharray .6s ease, stroke .4s; }
.ln-status { position:relative; display:flex; flex-direction:column; align-items:center; gap:calc(4px * var(--rs));
  max-width:calc(230px * var(--rs)); text-align:center; }
/* Pin Fraunces' optical size: at display sizes it switches to hairline strokes and the
   crossbar of the 'e' vanishes on the Fire tablets' screens. */
.ln-big { font-weight:400; line-height:1; letter-spacing:-0.03em; font-optical-sizing:none; font-variation-settings:'opsz' 24; }
.ln-sub { font-size:calc(18px * var(--rs)); color:#3d3630; }
.ln-note { font-size:calc(15px * var(--rs)); color:var(--muted); }

.ln-actlabel { font-size:15px; font-weight:600; color:var(--muted); margin-bottom:10px; }
.ln-grid4 { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px; }
.ln-grid3 { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:10px; }
.ln-dur { height:60px; background:var(--ink); color:var(--linen); border:none; border-radius:16px; font-size:21px; }
.ln-dur:disabled { background:transparent; color:#8f8478; border:2px dashed #cbbfae; font-size:17px; cursor:default; }
.ln-near { height:60px; padding:0 14px; background:var(--card); border:1px solid #ddd2c1; border-radius:16px;
  display:flex; flex-direction:column; justify-content:center; gap:2px; overflow:hidden; }
.ln-near b { font-family:var(--ln-serif), Georgia, serif; font-weight:400; font-size:17px; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ln-near span { font-size:13px; color:#4f6b4a; }
.ln-none { height:60px; display:flex; align-items:center; font-size:16px; color:var(--muted); }

.ln-card { flex-grow:1; min-height:0; background:var(--card); border-radius:24px; padding:18px 28px 20px;
  display:flex; flex-direction:column; gap:16px; }
.ln-cardhead { display:flex; justify-content:space-between; align-items:center; }
.ln-nav { display:flex; align-items:center; gap:6px; }
.ln-arrow { width:44px; height:44px; background:transparent; color:var(--ink); border:none; border-radius:12px;
  display:flex; align-items:center; justify-content:center; }
.ln-navlabel { font-size:22px; min-width:200px; text-align:center; }
.ln-segs { display:flex; gap:4px; background:#ece4d7; border-radius:14px; padding:4px; }
.ln-seg { height:44px; padding:0 18px; background:transparent; color:var(--ink); border:none; border-radius:11px; font-size:15px; font-weight:500; }
.ln-seg.on { background:var(--ink); color:var(--linen); font-weight:600; }

.ln-cal { position:relative; height:var(--calh); overflow:hidden; }
.ln-abs { position:absolute; }
.ln-hatch { background:repeating-linear-gradient(-45deg, transparent 0 7px, rgba(42,37,34,0.06) 7px 9px); }
.ln-blk { border-radius:10px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 14px; overflow:hidden; border:none; text-align:left; }
.ln-wkblk { border-radius:6px; padding:3px 6px; font-size:11px; line-height:1.2; overflow:hidden; border:none; text-align:left; }
.ln-wkhead { flex:1; height:44px; background:transparent; color:var(--ink); border:none; border-radius:12px;
  display:flex; align-items:center; justify-content:center; gap:6px; }
.ln-wkhead .n { width:30px; height:30px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:15px; font-weight:600; }
.ln-mcell { border-radius:10px; padding:6px 7px; display:flex; flex-direction:column; align-items:flex-start; justify-content:space-between; color:var(--ink); }
.ln-bars { display:flex; gap:3px; width:100%; }
.ln-bars i { flex:1; height:6px; border-radius:3px; }

.ln-foot { display:flex; justify-content:space-between; align-items:center; min-height:52px; }
.ln-later { height:52px; padding:0 24px; background:var(--go); color:var(--card); border:none; border-radius:14px; font-size:19px; }

.ln-toast { position:fixed; left:50%; top:50%; z-index:40; transform:translate(-50%, -50%) scale(calc(var(--k) * 0.92));
  background:var(--ink); color:var(--linen); padding:28px 44px; border-radius:24px; font-size:30px; max-width:90vw; text-align:center;
  box-shadow:0 18px 50px rgba(42,37,34,0.28); opacity:0; pointer-events:none; transition:opacity .25s, transform .25s; }
.ln-toast.show { opacity:1; transform:translate(-50%, -50%) scale(var(--k)); }
.ln-toast.err { background:var(--busy); }

/* Pop-ups */
.ln-modal { position:fixed; inset:0; z-index:30; background:rgba(42,37,34,0.38); display:flex; align-items:center; justify-content:center;
  overflow:auto; animation:lnFade .2s ease; font-family:var(--ln-sans), system-ui, sans-serif; color:var(--ink);
  --linen:#f3ede3; --card:#fbf8f2; --ink:#2a2522; --muted:#5e554d; --soft:#6b6158; --line:#ebe3d6; --accent:#6f8f6a; --busy:#a4553a; }
.ln-mcard { background:var(--card); border-radius:32px; padding:44px 44px 40px; width:560px; box-shadow:0 24px 60px rgba(42,37,34,0.25);
  transform:scale(var(--k)); animation:lnCard .25s ease; user-select:text; -webkit-user-select:text; }
.ln-mcard.small { width:480px; }
@keyframes lnFade { from { opacity:0 } to { opacity:1 } }
@keyframes lnCard { from { opacity:0; transform:scale(calc(var(--k) * 0.96)) } to { opacity:1; transform:scale(var(--k)) } }
.ln-mhead { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-bottom:24px; }
.ln-mtitle { font-family:var(--ln-serif), Georgia, serif; font-size:34px; font-weight:400; line-height:1.1; letter-spacing:-0.01em; margin:0; }
.ln-msub { font-size:16px; color:var(--muted); margin-top:6px; }
.ln-mx { width:44px; height:44px; flex-shrink:0; border:none; border-radius:50%; background:#ece4d7; color:var(--ink); display:flex; align-items:center; justify-content:center; }
.ln-field { margin-bottom:16px; position:relative; }
.ln-row2 { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:14px; }
.ln-lbl { font-size:15px; color:var(--muted); font-weight:600; display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-bottom:6px; }
.ln-hint { font-size:12px; color:var(--soft); font-weight:500; }
.ln-warn { font-size:12px; color:var(--busy); font-weight:600; }
.ln-inp, .ln-sel { font-size:18px; height:56px; padding:0 18px; border:1.5px solid #ddd2c1; border-radius:16px; outline:none; font-family:inherit;
  width:100%; color:var(--ink); background:#ffffff; transition:border-color .15s; }
.ln-inp:focus, .ln-sel:focus { border-color:var(--ink); }
.ln-inp::placeholder { color:#a39889; }
.ln-sel { flex:1; width:auto; min-width:0; padding:0 30px 0 12px; cursor:pointer; -webkit-appearance:none; appearance:none;
  background:#ffffff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235e554d' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 12px center; }
.ln-reps { display:flex; gap:4px; background:#ece4d7; border-radius:14px; padding:4px; }
.ln-rep { flex:1; height:48px; border:none; border-radius:11px; background:transparent; color:var(--ink); font-size:15px; font-weight:500; }
.ln-rep.on { background:var(--ink); color:var(--linen); font-weight:600; }
.ln-recur { font-size:14px; color:var(--muted); margin:10px 0 12px; display:flex; align-items:center; gap:6px; }
.ln-mactions { display:flex; gap:10px; margin-top:24px; }
.ln-mbtn { height:64px; border-radius:18px; font-size:21px; font-family:var(--ln-serif), Georgia, serif; }
.ln-mcancel { flex:1; background:transparent; border:1.5px solid #ddd2c1; color:var(--ink); }
.ln-mconfirm { flex:2; background:var(--ink); color:var(--linen); border:none; }
.ln-mconfirm:disabled { cursor:default; background:#cbbfae; color:#f3ede3; }
.ln-mdanger { flex:2; background:var(--busy); color:#fbf8f2; border:none; }
.ln-merr { font-size:14px; color:var(--busy); font-weight:500; margin-top:12px; }
.ln-textbtn { display:block; width:100%; margin-top:16px; background:none; border:none; color:var(--busy); font-size:15px; font-weight:600; padding:10px 0; }
.ln-others { background:#f6e3dc; border-radius:16px; padding:14px 18px; margin-bottom:20px; color:#6e2f1c; font-size:14px; line-height:1.5; }
.ln-others b { color:var(--busy); }
.ln-done { text-align:center; padding-top:8px; }
.ln-tick { width:84px; height:84px; margin:0 auto 20px; border-radius:50%; background:var(--accent); color:#ffffff; display:flex; align-items:center; justify-content:center; }
.ln-tick path { stroke-dasharray:30; stroke-dashoffset:30; animation:lnDraw .45s .1s ease forwards; }
@keyframes lnDraw { to { stroke-dashoffset:0 } }
`
