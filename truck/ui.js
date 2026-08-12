// HERE COMES THE TRUCK — ui.js  (VIEW ONLY)
//
// ⚠️ THE TRUCK IS THE INTERFACE. No management screen ever floats above the world: the
// tycoon UI is a clipboard you pick up off the dash, and the shop is a window you slide
// open. Everything here is DOM over the canvas, nothing here owns sim state.
//
// ⚠️ Every price and every reaction is read from sim.priceOf() and D.priceReaction() —
// the same calls the sale itself makes. The readout can never disagree with the till.

import * as D from './data.js';
import * as HP from './hazel-park.js';

const $ = (id) => document.getElementById(id);
const money = (c) => '$' + (c / 100).toFixed(2);
const show = (el, on) => el.classList.toggle('hide', !on);

// The face at the window, in words. Price discovery by face: this tells you you're over
// the street price BEFORE the sale resolves, which is the whole pricing loop.
const TELL = {
  glad: 'already digging in their pocket',
  fine: 'counting it out',
  wince: 'looks at the coins again',
  no: "that's a lot for round here",
};

export class UI {
  constructor(game, hooks) {
    this.g = game; this.h = hooks;
    this.hintT = 0;
    this.clipOpen = false;
    $('menu').onclick = (e) => {
      const b = e.target.closest('button'); if (b && b.dataset.key) this.h.serve(b.dataset.key);
    };
    $('pay').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.change !== undefined) this.h.change(parseInt(b.dataset.change, 10));
      if (b.dataset.act) this.h.act(b.dataset.act);
    };
    $('clip').onclick = (e) => { if (e.target.id === 'clip') this.clipboard(false); };
    $('clipsheet').onclick = (e) => {
      const b = e.target.closest('button');
      if (b && b.dataset.pkey) this.h.price(b.dataset.pkey, parseInt(b.dataset.d, 10));
    };
  }

  hint(text, ms = 4200) {
    $('hinttxt').textContent = text;
    $('hint').classList.add('show');
    this.hintT = ms / 1000;
  }

  // ---- the HUD, every frame -------------------------------------------------
  frame(g, dt) {
    if (this.hintT > 0) { this.hintT -= dt; if (this.hintT <= 0) $('hint').classList.remove('show'); }

    const cold = Math.max(0, g.cold);
    $('coldbar').style.width = (cold * 100).toFixed(1) + '%';
    $('coldtxt').textContent = g.soft() ? 'going soft' : Math.round(cold * 100) + '%';
    $('coldbar').style.background = g.soft() ? 'var(--warm)' : 'var(--cold)';

    const bid = HP.blockAt(g.truck.x, g.truck.z);
    const b = bid ? g.blocks[bid] : null;
    $('blocktxt').textContent = b ? b.id + ' st' : 'between blocks';
    if (b) {
      const a = Math.min(1, b.annoy / D.JINGLE.annoyCold);
      $('annoybar').firstElementChild.style.width = (a * 100).toFixed(0) + '%';
      $('annoytxt').textContent = b.annoy >= D.JINGLE.annoyCold ? 'they stopped coming out'
        : b.annoy >= D.JINGLE.annoyWarn ? 'a window just shut' : 'quiet';
    } else { $('annoybar').firstElementChild.style.width = '0%'; $('annoytxt').textContent = '—'; }

    $('drawertxt').textContent = money(g.drawer);
    const h = Math.floor(g.hour), m = Math.floor((g.hour % 1) * 60);
    $('hourtxt').textContent = `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')}`;

    const lamp = $('songlamp');
    lamp.classList.toggle('on', g.song);
    $('songtxt').textContent = g.song
      ? (g.truck.parked ? 'the song is still playing — and you are parked' : 'the song is playing')
      : 'hold SPACE for the song';

    show($('mirrorwarn'), !!(g.truck.parked && g.mirrorBlocker()));
  }

  setPrompt(text) {
    const p = $('prompt');
    show(p, !!text);
    if (text) p.textContent = text;
  }

  // ---- the window -----------------------------------------------------------
  serve(g) {
    const p = g.serving;
    const panel = $('serve');
    if (!p || !g.windowOpen) { show(panel, false); this._servedId = null; return; }
    show(panel, true);

    if (p.stage === 'ask') {
      show($('pay'), false); show($('menu'), true);
      $('said').textContent = '“' + p.said + '”';
      $('whosaid').textContent = (p.kid ? 'a kid' : 'a grown-up') +
        (p.wrongs ? ' · they are being patient about it' : '') +
        (p.want === null ? '' : '');
      const ceiling = g.blocks[p.block].ceiling;
      $('menu').innerHTML = D.MENU.map((m, i) => {
        const price = g.priceOf(m.key);
        const out = (g.stock[m.key] || 0) <= 0;
        const tell = TELL[D.faceOf(D.priceReaction(ceiling, price))];
        return `<button data-key="${m.key}" class="${out ? 'out' : ''}">
          <span class="k">${i + 1}</span>${m.label}
          <span class="p">${money(price)} · ${out ? 'all gone' : tell}</span></button>`;
      }).join('');

    } else if (p.stage === 'pay') {
      show($('menu'), false); show($('pay'), true);
      const due = D.changeDue(p.tender, p.price);
      $('said').textContent = due === 0 ? '“exactly right.”' : '“here.”';
      $('whosaid').textContent = `they handed you ${money(p.tender)} for ${money(p.price)}`;
      $('pay').innerHTML =
        `<div class="line">that's <b>${money(due)}</b> back.</div>` +
        `<button class="b-ok" data-change="${due}">give ${money(due)} back &nbsp;<small>ENTER</small></button>` +
        // Kyle's call 2026-08-11: shorting is IN, as a deliberate act. Separate button,
        // different colour, never the default, never reachable by a misclick.
        (due >= 25 ? `<button class="b-short" data-change="${due - 25}">keep a quarter back</button>` : '');

    } else if (p.stage === 'short') {
      show($('menu'), false); show($('pay'), true);
      const gap = p.price - p.tender;
      $('said').textContent = '“…”';
      $('whosaid').textContent = `they have ${money(p.tender)}. it's ${money(p.price)}. they are ${money(gap)} short.`;
      $('pay').innerHTML =
        `<div class="line">this one is yours to decide.</div>` +
        `<button class="b-ok" data-act="mercy">let it go &nbsp;<small>ENTER</small></button>` +
        `<button class="b-grey" data-act="refuse">sorry, kid</button>`;
    }
  }

  // ---- the clipboard on the dash --------------------------------------------
  clipboard(on) {
    this.clipOpen = on === undefined ? !this.clipOpen : on;
    show($('clip'), this.clipOpen);
    if (this.clipOpen) this.drawClip();
  }

  drawClip() {
    const g = this.g();
    const rows = D.MENU.map(m => {
      const price = g.priceOf(m.key);
      const cost = m.cost;
      const margin = Math.round((1 - cost / Math.max(1, price)) * 100);
      return `<tr>
        <td>${m.label}</td>
        <td class="r">${g.stock[m.key]} left</td>
        <td class="r">costs you ${money(cost)}</td>
        <td class="r pr"><button data-pkey="${m.key}" data-d="-25">–</button>
          <b>${money(price)}</b>
          <button data-pkey="${m.key}" data-d="25">+</button></td>
        <td class="r">${margin}%</td></tr>`;
    }).join('');

    const blocks = Object.values(g.blocks).map(b =>
      `<tr><td>${b.id} st</td><td class="r">they'll pay up to ${money(b.ceiling)}</td>
       <td class="r">${b.annoy >= D.JINGLE.annoyCold ? 'gone cold on you'
        : b.annoy >= D.JINGLE.annoyWarn ? 'getting tired of it' : 'fine'}</td></tr>`).join('');

    $('clipsheet').innerHTML = `
      <h2>the clipboard</h2>
      <div class="sub">cy's, originally. his handwriting is still on the back.</div>
      <h3>what's in the box</h3>
      <table>${rows}</table>
      <h3>the street</h3>
      <table>${blocks}</table>
      <h3>the note</h3>
      <div class="note">
        ${money(D.ECON.noteAmount)} to the bank every ${D.ECON.noteEveryDays} days.
        day ${g.day}. you have ${money(g.cash)} put by, and ${money(g.drawer)} in the drawer.
        ${g.noteMisses ? `<br>you've missed it ${g.noteMisses} time${g.noteMisses === 1 ? '' : 's'}. they take the good freezer at ${D.ECON.noteGraceMisses}.` : ''}
      </div>
      <div class="note" style="opacity:.5;margin-top:1rem">TAB to put it back on the dash.</div>`;
  }

  // ---- the end of the day ---------------------------------------------------
  // ⚠️ THE LOOP ENDS ON A PERSON, NOT A NUMBER. The tally is there, but the last thing
  // you read is somebody's reply.
  dayEnd(s, g) {
    const why = s.why === 'cold' ? 'the box is empty and the last of it is soup'
      : s.why === 'dusk' ? 'the streetlights came on'
        : 'you called it';
    const reply =
      s.mercy > 0 ? '“my mom says thank you for the other day.”'
        : s.shorted > 0 ? 'somebody counted their change twice tonight, on a porch, in the dark.'
          : s.served === 0 ? 'nobody came out. the song went up and down maple and nobody came out.'
            : s.served > 20 ? '“same time tomorrow?” — the kid with the bike, who did not wait for an answer.'
              : '“you\'re the new one,” she said. it wasn\'t a question.';

    $('endcard').innerHTML = `
      <h2>day ${s.day}</h2>
      <div class="sub">${why}</div>
      <table>
        <tr><td>came out to the kerb</td><td class="r">${s.cameOut}</td></tr>
        <tr><td>served</td><td class="r">${s.served}</td></tr>
        <tr><td>gave up waiting</td><td class="r">${s.walkedOff}</td></tr>
        <tr><td>handed over the wrong thing</td><td class="r">${s.wrong}</td></tr>
        ${s.mercy ? `<tr><td>let it go</td><td class="r">${s.mercy}</td></tr>` : ''}
        ${s.shorted ? `<tr><td>kept the change</td><td class="r">${s.shorted}</td></tr>` : ''}
        <tr class="tot"><td>in the drawer</td><td class="r">${money(s.took)}</td></tr>
      </table>
      ${s.noteDue ? `<div class="note" style="margin-bottom:1rem">
        the note was due. ${s.notePaid
        ? `paid. ${money(D.ECON.noteAmount)} gone, and it didn't hurt as much as last time.`
        : `<b>you couldn't make it.</b> that's ${s.noteMisses} of ${D.ECON.noteGraceMisses}.`}</div>` : ''}
      <div id="reply">${reply}</div>
      <button class="big" id="nextday" style="width:100%">put it away for tonight</button>
      <div class="foot">a DIRTY BOY DEVS game</div>`;
    show($('dayend'), true);
    $('nextday').onclick = () => this.h.nextDay();
  }
}
