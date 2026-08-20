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
    $('pay').onclick = (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.change !== undefined) this.h.change(parseInt(b.dataset.change, 10));
      if (b.dataset.act) this.h.act(b.dataset.act);
    };
    $('clip').onclick = (e) => { if (e.target.id === 'clip') this.clipboard(false); };
    $('baysheet').onclick = (e) => {
      const b = e.target.closest('button.chip'); if (!b) return;
      const { kind, key } = b.dataset;
      if (kind === 'mixins') {
        const i = this.recipe.mixins.indexOf(key);
        if (i >= 0) this.recipe.mixins.splice(i, 1);
        else if (this.recipe.mixins.length < D.CHURN.maxMixins) this.recipe.mixins.push(key);
        else { this.recipe.mixins.shift(); this.recipe.mixins.push(key); }
      } else this.recipe[kind] = key;
      this.drawBay();
    };
    $('clipsheet').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.pkey) this.h.price(b.dataset.pkey, parseInt(b.dataset.d, 10));
      if (b.dataset.buy) this.h.buy(b.dataset.buy);
    };
  }

  // ---- THE CHURN BAY -------------------------------------------------------
  // ⚠️ Every bar here is drawn from D.recipeStats() — the SAME call the sale makes. The
  // four bars you watch while churning cannot lie about what you are making.
  bay(on) {
    this.bayOpen = on === undefined ? !this.bayOpen : on;
    show($('bay'), this.bayOpen);
    if (this.bayOpen) { this.recipe = this.recipe || { base: 'custard', mixins: [], finish: 'none' }; this.drawBay(); }
  }

  drawBay() {
    const g = this.g();
    if (!this.bayOpen) return;
    const r = this.recipe;
    const s = D.recipeStats(r);
    const price = D.suggestedPrice(s);
    const bar = (label, v, max, note) =>
      `<div class="brow"><b>${label}</b><i style="width:${Math.min(100, v / max * 100).toFixed(0)}%"></i>
       <span>${note}</span></div>`;

    const pick = (arr, sel, kind) => arr.map(x => {
      const on = kind === 'mixins' ? r.mixins.includes(x.key) : sel === x.key;
      return `<button class="chip ${on ? 'on' : ''}" data-kind="${kind}" data-key="${x.key}">${x.label}</button>`;
    }).join('');

    const churning = g.churning;
    $('baysheet').innerHTML = `
      <h2>the churn bay</h2>
      <div class="sub">three steps from the seat. it smells like a school kitchen back here.</div>

      <h3>base</h3><div class="chips">${pick(D.BASES, r.base, 'base')}</div>
      <h3>mix-ins <span class="dim">(up to ${D.CHURN.maxMixins})</span></h3>
      <div class="chips">${pick(D.MIXINS, null, 'mixins')}</div>
      <h3>finish</h3><div class="chips">${pick(D.FINISHES, r.finish, 'finish')}</div>

      <h3>what you'd be making</h3>
      <div class="fname">${D.flavourName(r)}${s.legend ? ' <em>— one of cy\'s</em>' : ''}</div>
      <div class="note" style="margin:-.3rem 0 .5rem">${(() => {
        // aimed at whom? The SAME numbers the demand draw uses — aiming is mechanical now.
        const k = D.kidAppeal(s), a = D.adultAppeal(s);
        return k > a * 1.3 ? 'aimed at the kids — they will ask for this over the bars'
          : a > k * 1.3 ? 'aimed at the grown-ups — soft-serve money without the machine'
            : 'aimed at nobody in particular. everyone a little, no one especially.';
      })()}</div>
      ${bar('sweet', s.sweet, 1.2, s.sweet > 0.85 ? 'the kids will lose their minds' : s.sweet > 0.5 ? 'sweet enough' : 'grown-up sweet')}
      ${bar('novel', s.novel, 1.2, s.novel > 0.85 ? "nobody's had this" : s.novel > 0.5 ? 'worth a second look' : 'familiar')}
      ${bar('holds', s.melt, 1.0, s.melt > 0.7 ? 'survives a warm box' : s.melt > 0.45 ? 'holds till teatime' : 'eat it now')}
      <div class="cost">costs you <b>${money(Math.round(s.cost))}</b> ·
        worth about <b>${money(price)}</b> ·
        ${D.ceilingBonus(s) > 0 ? `they'll go <b>${money(D.ceilingBonus(s))}</b> over the street price for it` : 'no premium on this one'}</div>

      ${churning
        ? `<div class="churning">the machine is going — ${Math.max(0, Math.ceil(churning.dur - churning.t))}s
           <div class="cbar"><i style="width:${(churning.t / churning.dur * 100).toFixed(0)}%"></i></div></div>`
        : `<button class="big" id="churnbtn" style="width:100%">churn a batch of ${D.CHURN.batch}
             <small>— ${D.CHURN.seconds}s of the afternoon, and some of the cold</small></button>`}

      ${g.invented.length ? `<h3>you've made</h3><table>${g.invented.map(f =>
      `<tr><td>${f.label}</td><td class="r">${g.stock[f.key] || 0} left</td>
            <td class="r">${money(g.priceOf(f.key))}</td></tr>`).join('')}</table>` : ''}
      <div class="note" style="opacity:.5;margin-top:1rem">B to go back to the seat.</div>`;

    const btn = $('churnbtn');
    if (btn) btn.onclick = () => this.h.churn(this.recipe);
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

    if (this.bayOpen && g.churning) this.drawBay();     // the machine's countdown
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

  /** The standing order line — visible wherever you are while somebody is waiting. */
  setOrder(text) {
    const o = $('order');
    show(o, !!text);
    if (text) o.textContent = text;
  }

  // ---- the window -----------------------------------------------------------
  serve(g) {
    const p = g.serving;
    const panel = $('serve');
    if (!p || !g.windowOpen) { show(panel, false); this._servedId = null; return; }
    show(panel, true);
    // what's in your hands, always visible while somebody is waiting
    $('hands').textContent = g.crew.hands ? 'in your hands: ' + g.labelOf(g.crew.hands) : '';

    if (p.stage === 'ask') {
      // ⚠️ NO MENU BUTTONS. This used to be a row of DOM buttons, which quietly made the
      // whole game a list you click — exactly the "management screen floating above the
      // world" the bible forbids, and it threw away §7's cramped topology. You FETCH what
      // they asked for: walk to the bin, take it, walk back. The panel only carries the
      // order and the face, because those are things you read, not things you press.
      show($('pay'), false); show($('menu'), false);
      // ⚠️ the tell REPLACES the mumble once they've said it — leaving both up made the
      // panel two lines of competing text and you read neither under pressure
      $('said').textContent = p.tell ? '“' + p.tell + '”' : '“' + p.said + '”';
      // ⚠️ THEY KNOW YOUR NAME, so you get to know theirs. A regular is never "a kid".
      $('whosaid').textContent = (p.who || (p.kid ? 'a kid' : 'a grown-up')) +
        (p.qty > 1 ? ' · two of them, the same as always' : '') +
        (p.wrongs ? ' · they are being patient about it' : '');

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
      `<tr><td>${b.id} st</td><td class="r">they'll pay up to ${money(g.ceilingOf(b.id))}</td>
       <td class="r">${b.annoy >= D.JINGLE.annoyCold ? 'gone cold on you'
        : b.annoy >= D.JINGLE.annoyWarn ? 'getting tired of it' : 'fine'}</td></tr>`).join('');

    // CY'S ROUTE SHEET — somebody else's handwriting, doing three jobs at once.
    const sheet = Object.entries(D.ROUTE_SHEET)
      .map(([k, t]) => `<div class="cy">${t}</div>`).join('');

    // THE DEPOT. On the dash, because the truck is the interface — no shop screen.
    const purse = g.cash + g.drawer;
    const shop = D.UPGRADES.map(u => {
      const have = !!g.owned[u.key];
      const can = purse >= u.cost;
      return `<tr><td>${have ? '✓ ' : ''}${u.name}<span class="sub2">${u.sub}</span></td>
        <td class="r">${have ? 'on the truck' : can
          ? `<button data-buy="${u.key}">${money(u.cost)}</button>`
          : `<span class="dim">${money(u.cost)}</span>`}</td></tr>`;
    }).join('');

    // who you know so far
    const folk = D.REGULARS.map(r => {
      const n = g.met[r.id] || 0;
      return `<tr><td>${n ? r.who : '—'}</td><td class="r">${n ? `${n} time${n === 1 ? '' : 's'}` : 'not yet'}</td></tr>`;
    }).join('');

    $('clipsheet').innerHTML = `
      <h2>the clipboard</h2>
      <div class="sub">cy's, originally. his handwriting is still on the back.</div>
      <h3>what's in the box</h3>
      <table>${rows}</table>
      <h3>the depot</h3>
      <table>${shop}</table>
      <h3>the machine</h3>
      <div class="note">${g.grime >= D.SOFTSERVE.refusesAt
        ? '<b>it refuses.</b> shut the window, stand at the spigot, and give it the hour it is owed.'
        : g.grime >= D.SOFTSERVE.tastesOffAt
          ? `grime at ${(g.grime * 100) | 0}%. the cones are starting to taste of yesterday. they can tell.`
          : g.grime >= 0.15 ? `grime at ${(g.grime * 100) | 0}%. fine for now. it won't stay fine.`
            : 'clean. it hums instead of whining.'}</div>
      <h3>the street</h3>
      <table>${blocks}</table>
      <h3>in cy's hand, on the back</h3>
      ${sheet}
      <h3>who's come out</h3>
      <table>${folk}</table>
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
    const wx = D.WEATHER.find(w => w.key === s.weather);
    const why = (s.why === 'cold' ? 'the box is empty and the last of it is soup'
      : s.why === 'dusk' ? 'the streetlights came on'
        : 'you called it') + (wx ? ' · ' + wx.label + ' today' : '');
    // ⚠️ THE LOOP ENDS ON A PERSON, NOT A NUMBER. If you met a regular today, the last
    // thing you read is theirs — and the day you finally do the thing that matters to
    // them, it's the payoff line instead.
    const reg = s.lastRegular ? D.REGULARS.find(r => r.id === s.lastRegular) : null;
    const timesMet = reg ? (s.met[reg.id] || 0) : 0;
    const reply = reg
      ? (timesMet >= D.REGULAR.payoffAt ? reg.payoff : reg.reply)
      : s.mercy > 0 ? '“my mom says thank you for the other day.”'
        : s.shorted > 0 ? 'somebody counted their change twice tonight, on a porch, in the dark.'
          : s.served === 0 ? 'nobody came out. the song went up and down maple and nobody came out.'
            : s.served > 20 ? '“same time tomorrow?” — the kid with the bike, who did not wait for an answer.'
              : '“you\'re the new one,” she said. it wasn\'t a question.';
    const who = reg ? `<div class="who">— ${reg.who}</div>` : '';

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
      <div id="reply">${reply}${who}</div>
      ${this._depotNudge(g)}
      <button class="big" id="nextday" style="width:100%">put it away for tonight</button>
      <div class="foot">a DIRTY BOY DEVS game</div>`;
    show($('dayend'), true);
    $('nextday').onclick = () => this.h.nextDay();
  }

  /** The first thing you can afford, named on the card. Invariant 8: the first meaningful
   *  upgrade has to land inside 45 minutes, and it can't do that if nobody tells you. */
  _depotNudge(g) {
    const purse = g.cash;
    const next = D.UPGRADES.filter(u => !g.owned[u.key]).sort((a, b) => a.cost - b.cost)[0];
    if (!next) return '';
    return purse >= next.cost
      ? `<div class="note" style="margin-bottom:1rem">you can afford <b>${next.name}</b> —
         ${money(next.cost)}. it's on the clipboard, on the dash. <i>${next.sub}.</i></div>`
      : `<div class="note" style="margin-bottom:1rem;opacity:.5">${next.name} is
         ${money(next.cost - purse)} away.</div>`;
  }
}
