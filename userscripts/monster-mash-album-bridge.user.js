// ==UserScript==
// @name         Monster Mash Album Bridge
// @namespace    monster-mash-album-bridge
// @version      1.1.0
// @description  Capture your official Monster Mash album, profile picture, frame and board, plus board-upgrade costs from the MOGO Wiki calculator. Review everything in the Monster Mash Hub before it saves.
// @author       Monster Mash Hub (fan-made)
// @homepageURL  https://milanoomartin.github.io/monstermashhub/#bridge
// @downloadURL  https://milanoomartin.github.io/monstermashhub/userscripts/monster-mash-album-bridge.user.js
// @updateURL    https://milanoomartin.github.io/monstermashhub/userscripts/monster-mash-album-bridge.user.js
// @match        https://www.monopolygo.com/*
// @match        https://monopolygo.wiki/*
// @match        https://milanoomartin.github.io/monstermashhub/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      withbuddies.com
// @connect      cloudfront.net
// @connect      cdn-asset.monopolygo.wiki
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const SETS = [{"id":1,"name":"Community Gallery","color":"#9A5C38","stickers":[{"name":"Woodland Whispers","hubName":"Woodland Whispers","stars":1,"gold":false},{"name":"Kute Krampus","hubName":"Kute Krampus","stars":1,"gold":false},{"name":"Gentlewulf","hubName":"Gentlewulf","stars":1,"gold":false},{"name":"Patchwork","hubName":"Patchwork","stars":1,"gold":false},{"name":"Neck of the Woods","hubName":"Neck of the Woods","stars":1,"gold":false},{"name":"Glam-O-Crow","hubName":"Glam-O-Crow","stars":1,"gold":false},{"name":"Harlequin Queen","hubName":"Harlequin Queen","stars":1,"gold":false},{"name":"Screaming Clown","hubName":"Screaming Clown","stars":1,"gold":false},{"name":"Just a Zombie","hubName":"Just a Zombie","stars":1,"gold":false}]},{"id":2,"name":"Welcome To The Mansion","color":"#E67D2B","stickers":[{"name":"Mystery Mansion","hubName":"Mystery Mansion","stars":1,"gold":false},{"name":"At The Gates","hubName":"At The Gates","stars":1,"gold":false},{"name":"Master Key","hubName":"Master Key","stars":1,"gold":false},{"name":"The Other Side","hubName":"The Other Side","stars":1,"gold":false},{"name":"Hall O' Frame","hubName":"Hall O' Frame","stars":1,"gold":false},{"name":"House Call","hubName":"House Call","stars":1,"gold":false},{"name":"HUNTR/X","hubName":"HUNTR/X","stars":1,"gold":false},{"name":"Ghostly Guide","hubName":"Ghostly Guide","stars":1,"gold":false},{"name":"Places Unknown","hubName":"Places Unknown","stars":1,"gold":false}]},{"id":3,"name":"Dracula","color":"#ED5A69","stickers":[{"name":"Enter Dracula","hubName":"Enter Dracula","stars":1,"gold":false},{"name":"On Reflection","hubName":"On Reflection","stars":1,"gold":false},{"name":"Long in the Tooth","hubName":"Long in the Tooth","stars":1,"gold":false},{"name":"Day in the Sun","hubName":"Day in the Sun","stars":1,"gold":false},{"name":"Down for the Count","hubName":"Down for the Count","stars":1,"gold":false},{"name":"Heart Stopper","hubName":"Heart Stopper","stars":1,"gold":false},{"name":"Cloak Conundrum","hubName":"Cloak Conundrum","stars":2,"gold":false},{"name":"Prince of Darkness","hubName":"Prince of Darkness","stars":2,"gold":false},{"name":"Disco Drac","hubName":"Disco Drac","stars":2,"gold":false}]},{"id":4,"name":"Lurid Labs","color":"#E18D27","stickers":[{"name":"The Laboratory","hubName":"The Laboratory","stars":1,"gold":false},{"name":"Flip the Switch","hubName":"Flip the Switch","stars":1,"gold":false},{"name":"Pet Project","hubName":"Pet Project","stars":1,"gold":false},{"name":"Jealousy & Pride","hubName":"Jealousy & Pride","stars":2,"gold":false},{"name":"Mad for Science","hubName":"Mad for Science","stars":2,"gold":false},{"name":"The Conductor","hubName":"The Conductor","stars":2,"gold":false},{"name":"Ghost Trap","hubName":"Ghost Trap","stars":2,"gold":false},{"name":"Gone Ghoul","hubName":"Gone Ghoul","stars":2,"gold":false},{"name":"Slimed","hubName":"Slimed","stars":2,"gold":false}]},{"id":5,"name":"Grim Gardens","color":"#B045B6","stickers":[{"name":"Ghouly Greens","hubName":"Ghouly Greens","stars":2,"gold":false},{"name":"Ghost Plant","hubName":"Ghost Plant","stars":2,"gold":false},{"name":"Green Thumb","hubName":"Green Thumb","stars":2,"gold":false},{"name":"Creeper Vine","hubName":"Creeper Vine","stars":2,"gold":false},{"name":"Try, Try Again","hubName":"Try, Try Again","stars":2,"gold":false},{"name":"Botanical Bogey","hubName":"Botanical Bogey","stars":2,"gold":false},{"name":"Heady Choices","hubName":"Heady Choices","stars":2,"gold":false},{"name":"Dirt Nap","hubName":"Dirt Nap","stars":2,"gold":false},{"name":"BOO-quet","hubName":"BOO-quet","stars":2,"gold":false}]},{"id":6,"name":"Wolfie","color":"#449595","stickers":[{"name":"Enter Wolfie","hubName":"Enter Wolfie","stars":2,"gold":false},{"name":"Family Pack","hubName":"Family Pack","stars":2,"gold":false},{"name":"Fetch!","hubName":"Fetch!","stars":2,"gold":false},{"name":"I Beg You","hubName":"I Beg You","stars":2,"gold":false},{"name":"Beast in Show","hubName":"Beast in Show","stars":2,"gold":false},{"name":"Call of the Wild","hubName":"Call of the Wild","stars":2,"gold":false},{"name":"Fine Canines","hubName":"Fine Canines","stars":2,"gold":false},{"name":"Howl N' Prowl","hubName":"Howl N' Prowl","stars":2,"gold":false},{"name":"Luna's Flea Bath","hubName":"Luna's Flea Bath","stars":2,"gold":false}]},{"id":7,"name":"Sleepless Night","color":"#4F8261","stickers":[{"name":"Blighted Bedroom","hubName":"Blighted Bedroom","stars":2,"gold":false},{"name":"Ghost Story","hubName":"Ghost Story","stars":2,"gold":false},{"name":"Clowned","hubName":"Clowned","stars":2,"gold":false},{"name":"Demonic Disguise","hubName":"Demonic Disguise","stars":2,"gold":false},{"name":"Going Batty","hubName":"Going Batty","stars":2,"gold":false},{"name":"Safety First","hubName":"Safety First","stars":2,"gold":false},{"name":"Chair Raising","hubName":"Chair Raising","stars":2,"gold":false},{"name":"Mystery Solved","hubName":"Mystery Solved","stars":3,"gold":false},{"name":"Boogey Boo!","hubName":"Boogey Boo!","stars":3,"gold":false}]},{"id":8,"name":"Ms. Frankenstein","color":"#9E84B9","stickers":[{"name":"Enter Undead Diva","hubName":"Enter Undead Diva","stars":2,"gold":false},{"name":"Study Buddy","hubName":"Study Buddy","stars":2,"gold":false},{"name":"Inspiration Strikes!","hubName":"Inspiration Strikes!","stars":2,"gold":false},{"name":"Made for This","hubName":"Made for This","stars":2,"gold":false},{"name":"Thunderhead","hubName":"Thunderhead","stars":2,"gold":false},{"name":"Stormy Skies","hubName":"Stormy Skies","stars":2,"gold":false},{"name":"At First Sight","hubName":"At First Sight","stars":3,"gold":false},{"name":"Strike a Pose","hubName":"Strike a Pose","stars":3,"gold":false},{"name":"I Do!","hubName":"I Do!","stars":3,"gold":false}]},{"id":9,"name":"Halloween Games","color":"#438147","stickers":[{"name":"Game On!","hubName":"Game On!","stars":2,"gold":false},{"name":"Takedown","hubName":"Takedown","stars":2,"gold":false},{"name":"Nice Bob!","hubName":"Nice Bob!","stars":2,"gold":false},{"name":"Stuck in Limbo","hubName":"Stuck in Limbo","stars":2,"gold":false},{"name":"Feet of Strength","hubName":"Feet of Strength","stars":3,"gold":false},{"name":"Sugar Rush","hubName":"Sugar Rush","stars":3,"gold":false},{"name":"Deadly Aim","hubName":"Deadly Aim","stars":3,"gold":false},{"name":"The Ringer","hubName":"The Ringer","stars":3,"gold":false},{"name":"Snack Attack","hubName":"Snack Attack","stars":3,"gold":false}]},{"id":10,"name":"The Mummy","color":"#E5A008","stickers":[{"name":"Enter Rags","hubName":"Enter Rags","stars":2,"gold":false},{"name":"Bugging Out","hubName":"Bugging Out","stars":2,"gold":false},{"name":"Curses!","hubName":"Curses!","stars":3,"gold":false},{"name":"Pyramid Scheme","hubName":"Pyramid Scheme","stars":3,"gold":false},{"name":"That's a Wrap!","hubName":"That's a Wrap!","stars":3,"gold":false},{"name":"Cryptic","hubName":"Cryptic","stars":3,"gold":false},{"name":"Preserves","hubName":"Preserves","stars":3,"gold":false},{"name":"Tomb Boy","hubName":"Tomb Boy","stars":3,"gold":false},{"name":"Walk This Way","hubName":"Walk This Way","stars":3,"gold":false}]},{"id":11,"name":"The Swamp Monster","color":"#9C543F","stickers":[{"name":"Enter Swampie","hubName":"Enter Swampie","stars":2,"gold":false},{"name":"Ugly Muckling","hubName":"Ugly Muckling","stars":3,"gold":false},{"name":"Swamp Hang","hubName":"Swamp Hang","stars":3,"gold":false},{"name":"Marsh Mellow","hubName":"Marsh Mellow","stars":3,"gold":false},{"name":"Top Underling","hubName":"Top Underling","stars":3,"gold":false},{"name":"Swamped","hubName":"Swamped","stars":3,"gold":false},{"name":"Exit Strategy","hubName":"Exit Strategy","stars":3,"gold":false},{"name":"Swampie","hubName":"Swampie","stars":3,"gold":false},{"name":"Boggy Nights","hubName":"Boggy Nights","stars":4,"gold":false}]},{"id":12,"name":"Evil Deeds","color":"#5F5FAB","stickers":[{"name":"Witchy Wood","hubName":"Witchy Wood","stars":3,"gold":false},{"name":"Unamusement Park","hubName":"Unamusement Park","stars":3,"gold":false},{"name":"Soggy Bayou","hubName":"Soggy Bayou","stars":3,"gold":false},{"name":"Shrieking Shores","hubName":"Shrieking Shores","stars":3,"gold":false},{"name":"550 Central Park West","hubName":"550 Central Park West","stars":3,"gold":false},{"name":"MGO Mausoleum","hubName":"MGO Mausoleum","stars":3,"gold":false},{"name":"The Demon World","hubName":"The Demon World","stars":3,"gold":false},{"name":"Cabin in the Woods","hubName":"Cabin in the Woods","stars":4,"gold":false},{"name":"Dracula's Castle","hubName":"Dracula's Castle","stars":4,"gold":false}]},{"id":13,"name":"The Zombie","color":"#7C854B","stickers":[{"name":"Enter Shambles","hubName":"Enter Shambles","stars":3,"gold":false},{"name":"Early Riser","hubName":"Early Riser","stars":3,"gold":false},{"name":"Brain Rot","hubName":"Brain Rot","stars":3,"gold":false},{"name":"Brain Food","hubName":"Brain Food","stars":3,"gold":false},{"name":"A Beautiful Mind","hubName":"A Beautiful Mind","stars":3,"gold":false},{"name":"Brainiac","hubName":"Brainiac","stars":3,"gold":false},{"name":"One Man's Trash","hubName":"One Man's Trash","stars":4,"gold":false},{"name":"Fresh to Death","hubName":"Fresh to Death","stars":4,"gold":false},{"name":"Bashful Monster","hubName":"Bashful Monster","stars":4,"gold":true}]},{"id":14,"name":"The Ghost","color":"#4E97D9","stickers":[{"name":"Enter Godfrey","hubName":"Enter Godfrey","stars":3,"gold":false},{"name":"King of Swing","hubName":"King of Swing","stars":3,"gold":false},{"name":"Sing Along","hubName":"Sing Along","stars":3,"gold":false},{"name":"Creepy Cameo","hubName":"Creepy Cameo","stars":3,"gold":false},{"name":"Fridge Raider","hubName":"Fridge Raider","stars":3,"gold":false},{"name":"Chilling","hubName":"Chilling","stars":4,"gold":false},{"name":"Clear Reading","hubName":"Clear Reading","stars":4,"gold":false},{"name":"Fudged","hubName":"Fudged","stars":4,"gold":true},{"name":"Thrown Off","hubName":"Thrown Off","stars":5,"gold":false}]},{"id":15,"name":"The Witch","color":"#58A97B","stickers":[{"name":"Enter Hexie","hubName":"Enter Hexie","stars":3,"gold":false},{"name":"Familiar Face","hubName":"Familiar Face","stars":3,"gold":false},{"name":"Miss Spelled","hubName":"Miss Spelled","stars":3,"gold":false},{"name":"At Your Service","hubName":"At Your Service","stars":4,"gold":false},{"name":"Monstrous Mix-Ins","hubName":"Monstrous Mix-Ins","stars":4,"gold":false},{"name":"Hat Trick","hubName":"Hat Trick","stars":4,"gold":false},{"name":"Buckle Up","hubName":"Buckle Up","stars":4,"gold":true},{"name":"Witching Hour","hubName":"Witching Hour","stars":5,"gold":false},{"name":"Stir Crazy","hubName":"Stir Crazy","stars":5,"gold":false}]},{"id":16,"name":"Ghastly Garage","color":"#A56AB0","stickers":[{"name":"The Lock-Up","hubName":"The Lock-Up","stars":3,"gold":false},{"name":"Stay Golden","hubName":"Stay Golden","stars":3,"gold":false},{"name":"Wolfie Wagon","hubName":"Wolfie Wagon","stars":4,"gold":false},{"name":"Rags' Roadster","hubName":"Rags' Roadster","stars":4,"gold":false},{"name":"Long-Term Parking","hubName":"Long-Term Parking","stars":4,"gold":false},{"name":"Franken-Coach","hubName":"Franken-Coach","stars":4,"gold":false},{"name":"High Beams","hubName":"High Beams","stars":4,"gold":true},{"name":"Drac's Dragster","hubName":"Drac's Dragster","stars":5,"gold":false},{"name":"Ecto-1","hubName":"Ecto-1","stars":5,"gold":true}]},{"id":17,"name":"Boogie Bash","color":"#C54A67","stickers":[{"name":"DJ Spinner","hubName":"DJ Spinner","stars":4,"gold":false},{"name":"Dance Idols","hubName":"Dance Idols","stars":4,"gold":false},{"name":"Do The Worm","hubName":"Do The Worm","stars":4,"gold":false},{"name":"Shredding","hubName":"Shredding","stars":4,"gold":false},{"name":"Electric BOO-galoo","hubName":"Electric BOO-galoo","stars":4,"gold":true},{"name":"Wall Flowers","hubName":"Wall Flowers","stars":4,"gold":true},{"name":"Punchline","hubName":"Punchline","stars":5,"gold":false},{"name":"To Be Free","hubName":"To Be Free","stars":5,"gold":true},{"name":"Monster Mosh","hubName":"Monster Mosh","stars":6,"gold":false}]},{"id":18,"name":"The Attic","color":"#4C62A7","stickers":[{"name":"Up the Hatch","hubName":"Up the Hatch","stars":4,"gold":false},{"name":"Derpy Statue","hubName":"Derpy Statue","stars":4,"gold":false},{"name":"Ghostly Glow","hubName":"Ghostly Glow","stars":4,"gold":false},{"name":"Be a Doll","hubName":"Be a Doll","stars":4,"gold":true},{"name":"Mr. Mannequin","hubName":"Mr. Mannequin","stars":4,"gold":true},{"name":"Miss Mary","hubName":"Miss Mary","stars":5,"gold":false},{"name":"Hats Off to Ya","hubName":"Hats Off to Ya","stars":5,"gold":false},{"name":"The Watcher","hubName":"The Watcher","stars":5,"gold":true},{"name":"Tea Time","hubName":"Tea Time","stars":6,"gold":false}]},{"id":19,"name":"Trick Or Treat","color":"#DC6C2A","stickers":[{"name":"Hit the Streets","hubName":"Hit the Streets","stars":4,"gold":false},{"name":"Sweet!","hubName":"Sweet!","stars":4,"gold":false},{"name":"Chief Suspect","hubName":"Chief Suspect","stars":4,"gold":true},{"name":"Seen a Ghost?","hubName":"Seen a Ghost?","stars":4,"gold":true},{"name":"Snack Run","hubName":"Snack Run","stars":5,"gold":false},{"name":"Adorned","hubName":"Adorned","stars":5,"gold":false},{"name":"Triple Treat","hubName":"Triple Treat","stars":5,"gold":true},{"name":"Fit Check","hubName":"Fit Check","stars":5,"gold":true},{"name":"All Haul-O's Eve","hubName":"All Haul-O's Eve","stars":6,"gold":false}]},{"id":20,"name":"Frankie Fun","color":"#55C3B7","stickers":[{"name":"Enter Frankie","hubName":"Enter Frankie","stars":4,"gold":false},{"name":"Compact","hubName":"Compact","stars":4,"gold":true},{"name":"Body Builder","hubName":"Body Builder","stars":4,"gold":true},{"name":"Unstoppable","hubName":"Unstoppable","stars":5,"gold":false},{"name":"Key To Happiness","hubName":"Key To Happiness","stars":5,"gold":false},{"name":"Like a Glove","hubName":"Like a Glove","stars":5,"gold":false},{"name":"The Groom","hubName":"The Groom","stars":5,"gold":true},{"name":"Self Made Man","hubName":"Self Made Man","stars":5,"gold":true},{"name":"Supportive","hubName":"Supportive","stars":6,"gold":false}]},{"id":21,"name":"Who You Gonna Call?","color":"#965750","stickers":[{"name":"Shh!","hubName":"Shh!","stars":4,"gold":false},{"name":"Off the Charts","hubName":"Off the Charts","stars":4,"gold":true},{"name":"The Pole Works!","hubName":"The Pole Works!","stars":4,"gold":true},{"name":"Goo Crew","hubName":"Goo Crew","stars":5,"gold":false},{"name":"We Have the Tools","hubName":"We Have the Tools","stars":5,"gold":false},{"name":"Terrace Terror","hubName":"Terrace Terror","stars":5,"gold":true},{"name":"S'more Heat","hubName":"S'more Heat","stars":5,"gold":true},{"name":"I Love This Town!","hubName":"I Love This Town!","stars":5,"gold":true},{"name":"Big Town Heroes","hubName":"Big Town Heroes","stars":6,"gold":false}]},{"id":22,"name":"Demons & Hunters","color":"#DB3D77","stickers":[{"name":"How It's Done","hubName":"How It's Done","stars":4,"gold":true},{"name":"Golden","hubName":"Golden","stars":4,"gold":true},{"name":"Newcomers","hubName":"Newcomers","stars":5,"gold":false},{"name":"Easy on the Eyes","hubName":"Easy on the Eyes","stars":5,"gold":false},{"name":"Soda Pop","hubName":"Soda Pop","stars":5,"gold":true},{"name":"Hello, Friend","hubName":"Hello, Friend","stars":5,"gold":true},{"name":"Torn","hubName":"Torn","stars":5,"gold":true},{"name":"Voices Strong","hubName":"Voices Strong","stars":5,"gold":true},{"name":"Couch! Couch! Couch!","hubName":"Couch! Couch! Couch!","alt":["Cough! Cough! Cough!"],"stars":6,"gold":false}]}];
  const CARDS = SETS.flatMap(s => s.stickers.map((c, n) => ({...c, i:(s.id-1)*9+n, setId:s.id, n:n+1, key:`s${s.id}_${n+1}`, id:`SpookyAlbum.${s.id}.${n+1}`})));
  const HUB = 'https://milanoomartin.github.io/monstermashhub/';
  const OFFICIAL = 'https://www.monopolygo.com/sticker-album';
  const KEY = 'mmab.pending.v1', BACKUP = 'mmab.undo.v1', LINKS = 'mmab.links.v1', EXTRAS = 'mmab.extras.v1';
  const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version) || '1.1.0';
  const isHub = location.origin === 'https://milanoomartin.github.io';
  const isWiki = location.hostname === 'monopolygo.wiki';
  const CALC_PATH = '/mogo-tools/board-upgrade-calculator';
  const page = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  const names = c => [c.name, c.hubName, ...(c.alt || [])];
  const norm = s => String(s || '').normalize('NFKC').trim().toLocaleLowerCase('en-US').replace(/\s+/g,' ');
  const stickerNorm = s => norm(s).replace(/[’‘]/g,"'").replace(/[^a-z0-9]/g,'');
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const validCount = n => Number.isSafeInteger(n) && n >= 0 && n <= 999999;
  const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const currentName = () => [...document.querySelectorAll('[data-testid="user-name"]')].map(e=>e.textContent.trim()).filter(Boolean);
  function sourceAvailable(){ return !isHub && location.pathname.replace(/\/$/,'') === '/sticker-album'; }
  function readAlbum(doc=document) {
    const names = [...doc.querySelectorAll('[data-testid="user-name"]')].map(e=>e.textContent.trim()).filter(Boolean);
    if (!names.length || new Set(names.map(norm)).size !== 1) throw Error('Sign in to MONOPOLY GO and wait for your player name to appear.');
    const records = new Map();
    const cards = doc.querySelectorAll('[data-sticker-card-context="album"]');
    if (!cards.length) throw Error('The album has not loaded. Wait for the sets, then try again.');
    for (const el of cards) {
      const testid = el.getAttribute('data-testid') || '';
      const m = testid.match(/(SpookyAlbum\.(\d+)\.(\d+))$/);
      if (!m) throw Error('This page contains a different album or an unrecognized sticker. Only Monster Mash is supported.');
      const i = (+m[2]-1)*9+(+m[3]-1), expected = CARDS[i];
      if (!expected || +m[2] < 1 || +m[2] > 22 || +m[3] < 1 || +m[3] > 9) throw Error('Unsupported set or sticker position. Nothing was captured.');
      const missing = el.querySelector('[class*="_sticker-card-missing-name_"]');
      const title = missing || el.querySelector('[class*="_sticker-card-ribbon-name_"]');
      if (!title || !names(expected).some(n=>stickerNorm(n)===stickerNorm(title.textContent))) throw Error(`Sticker name did not match set ${m[2]}, position ${m[3]}. Use the official site in English and reload.`);
      const ownedImage = el.querySelector('img[class*="_sticker-card-image_"]');
      const badges = [...el.querySelectorAll('[class*="_sticker-card-count_"]')];
      let count;
      if (missing) {
        if (ownedImage || badges.length) throw Error(`Conflicting missing/owned markers for ${expected.name}. Reload the album.`);
        count = 0;
      } else {
        if (!ownedImage || badges.length > 1) throw Error(`Cannot verify ownership of ${expected.name}. Reload the album.`);
        count = 1;
        if (badges.length) {
          const text = badges[0].textContent.trim();
          if (!/^\+\d+$/.test(text)) throw Error(`Cannot read duplicates for ${expected.name}.`);
          count = Number(text.slice(1))+1;
        }
      }
      if (!validCount(count)) throw Error(`Invalid count for ${expected.name}.`);
      if (records.has(i) && records.get(i) !== count) throw Error('The page contains conflicting album copies. Reload and capture again.');
      records.set(i,count);
    }
    if (records.size !== 198) throw Error(`Only ${records.size}/198 stickers are loaded. Open the full album, clear any filters, scroll through the sets, and try again. Missing data is never treated as zero.`);
    return {name:names[0],counts:CARDS.map(c=>records.get(c.i))};
  }
  function validateSnapshot(s) {
    if (!s || s.version!==1 || s.albumId!=='SpookyAlbum' || typeof s.id!=='string' || typeof s.name!=='string' || !s.name.trim() || s.name.length>150 || !Number.isFinite(s.capturedAt) || s.capturedAt>Date.now()+60000 || !Array.isArray(s.counts) || s.counts.length!==198 || !s.counts.every(validCount)) throw Error('The pending capture is invalid. Capture the full official album again.');
    if (s.photo != null && !validPhoto(s.photo)) delete s.photo;
    return s;
  }
  function stats(counts, goldDouble=true) {
    return {have:counts.filter(n=>n>0).length,missing:counts.filter(n=>n===0).length,copies:counts.reduce((a,b)=>a+b,0),duplicates:counts.reduce((a,b)=>a+Math.max(b-1,0),0),albumStars:CARDS.reduce((a,c)=>a+(counts[c.i]>0?c.stars:0),0),copyStars:CARDS.reduce((a,c)=>a+counts[c.i]*c.stars,0),vaultStars:CARDS.reduce((a,c)=>a+Math.max(counts[c.i]-1,0)*c.stars*(c.gold&&goldDouble?2:1),0),sets:SETS.filter(s=>counts.slice((s.id-1)*9,s.id*9).every(n=>n>0)).length};
  }
  function hubApi() {
    const mm=page.MM;
    if (!mm?.S?.st || typeof mm.applyCounts!=='function' || typeof mm.S.saveNow!=='function' || !Array.isArray(mm.ALL) || mm.ALL.length!==198) throw Error('The Hub is still loading or its format has changed. Sign in and wait for the album, then open Album Bridge again.');
    if (mm.S.frozen) throw Error('Exit the Hub tutorial before importing.');
    for(const c of CARDS) {
      const h=mm.ALL[c.i];
      if(h.i!==c.i || h.setId!==c.setId || h.n!==c.n || h.stars!==c.stars || !!h.gold!==c.gold || !names(c).some(n=>stickerNorm(n)===stickerNorm(h.name))) throw Error(`The Hub catalog differs at set ${c.setId}, sticker ${c.n}. Update Album Bridge before importing.`);
    }
    if (mm.Cloud?.pulling || (mm.Cloud?.configured && (!mm.Cloud.user || !mm.Cloud.loaded))) throw Error('Sign in to the Hub and wait for cloud sync to finish, then reopen this review.');
    return mm;
  }
  const ownAccounts = mm => mm.S.st.accounts.filter(a=>a.owner==='own' && !String(a.id).startsWith('cl_'));
  function matchAccount(accounts, name, links) {
    const exact=accounts.filter(a=>norm(a.name)===norm(name));
    if(exact.length===1) return {id:exact[0].id,reason:'Matched by account name'};
    if(exact.length>1) return {id:'',reason:'More than one account has this name. Select the correct account.'};
    const linked=accounts.find(a=>a.id===links?.[norm(name)]);
    return linked ? {id:linked.id,reason:'Using your previously confirmed account link'} : {id:'',reason:'No name match. Select your account below, or add it in the Hub first.'};
  }
  function toPage(value){return typeof cloneInto==='function' ? cloneInto(value,page) : value;}
  function applyToHub(mm, aid, next, baseline) {
    const a=ownAccounts(mm).find(x=>x.id===aid);
    if(!a) throw Error('The selected account is no longer editable.');
    const current=Array.from(mm.S.st.counts[aid]||[]);
    if(!equal(current,baseline)) throw Error('This account changed while you were reviewing. Close and reopen the review to compare the latest counts.');
    const persisted=JSON.parse(localStorage.getItem('mmx-state-v1')||'null');
    if(!equal(persisted?.counts?.[aid],baseline)) throw Error('The saved account changed in another tab or is still saving. Reopen the review after the Hub finishes saving.');
    if(next.length!==198 || !next.every(validCount)) throw Error('Every total must be a whole number from 0 to 999999.');
    const changes=next.flatMap((c,i)=>c!==current[i]?[{aid,i,c}]:[]);
    if(!changes.length) return 0;
    mm.applyCounts(toPage(changes),toPage({label:'Official album import',source:'import',celebrate:false}));
    mm.S.saveNow();
    const saved=JSON.parse(localStorage.getItem('mmx-state-v1')||'null');
    if(!equal(saved?.counts?.[aid],next)) throw Error('The Hub did not persist the update. Check browser storage. Your undo backup is retained.');
    return changes.length;
  }

  /* ---------- pictures: fetch official art through Tampermonkey, redraw it on a canvas ---------- */
  const PHOTO_RE = /^data:image\/(?:webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/;
  function validPhoto(s){return typeof s==='string'&&s.length<400000&&PHOTO_RE.test(s);}
  function withTimeout(p,ms){return Promise.race([p,new Promise((_,reject)=>setTimeout(()=>reject(Error('Timed out.')),ms))]);}
  function gmBlob(url){
    return new Promise((resolve,reject)=>{
      if(typeof GM_xmlhttpRequest!=='function')return reject(Error('Image access is not granted.'));
      GM_xmlhttpRequest({method:'GET',url,responseType:'blob',timeout:15000,
        onload:r=>r.status>=200&&r.status<300&&r.response?resolve(r.response):reject(Error(`Image request failed (${r.status}).`)),
        onerror:()=>reject(Error('Image request failed.')),ontimeout:()=>reject(Error('Image request timed out.'))});
    });
  }
  async function bitmap(url){
    const blob=await gmBlob(url);
    if(typeof createImageBitmap==='function')return createImageBitmap(blob);
    const u=URL.createObjectURL(blob);
    try{return await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Unreadable image.'));im.src=u;});}
    finally{setTimeout(()=>URL.revokeObjectURL(u),5000);}
  }
  function encode(canvas){const out=canvas.toDataURL('image/webp',0.86);return out.startsWith('data:image/webp')?out:canvas.toDataURL('image/png');}
  const tidy = s => String(s||'').replace(/\s+/g,' ').trim();
  /** The largest visible profile picture on the page (the sidebar copy is hidden on phones). */
  const profileWrapper = (root=document) => [...root.querySelectorAll('[data-testid="profile-image-wrapper"]')].sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width)[0]||null;
  /** Redraws picture, frame and decal exactly as the official site lays them out (measured live) into a 256 px square. */
  async function composeProfile(wrapper){
    if(!wrapper)throw Error('Profile picture not found.');
    const all=[...wrapper.querySelectorAll('img.profilePicture, img.profileFrame, img.profileFrameDecal')].map((el,order)=>({el,order,src:el.currentSrc||el.src,r:el.getBoundingClientRect(),cs:getComputedStyle(el)})).filter(l=>/^https:\/\//.test(l.src));
    const pic=all.find(l=>l.el.classList.contains('profilePicture'));
    if(!pic)throw Error('Profile picture not loaded yet.');
    const N=256,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');
    const layers=all.filter(l=>l.r.width>0&&l.r.height>0&&l.cs.display!=='none'&&l.cs.visibility!=='hidden');
    if(!layers.includes(pic)){ // not laid out (hidden sidebar): plain round crop of the photo
      const im=await bitmap(pic.src),s=Math.min(im.width,im.height);
      g.beginPath();g.arc(N/2,N/2,N/2,0,Math.PI*2);g.clip();g.drawImage(im,(im.width-s)/2,(im.height-s)/2,s,s,0,0,N,N);
      return encode(c);
    }
    const L=Math.min(...layers.map(l=>l.r.left)),T=Math.min(...layers.map(l=>l.r.top)),R=Math.max(...layers.map(l=>l.r.right)),B=Math.max(...layers.map(l=>l.r.bottom));
    const scale=N/Math.max(R-L,B-T),ox=(N-(R-L)*scale)/2,oy=(N-(B-T)*scale)/2;
    layers.sort((a,b)=>((parseInt(a.cs.zIndex,10)||0)-(parseInt(b.cs.zIndex,10)||0))||a.order-b.order);
    for(const l of layers){
      let im;
      try{im=await bitmap(l.src);}catch(e){if(l===pic)throw e;continue;}
      const dx=ox+(l.r.left-L)*scale,dy=oy+(l.r.top-T)*scale,dw=l.r.width*scale,dh=l.r.height*scale,iw=im.width,ih=im.height;
      let sx=0,sy=0,sw=iw,sh=ih,tx=dx,ty=dy,tw=dw,th=dh;
      const fit=l.cs.objectFit;
      if(fit==='cover'){const s=Math.max(dw/iw,dh/ih);sw=dw/s;sh=dh/s;sx=(iw-sw)/2;sy=(ih-sh)/2;}
      else if(fit==='contain'||fit==='scale-down'){const s=Math.min(dw/iw,dh/ih,fit==='scale-down'?scale:Infinity);tw=iw*s;th=ih*s;tx=dx+(dw-tw)/2;ty=dy+(dh-th)/2;}
      g.save();g.globalAlpha=Math.max(0,Math.min(1,parseFloat(l.cs.opacity)||1));
      const rad=l.cs.borderTopLeftRadius||'0',rv=rad.endsWith('%')?parseFloat(rad)/100*Math.min(dw,dh):(parseFloat(rad)||0)*scale;
      if(rv>0){g.beginPath();if(g.roundRect)g.roundRect(dx,dy,dw,dh,Math.min(rv,dw/2,dh/2));else g.arc(dx+dw/2,dy+dh/2,Math.min(dw,dh)/2,0,Math.PI*2);g.clip();}
      g.drawImage(im,sx,sy,sw,sh,tx,ty,tw,th);g.restore();
      if(im.close)im.close();
    }
    return encode(c);
  }

  /* ---------- where are we? ---------- */
  function sourceKind(){
    if(isHub)return 'hub';
    if(isWiki)return location.pathname.replace(/\/$/,'')===CALC_PATH?'wiki':'';
    const p=location.pathname.replace(/\/$/,'');
    return p==='/sticker-album'?'album':p==='/tycoon-profile'?'profile':'';
  }

  /* ---------- official Tycoon profile: name, level, board, picture, skins ---------- */
  const skinLabel = n => /token/i.test(n)?'Tokens':/shield/i.test(n)?'Shields':/dice/i.test(n)?'Dice skins':tidy(String(n).replace(/_/g,' '));
  function readTycoon(){
    const card=document.querySelector('[class*="SocialCardWrapper"]');
    if(!card)throw Error('Your Tycoon card has not loaded yet. Sign in and wait for the PROFILE page to finish loading.');
    const name=tidy(card.querySelector('[class*="SocialCardUsername"]')?.textContent)||currentName()[0]||'';
    if(!name)throw Error('Sign in so your player name appears on the card.');
    const level=tidy(card.querySelector('[class*="ProfileLevel"]')?.textContent).replace(/[^\d,]/g,'').slice(0,15);
    const data=card.querySelector('[class*="BoardData"]');
    const boardName=tidy(data?.querySelector('[class*="BoardName"]')?.textContent).slice(0,60);
    const mapText=[...(data?.querySelectorAll('span')||[])].map(s=>tidy(s.textContent)).find(t=>/^#\d{1,6}$/.test(t));
    const boardImg=card.querySelector('[class*="BoardImage"] img')?.src||'';
    const skins=[...card.querySelectorAll('[class*="SocialCardSkinImage"]')].slice(0,6).map(el=>{const im=el.querySelector('img');return {name:tidy(im?.alt).slice(0,60),img:/^https:\/\//.test(im?.src||'')?im.src:'',count:Number(tidy(el.querySelector('[class*="SocialCardCounter"]')?.textContent).replace(/\D/g,''))||0};});
    const activity=tidy(card.querySelector('[class*="LastActivityDescription"]')?.textContent).slice(0,120);
    return {name:name.slice(0,60),level,board:{name:boardName,map:mapText?Number(mapText.slice(1)):0,img:/^https:\/\//.test(boardImg)?boardImg:''},skins,activity,wrapper:profileWrapper(card)};
  }

  /* ---------- MOGO Wiki board calculator: watch the costs the page itself loads ---------- */
  const calcCache=new Map();let lastCalc=null;
  function hookWiki(){
    if(!isWiki)return;
    const original=page.fetch;
    if(typeof original!=='function'||original.__mmab)return;
    const hooked=function(input,init){
      const p=original.apply(this,arguments);
      try{
        const url=typeof input==='string'?input:(input&&input.url)||'';
        if(/\/board_costs\/calculate(?:\?|$)/.test(url)){
          const body=init&&typeof init.body==='string'?init.body:'';
          p.then(r=>r.clone().text()).then(t=>onCalc(t,body)).catch(()=>{});
        }
      }catch{}
      return p;
    };
    try{hooked.__mmab=true;page.fetch=typeof exportFunction==='function'?exportFunction(hooked,page):hooked;}catch{}
  }
  function onCalc(text,reqBody){
    let j,req={};
    try{j=JSON.parse(text);}catch{return;}
    try{req=JSON.parse(reqBody||'{}')||{};}catch{}
    if(!j||!Number.isSafeInteger(j.map_number)||j.map_number<1||!j.board||typeof j.board.board_key!=='string'||!Array.isArray(j.landmarks)||!j.landmarks.length||j.landmarks.length>8)return;
    const id=j.map_number+'|'+j.board.board_key,prev=calcCache.get(id);
    // the wiki may leave out prices for levels already built, so merge every response seen for this board
    const landmarks=j.landmarks.map((l,k)=>{
      const costs=(prev?.landmarks[k]?.costs||[]).slice();
      (l.costs||[]).forEach(c=>{if(Number.isInteger(c.upgrade_index)&&c.upgrade_index>=0&&c.upgrade_index<6&&Number.isFinite(c.cost)&&c.cost>0)costs[c.upgrade_index]=c.cost;});
      return {key:/^[\w-]{1,40}$/.test(l.landmark_key||'')?l.landmark_key:'landmark_'+(k+1),level:Math.max(0,Math.min(6,l.current_level|0)),costs};
    });
    lastCalc={map:j.map_number,key:j.board.board_key.slice(0,60),name:tidy(j.board.name||j.board.board_key).slice(0,60),art:String(j.board.art_key||''),group:String(j.group_key||req.group_key||'').slice(0,60),rollEv:+(j.economy&&j.economy.roll_ev)||0,totalRolls:+(j.economy&&j.economy.total_rolls)||0,landmarks,at:Date.now()};
    calcCache.set(id,lastCalc);
    refreshLauncher();
    if(view&&viewKind==='wiki')wikiView();
  }
  function wikiImages(){
    const srcs=[...document.images].map(i=>i.currentSrc||i.src);
    const lm=srcs.find(s=>/^https:\/\/cdn-asset\.monopolygo\.wiki\/[\w/.-]+_Landmark_\d{2}_\d{2}\.png$/.test(s));
    const maq=srcs.find(s=>/^https:\/\/cdn-asset\.monopolygo\.wiki\/[\w/.-]+_Maquette\.png$/.test(s));
    return {imgBase:lm?lm.replace(/_Landmark_\d{2}_\d{2}\.png$/,''):'',maquette:maq||''};
  }
  const priced = l => Array.from({length:6},(_,i)=>l.costs[i]).every(n=>Number.isFinite(n)&&n>0); // Array.from: .every() alone skips holes
  function boardPayload(){
    const c=lastCalc;
    if(!c)throw Error('Press CALCULATE on the wiki first so the Bridge can see your board costs.');
    if(!c.landmarks.every(priced))throw Error('Some prices are hidden because those levels are already built. Tap level 0 on each landmark (the wiki recalculates), then set your real levels again and send.');
    const im=wikiImages(),art=c.art.toLowerCase(),ok=!!art&&im.imgBase.toLowerCase().endsWith('/'+art);
    return {version:1,id:crypto.randomUUID(),kind:'board',capturedAt:Date.now(),map:c.map,key:c.key,name:c.name,group:c.group,rollEv:c.rollEv,totalRolls:c.totalRolls,
      bash:new URLSearchParams(location.search).get('builders_bash')==='1',
      landmarks:c.landmarks.map(l=>({key:l.key,level:l.level,costs:l.costs.slice()})),
      imgBase:ok?im.imgBase:'',maquette:ok&&im.maquette.toLowerCase().includes('/'+art+'_maquette')?im.maquette:''};
  }
  const short = n => {const a=Math.abs(n),u=a>=1e12?[1e12,'T']:a>=1e9?[1e9,'B']:a>=1e6?[1e6,'M']:a>=1e3?[1e3,'K']:[1,''];return (+(n/u[0]).toFixed(2))+u[1];};

  /* ---------- profile & board captures wait here until the Hub reviews them ---------- */
  const tagOf = x => x.kind+'|'+norm(x.kind==='board'?x.map+'|'+x.key:x.name);
  async function extras(){const list=await GM_getValue(EXTRAS,[]);return Array.isArray(list)?list.filter(x=>x&&typeof x.id==='string'):[];}
  async function pushExtra(item){const list=(await extras()).filter(x=>tagOf(x)!==tagOf(item));list.push(item);await GM_setValue(EXTRAS,list.slice(-8));}
  async function dropExtra(id){await GM_setValue(EXTRAS,(await extras()).filter(x=>x.id!==id));}
  const offered=new Set();
  const hubBridge=()=>{const b=page.MM&&page.MM.Bridge;return b&&b.version>=2?b:null;};
  /** Hands pending captures to the Hub's own review screen (it answers with mm-bridge-done). */
  async function offerExtras(force=false){
    if(!isHub||view||!hubBridge())return 0;
    let n=0;
    for(const item of await extras()){
      if(!force&&offered.has(item.id))continue;
      offered.add(item.id);n++;
      window.dispatchEvent(new CustomEvent('mm-bridge-offer',{detail:JSON.stringify(item)}));
    }
    return n;
  }
  if(isHub)window.addEventListener('mm-bridge-done',e=>{let d;try{d=JSON.parse(e.detail);}catch{return;}if(d&&typeof d.id==='string')dropExtra(d.id).then(refreshLauncher).catch(()=>{});});

  async function refreshLauncher(){
    if(!launcher)return;
    if(isHub){
      const pending=await GM_getValue(KEY,null),n=(pending?1:0)+(await extras()).length;
      launcher.textContent=n?`✦ Album Bridge · ${n} to review`:'✦ Album Bridge';
      return;
    }
    const kind=sourceKind();
    launcher.hidden=!kind;
    launcher.textContent=kind==='profile'?'✦ Send profile to Hub':kind==='wiki'?(lastCalc?'✦ Send board to Hub ●':'✦ Send board to Hub'):'✦ Album Bridge';
  }

  const CSS = `
    [hidden]{display:none!important}
    :host{all:initial;font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif;color:#f5f3ff;color-scheme:dark}*{box-sizing:border-box}button,input,select{font:inherit}button,a,input,select{touch-action:manipulation}button,a{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #58ead3;outline-offset:3px}button{border:1px solid #625876;border-radius:10px;padding:10px 15px;background:#312941;color:#fff;font-weight:650}button:hover{background:#493860}button:disabled{opacity:.45;cursor:not-allowed}button.primary{background:#a4f06a;color:#15220c;border-color:#a4f06a}button.danger{background:#552735;border-color:#a54664}a{color:#78e4dd}input,select{color:#fff;background:#181420;border:1px solid #6b5d7a;border-radius:8px;padding:9px}label{display:block}h1,h2,h3,p{margin:0}h1{font-size:28px;line-height:1.15;letter-spacing:-.6px}h2{font-size:21px}h3{font-size:16px}.muted{color:#c0b6cf;font-size:13px}.tag{color:#b9f78b;text-transform:uppercase;font-size:11px;font-weight:800;letter-spacing:1.8px;margin-bottom:6px}.launcher{position:fixed;top:90px;right:18px;z-index:2147483646;box-shadow:0 5px 22px #0008;background:#21152f;border:1px solid #b986ef;border-radius:25px;user-select:none;touch-action:none}.backdrop{position:fixed;inset:0;z-index:2147483647;background:#090612c9;display:flex;align-items:center;justify-content:center;padding:20px}.panel{width:min(1420px,100%);height:min(94vh,1100px);background:#171220;border:1px solid #5c466f;border-radius:22px;box-shadow:0 24px 100px #000b;display:flex;flex-direction:column;overflow:hidden}.top{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:22px 26px;background:linear-gradient(110deg,#30203f,#191624);border-bottom:1px solid #453452}.top .close{font-size:24px;padding:0 10px;background:transparent}.body{overflow:auto;padding:22px 26px;flex:1}.foot{padding:15px 26px;display:flex;flex-wrap:wrap;gap:10px;align-items:center;border-top:1px solid #493856;background:#21182e}.spacer{flex:1}.notice{padding:13px 16px;border:1px solid #6e567e;border-radius:12px;background:#30223c;margin:14px 0}.notice:empty{display:none}.notice.error{border-color:#eb8da0;color:#ffd9df;background:#421e2b}.notice.good{border-color:#75b56d;color:#d8ffd3;background:#1c3226}.account{display:grid;grid-template-columns:1fr 36px 1fr;gap:12px;align-items:center;background:#231b30;border:1px solid #4e3c60;border-radius:14px;padding:17px}.account strong{font-size:22px;display:block}.account select{width:100%;margin-top:5px}.account .arrow{font-size:25px;color:#a4f06a;text-align:center}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0}.metric{background:#251d31;border:1px solid #443452;border-radius:13px;padding:13px 15px}.metric b{font-size:25px;display:block;color:#e2f8c9}.metric span{font-size:12px;color:#c8bed4}.metric .old{font-size:15px;color:#a89bb8;font-weight:500}.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:20px 0}.controls select{max-width:260px}.controls input{flex:1;min-width:150px}.sets{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.set{background:#201928;border:1px solid #493853;border-radius:18px;overflow:hidden;scroll-margin-top:12px}.sethead{padding:14px 16px;border-top:4px solid var(--set-color,#9f77cf);display:flex;justify-content:space-between;gap:8px;align-items:center}.grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:0 12px 14px}.sticker{min-width:0;border:1px solid #51445e;border-radius:12px;background:#2b2336;padding:10px;position:relative}.sticker.changed{border-color:#b3e790;box-shadow:inset 0 0 0 1px #b3e79033}.sticker.missing{background:#191620}.sticker.gold .stars{color:#ffd778}.sticker.excluded{opacity:.6}.art{height:125px;display:flex;align-items:center;justify-content:center;margin:4px 0}.art img{width:100%;height:100%;object-fit:contain}.art .placeholder{font-size:50px;color:#705c8b}.sticker.missing .art{filter:grayscale(.8);opacity:.45}.name{font-size:12px;line-height:1.3;min-height:32px;text-align:center;font-weight:700;overflow-wrap:anywhere}.stars{text-align:center;color:#c6b7db;letter-spacing:1px;font-size:12px}.state{text-align:center;margin:6px 0;font-weight:700;font-size:12px;color:#b9f78b}.missing .state{color:#f6b0bc}.before{text-align:center;font-size:11px;color:#b6a9c4}.edit{display:none;gap:5px;align-items:center;justify-content:center;margin-top:9px}.editing .edit{display:flex}.edit input[type=number]{width:72px;min-width:0;padding:5px;text-align:center}.edit button{padding:3px 8px}.include{display:none;font-size:11px;text-align:center;margin-top:7px}.editing .include{display:block}.include input{vertical-align:middle}.chips{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.chips span{border-radius:20px;padding:7px 12px;background:#372943;font-size:13px}.empty{text-align:center;color:#c9bed5;padding:40px}.help{max-width:850px;margin:auto}.help p{margin:14px 0}.help li{margin:10px 0}.small{font-size:12px}.mode{color:#b9f78b;font-size:13px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}.edited{position:absolute;top:5px;right:5px;background:#705298;border-radius:5px;padding:2px 4px;font-size:9px}.identity-check{margin-top:12px}.identity-check input{margin-right:8px}.sticker[hidden],.set[hidden]{display:none!important}.photo-mini{width:44px;height:44px;vertical-align:middle;margin-right:8px;object-fit:contain}.pf{display:flex;gap:14px;align-items:center}.pf-photo{width:88px;height:88px;flex:0 0 88px;display:grid;place-items:center;border-radius:16px;background:#2b2336}.pf-photo img{width:88px;height:88px;object-fit:contain}.pf strong,.pf span{display:block}.help ol{padding-left:22px}.metric b.text{font-size:19px}
    @media(min-width:1150px){.sets{grid-template-columns:repeat(3,minmax(0,1fr))}.art{height:112px}}
    @media(max-width:700px){.backdrop{padding:0}.panel{height:100dvh;max-height:100dvh;border-radius:0}.top,.body,.foot{padding:14px}.top h1{font-size:23px}.sets{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.metric b{font-size:22px}.account{grid-template-columns:1fr}.account .arrow{display:none}.foot button{flex:1}.foot .muted{width:100%}.art{height:118px}.launcher{top:78px;right:10px}}
  `;
  let host,root,launcher,view=null,viewKind='',review=null,sourceSnapshot=null,busy=false,lastAuto='',previousFocus;
  function mount(){
    if(host)return;
    host=document.createElement('div');host.id='mm-album-bridge';root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>${CSS}</style><button class="launcher" title="Open Album Bridge. Drag to move. Alt+Shift+M toggles.">✦ Album Bridge</button>`;
    document.documentElement.append(host);launcher=root.querySelector('.launcher');launcher.onclick=()=>{if(!launcher._dragged)open();};
    let start=null;
    launcher.addEventListener('pointerdown',e=>{if(e.button!==0)return;start={x:e.clientX,y:e.clientY,left:launcher.getBoundingClientRect().left,top:launcher.getBoundingClientRect().top};launcher._dragged=false;launcher.setPointerCapture(e.pointerId);});
    launcher.addEventListener('pointermove',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)+Math.abs(dy)>7){launcher._dragged=true;launcher.style.right='auto';launcher.style.left=Math.max(0,Math.min(innerWidth-launcher.offsetWidth,start.left+dx))+'px';launcher.style.top=Math.max(0,Math.min(innerHeight-launcher.offsetHeight,start.top+dy))+'px';}});
    launcher.addEventListener('pointerup',()=>{start=null;setTimeout(()=>launcher._dragged=false,0);});
    launcher.addEventListener('pointercancel',()=>{start=null;});
    addEventListener('keydown',e=>{if(e.altKey&&e.shiftKey&&e.code==='KeyM'){e.preventDefault();view?close():open();}});
  }
  function close(){if(busy)return;view?.remove();view=null;viewKind='';review=null;previousFocus?.focus?.();if(isHub)setTimeout(()=>offerExtras().catch(()=>{}),300);}
  function panel(title,body,footer){
    if(view)view.remove();else previousFocus=document.activeElement;
    view=document.createElement('div');view.className='backdrop';view.innerHTML=`<section class="panel" role="dialog" aria-modal="true" aria-labelledby="bridge-title"><header class="top"><div><div class="tag">Monster Mash · Album Bridge</div><h1 id="bridge-title">${esc(title)}</h1></div><button class="close" aria-label="Close review">×</button></header><main class="body">${body}</main><footer class="foot">${footer}</footer></section>`;root.append(view);
    view.querySelector('.close').onclick=close;
    view.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const focus=[...view.querySelectorAll('button,a[href],input,select,[tabindex="0"]')].filter(el=>!el.disabled && el.getClientRects().length);const first=focus[0],last=focus.at(-1),active=root.activeElement;if(e.shiftKey&&active===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&active===last){e.preventDefault();first?.focus();}}});
    view.querySelector('.close').focus();
  }
  const q = selector => view?.querySelector(selector);
  function notice(text,type=''){const el=q('#message');if(el){el.textContent=text;el.className=`notice ${type}`;}}
  function button(id,fn){q('#'+id)?.addEventListener('click',()=>Promise.resolve().then(fn).catch(e=>notice(e.message,'error')));}
  async function open(){
    mount();
    if(!isHub){const kind=sourceKind();if(kind==='album')sourceView();else if(kind==='profile')profileView();else if(kind==='wiki')wikiView();return;}
    try{
      const pending=await GM_getValue(KEY,null);
      if(pending) return await showReview(validateSnapshot(pending));
      const waiting=await extras();
      panel('Bring your album into the Hub',`<div class="help"><p>Capture your full Monster Mash album, profile picture and board from MONOPOLY GO, then review it here before saving.</p><ol><li>Open your official <a href="${OFFICIAL}" target="_blank" rel="noopener">sticker album</a> and sign in. Click <b>Album Bridge</b>, then <b>Capture & send to Hub</b>.</li><li>Open your <a href="https://www.monopolygo.com/tycoon-profile" target="_blank" rel="noopener">Tycoon profile</a> and click <b>Send profile to Hub</b> for your picture, frame, level and board.</li><li>On the <a href="https://monopolygo.wiki${CALC_PATH}" target="_blank" rel="noopener">MOGO Wiki board calculator</a>, press <b>CALCULATE</b>, then <b>Send board to Hub</b> for landmark costs.</li><li>Return here to match each capture to an account, review, edit and confirm.</li></ol><div id="message" class="notice">${waiting.length?`${waiting.length} profile/board capture${waiting.length===1?'':'s'} waiting: ${esc(waiting.map(x=>x.kind==='board'?`${x.name} #${x.map}`:x.name).join(', '))}.`:'No pending capture.'}</div></div>`,`<a href="${OFFICIAL}" target="_blank" rel="noopener">Open official album ↗</a><span class="spacer"></span><button id="undo">Undo last bridge import</button>${waiting.length?'<button id="extras" class="primary">Review profile &amp; board captures</button>':''}<button id="reload">Check for capture</button>`);
      button('reload',open);button('undo',showUndo);
      button('extras',async()=>{if(!hubBridge())throw Error('Reload the Hub — this version cannot review profile or board captures yet.');close();await offerExtras(true);});
    }catch(e){panel('Unable to open review',`<div id="message" class="notice error">${esc(e.message)}</div>`,`<button id="retry">Try again</button>`);button('retry',open);}
  }
  function profileView(){
    viewKind='profile';
    let t,error;try{t=readTycoon();}catch(e){error=e.message;}
    panel('Send your profile to the Hub',`<div class="help"><div class="account"><div class="pf"><div id="pf-photo" class="pf-photo">${t?'<span class="muted">Drawing…</span>':''}</div><div><span class="muted">Official player</span><strong>${esc(t?.name||currentName()[0]||'Waiting for sign-in')}</strong>${t?.level?`<span class="muted">Level ${esc(t.level)}</span>`:''}</div></div><div class="arrow">→</div><div><span class="muted">Destination</span><strong>Monster Mash Hub</strong><span class="muted">You pick the account there</span></div></div>${t?`<div class="metrics"><div class="metric"><span>Current board</span><b class="text">${esc(t.board.name||'—')}</b></div>${metric('Board number',t.board.map?'#'+t.board.map:'—')}${t.skins.slice(0,2).map(s=>metric(skinLabel(s.name),s.count)).join('')}</div>`:''}<p>Sends your profile picture with its frame and decal, your level, current board name and number, and your token, shield and dice counts. Nothing changes in the Hub until you review it there.</p><div id="message" class="notice ${error?'error':''}">${esc(error||'Ready to send.')}</div></div>`,`<button id="refresh">Reload page</button><span class="spacer"></span><button id="send" class="primary" ${t?'':'disabled'}>Send profile to Hub</button><a href="${HUB}" target="_blank" rel="noopener">Open Hub ↗</a>`);
    button('refresh',()=>location.reload());
    if(!t)return;
    let photo=null,tried=false;
    const drawing=composeProfile(t.wrapper).then(p=>{photo=p;const box=q('#pf-photo');if(box)box.innerHTML=`<img src="${esc(p)}" alt="Your profile picture with frame">`;}).catch(()=>{const box=q('#pf-photo');if(box)box.innerHTML='<span class="muted">No picture</span>';}).finally(()=>{tried=true;});
    button('send',async()=>{
      if(busy)return;busy=true;q('#send').disabled=true;
      try{
        const fresh=readTycoon();
        if(!tried){notice('Still drawing your picture…');await withTimeout(drawing,15000).catch(()=>{});}
        await pushExtra({version:1,id:crypto.randomUUID(),kind:'profile',capturedAt:Date.now(),name:fresh.name,level:fresh.level,board:fresh.board,skins:fresh.skins,activity:fresh.activity,...(photo?{photo}:{})});
        notice(`Sent ${fresh.name}’s profile${photo?' and picture':''}. Open the Hub — it will ask which account to update.`,'good');q('#send').textContent='Send again';
      }finally{busy=false;if(q('#send'))q('#send').disabled=false;}
    });
  }
  function wikiView(){
    viewKind='wiki';
    const c=lastCalc;let ready=null,error='';
    try{ready=boardPayload();}catch(e){error=e.message;}
    const left=c?c.landmarks.reduce((s,l)=>s+l.costs.slice(l.level).reduce((a,b)=>a+(b||0),0),0):0;
    panel('Send board costs to the Hub',`<div class="help"><div class="account"><div><span class="muted">Board</span><strong>${esc(c?c.name:'Not calculated yet')}</strong>${c?`<span class="muted">Map #${c.map} · ${c.landmarks.length} landmarks</span>`:''}</div><div class="arrow">→</div><div><span class="muted">Destination</span><strong>Hub · Board page</strong><span class="muted">You pick the account there</span></div></div>${c?`<div class="metrics">${metric('Remaining',short(left))}${metric('Landmark levels',c.landmarks.map(l=>l.level).join(' · '))}${metric('Total rolls',c.totalRolls?c.totalRolls.toLocaleString():'—')}${metric('Prices captured',c.landmarks.reduce((s,l)=>s+l.costs.filter(Boolean).length,0)+'/'+c.landmarks.length*6)}</div>`:''}<ol><li>Pick your map number and board, then press <b>CALCULATE</b>.</li><li>Set each landmark to its completed level — the wiki recalculates by itself.</li><li>Press <b>Send board costs to Hub</b>, then review it on the Hub’s Board page.</li></ol><p class="muted">The Bridge only reads the prices this page already loaded. It never sends anything to the wiki.</p><div id="message" class="notice ${c&&error?'error':''}">${esc(c?(error||'All prices captured — ready to send.'):'Waiting for the calculator. Press CALCULATE on the page.')}</div></div>`,`<span class="spacer"></span><button id="send" class="primary" ${ready?'':'disabled'}>Send board costs to Hub</button><a href="${HUB}" target="_blank" rel="noopener">Open Hub ↗</a>`);
    button('send',async()=>{const p=boardPayload();await pushExtra(p);notice(`Sent ${p.name} #${p.map}. Open the Hub to review and apply it.`,'good');q('#send').textContent='Send again';});
  }
  function sourceView(){
    viewKind='album';
    review=null;sourceSnapshot=null;
    let observed,error;
    try{observed=readAlbum();}catch(e){error=e.message;}
    const summary=observed?stats(observed.counts):null;
    panel('Capture your official album',`<div class="help"><div class="account"><div><span class="muted">Official player</span><strong>${esc(observed?.name||currentName()[0]||'Waiting for sign-in')}</strong></div><div class="arrow">→</div><div><span class="muted">Destination</span><strong>Monster Mash Hub</strong></div></div>${summary?`<div class="metrics">${metric('Owned stickers',summary.have+'/198')}${metric('Missing stickers',summary.missing)}${metric('Duplicate copies',summary.duplicates)}${metric('Vault stars*',summary.vaultStars)}</div>`:''}<p>Reads the 198 loaded album cards, including missing stickers and duplicate badges. Nothing changes in either album until you confirm the Hub preview.</p><p class="muted">A “+3” badge becomes 4 total copies. *Vault stars shown here count gold duplicates double; the Hub preview uses your Hub setting.</p><div id="message" class="notice ${error?'error':''}">${esc(error||'All 22 sets are loaded and ready to capture.')}</div><p class="muted">If you just switched players or played in the app, reload this page first so the official website shows your latest album.</p></div>`,`<button id="refresh">Reload official page</button><span class="spacer"></span><button id="capture" class="primary">Capture & send to Hub</button><a id="open-hub" href="${HUB}" target="_blank" rel="noopener">Open Hub ↗</a>`);
    button('refresh',()=>location.reload());button('capture',capture);
  }
  function metric(label,value,old){return `<div class="metric"><span>${esc(label)}</span><b>${old!==undefined?`<span class="old">${esc(old)} → </span>`:''}${esc(value)}</b></div>`;}
  async function capture(){
    if(busy)return;
    busy=true;q('#capture').disabled=true;
    try{
      if(!sourceAvailable())throw Error('Open the official sticker-album page first.');
      const first=readAlbum();
      await new Promise(resolve=>setTimeout(resolve,450));
      const second=readAlbum();
      if(!equal(first,second))throw Error('The album changed during capture. Wait for it to finish loading and try again.');
      notice('Album verified. Grabbing your profile picture and frame…');
      let photo=null;try{photo=await withTimeout(composeProfile(profileWrapper()),15000);}catch{}
      sourceSnapshot={version:1,id:crypto.randomUUID(),albumId:'SpookyAlbum',name:second.name,counts:second.counts,capturedAt:Date.now(),method:'complete official album DOM',...(photo?{photo}:{})};
      await GM_setValue(KEY,sourceSnapshot);
      notice(`Captured all 198 stickers for ${second.name}${photo?' plus your profile picture and frame':''}. Open the Hub to review, manually alter, confirm, or reject.`, 'good');
      q('#capture').textContent='Capture again';
    }finally{busy=false;if(q('#capture'))q('#capture').disabled=false;}
  }
  async function showReview(snapshot,mode='import',undo=null){
    const mm=hubApi(),accounts=clone(ownAccounts(mm));
    const links=await GM_getValue(LINKS,{});
    const match=mode==='undo'?{id:undo.aid,reason:'Restoring the previous counts for this account'}:matchAccount(accounts,snapshot.name,links);
    review={snapshot,mode,undo,accounts,aid:match.id,baseline:[],draft:snapshot.counts.slice(),included:Array(198).fill(true),editing:false,goldDouble:!!mm.S.st.settings.goldDouble,filter:'all',query:'',mm,matchedReason:match.reason};
    panel(mode==='undo'?'Review undo':'Review your album update',`<div class="account"><div><span class="muted">${mode==='undo'?'Previous saved counts':'MONOPOLY GO account'}</span><strong>${esc(snapshot.name)}</strong><span class="muted">${esc(new Date(snapshot.capturedAt).toLocaleString())}</span></div><div class="arrow">→</div><label><span class="muted">Update this Hub account</span><select id="account" ${mode==='undo'?'disabled':''}><option value="">Select an account…</option>${accounts.map(a=>`<option value="${esc(a.id)}" ${a.id===match.id?'selected':''}>${esc(a.name)}${a.device?' · '+esc(a.device):''}</option>`).join('')}</select><span class="muted" id="match-note">${esc(match.reason)}</span></label></div><label class="identity-check" id="identity-label" hidden><input type="checkbox" id="identity">I confirm this is the correct Hub account for ${esc(snapshot.name)}.</label>${snapshot.photo&&mode==='import'?`<label class="identity-check"><input type="checkbox" id="use-photo" checked><img src="${esc(snapshot.photo)}" alt="" class="photo-mini">Also use this MONOPOLY GO profile picture &amp; frame as the Hub account picture.</label>`:''}<div id="message" class="notice"></div><div id="totals" class="metrics"></div><p class="muted">Owned = unique stickers · Copies = owned plus duplicates · Album stars = one copy of each owned sticker · Vault stars = duplicates only${review.goldDouble?', with gold counted double':', with gold counted at face value'}. Counts below include the first owned copy.</p><div class="chips"><span id="changes-chip"></span><span id="sets-chip"></span><span>All 198 source records verified</span></div><div class="controls"><select id="filter" aria-label="Filter stickers"><option value="all">All stickers</option><option value="changed">Changes only</option><option value="missing">Missing after update</option><option value="duplicates">Duplicates after update</option></select><select id="jump" aria-label="Jump to set"><option value="">Jump to set…</option>${SETS.map(s=>`<option value="${s.id}">${s.id}. ${esc(s.name)}</option>`).join('')}</select><input type="search" id="search" placeholder="Find a sticker or set" aria-label="Search stickers"><span class="mode" id="edit-mode">Preview mode</span></div><div class="sets" id="sets"></div><div class="empty" id="empty" hidden>No stickers match this filter.</div>`,`<button id="reject" class="danger">${mode==='undo'?'Cancel undo':'Reject update'}</button><button id="edit">Manual alter</button><button id="reset">Reset edits</button><span class="spacer"></span><span class="muted" id="commit-note">Review first. Save only when ready.</span><button id="confirm" class="primary">${mode==='undo'?'Confirm undo':'Confirm update'}</button>`);
    q('#account').onchange=e=>selectAccount(e.target.value);
    q('#identity').onchange=updateConfirm;
    q('#filter').onchange=e=>{review.filter=e.target.value;applyFilter();};
    q('#search').oninput=e=>{review.query=norm(e.target.value);applyFilter();};
    q('#jump').onchange=e=>{if(!e.target.value)return;review.filter='all';review.query='';q('#filter').value='all';q('#search').value='';applyFilter();q(`#set-${e.target.value}`)?.scrollIntoView({behavior:'smooth',block:'start'});};
    button('edit',()=>{review.editing=!review.editing;q('#sets').classList.toggle('editing',review.editing);q('#edit').textContent=review.editing?'Finish editing':'Manual alter';q('#edit-mode').textContent=review.editing?'Editing total copies':'Preview mode';});
    button('reset',()=>{review.draft=review.snapshot.counts.slice();review.included.fill(true);renderCards();updateTotals();});
    button('confirm',commit);button('reject',reject);
    q('#sets').addEventListener('input',e=>{const inp=e.target;if(!inp.matches('[data-count]'))return;const i=+inp.dataset.count,n=Number(inp.value);if(inp.value.trim()===''||!validCount(n)){inp.setCustomValidity('Enter a whole number from 0 to 999999.');inp.setAttribute('aria-invalid','true');}else{inp.setCustomValidity('');inp.removeAttribute('aria-invalid');review.draft[i]=n;paintCard(i);}updateTotals();});
    q('#sets').addEventListener('change',e=>{if(e.target.matches('[data-include]')){const i=+e.target.dataset.include;review.included[i]=e.target.checked;paintCard(i);updateTotals();}});
    q('#sets').addEventListener('click',e=>{const b=e.target.closest('[data-step]');if(!b)return;const i=+b.dataset.i;review.draft[i]=Math.max(0,Math.min(999999,review.draft[i]+Number(b.dataset.step)));const inp=q(`[data-count="${i}"]`);inp.value=review.draft[i];inp.setCustomValidity('');inp.removeAttribute('aria-invalid');paintCard(i);updateTotals();});
    selectAccount(match.id);
    lastAuto=snapshot.id;
  }
  function selectAccount(aid){
    if(!review)return;
    const mm=hubApi(),account=ownAccounts(mm).find(a=>a.id===aid);
    review.aid=account?.id||'';review.baseline=account?Array.from(mm.S.st.counts[aid]||[]):Array(198).fill(0);
    if(review.baseline.length!==198 || !review.baseline.every(validCount))throw Error('The Hub account contains invalid counts. Fix those before importing.');
    review.accountName=account?.name||'';review.draft=review.snapshot.counts.slice();review.included.fill(true);review.hubUser=String(mm.Cloud?.user?.id||'local');
    q('#identity').checked=false;
    const unique=review.accounts.filter(a=>norm(a.name)===norm(review.snapshot.name)).length===1;
    q('#identity-label').hidden=!account || (norm(account.name)===norm(review.snapshot.name)&&unique) || review.mode==='undo';
    let text=!account?'Select an existing account that you own. If necessary, close this review and add it in the Hub first.':`${review.mode==='undo'?'Undo will restore':'Ready to update'} ${account.name}. The changes below apply only to this account.`;
    const age=Date.now()-review.snapshot.capturedAt;
    if(review.mode==='import'&&age>3600000)text+=' This capture is over an hour old. Consider capturing a fresh album before confirming.';
    if(review.mode==='undo'&&!equal(review.baseline,review.undo.after))text='This account changed after the import. Undo is blocked so those later edits are not overwritten.';
    notice(text);
    renderCards();updateTotals();
  }
  function effective(){return review.draft.map((n,i)=>review.included[i]?n:review.baseline[i]);}
  function artURL(c){try{const u=review.mm.Art?.thumb(c.key)||'';if(!u)return '';const url=new URL(u,location.href);if(['https:','blob:','data:'].includes(url.protocol))return url.href;}catch{}return '';}
  function renderCards(){
    q('#sets').innerHTML=SETS.map(s=>`<section class="set" id="set-${s.id}" style="--set-color:${s.color}"><header class="sethead"><div><div class="muted">SET ${s.id}</div><h3>${esc(s.name)}</h3></div><b id="set-have-${s.id}" class="small"></b></header><div class="grid">${CARDS.filter(c=>c.setId===s.id).map(c=>{const url=artURL(c);return `<article class="sticker" id="card-${c.i}"><span class="edited" hidden>Edited</span><div class="stars">${'★'.repeat(c.stars)}${c.gold?' · GOLD':''}</div><div class="art">${url?`<img loading="lazy" src="${esc(url)}" alt="${esc(c.name)}">`:`<span class="placeholder">✦</span>`}</div><div class="name">${esc(c.name)}</div><div class="state"></div><div class="before"></div><div class="edit"><button data-i="${c.i}" data-step="-1" aria-label="Decrease ${esc(c.name)}">−</button><input data-count="${c.i}" type="number" min="0" max="999999" step="1" value="${review.draft[c.i]}" aria-label="Total copies of ${esc(c.name)}"><button data-i="${c.i}" data-step="1" aria-label="Increase ${esc(c.name)}">+</button></div><label class="include"><input type="checkbox" data-include="${c.i}" ${review.included[c.i]?'checked':''}> Include update</label></article>`;}).join('')}</div></section>`).join('');
    q('#sets').classList.toggle('editing',review.editing);
    for(const c of CARDS)paintCard(c.i);
    q('#sets').querySelectorAll('img').forEach(img=>img.onerror=()=>{const placeholder=document.createElement('span');placeholder.className='placeholder';placeholder.textContent='✦';img.replaceWith(placeholder);});
  }
  function paintCard(i){
    const el=q('#card-'+i);if(!el)return;const n=review.included[i]?review.draft[i]:review.baseline[i],old=review.baseline[i],c=CARDS[i];
    el.className=`sticker ${n===0?'missing':''} ${c.gold?'gold':''} ${n!==old?'changed':''} ${!review.included[i]?'excluded':''}`;
    el.querySelector('.state').textContent=n===0?'MISSING':n===1?'HAVE · 1 COPY':`HAVE · +${n-1} DUPLICATES`;
    el.querySelector('.before').textContent=review.aid?`Total copies: ${old} → ${n}`:`Total copies: ${n}`;
    el.querySelector('.edited').hidden=review.draft[i]===review.snapshot.counts[i];
    el.querySelector('[data-count]').disabled=!review.included[i];el.querySelectorAll('[data-step]').forEach(b=>b.disabled=!review.included[i]);
  }
  function updateTotals(){
    const next=effective(),a=stats(review.baseline,review.goldDouble),b=stats(next,review.goldDouble);
    const fields=[['Owned stickers','have'],['Missing stickers','missing'],['Total copies','copies'],['Duplicate copies','duplicates'],['Album stars','albumStars'],['Stars across all copies','copyStars'],['Vault stars','vaultStars'],['Completed sets','sets']];
    q('#totals').innerHTML=fields.map(([label,k])=>metric(label,b[k],review.aid?a[k]:undefined)).join('');
    const changes=next.filter((n,i)=>n!==review.baseline[i]).length;
    q('#changes-chip').textContent=`${changes} sticker counts changing`;
    q('#sets-chip').textContent=`${b.sets}/22 sets complete · ${b.have}/198 owned`;
    for(const s of SETS){const from=(s.id-1)*9;const count=next.slice(from,from+9).filter(n=>n>0).length;q('#set-have-'+s.id).textContent=`${count}/9 owned`;}
    updateConfirm();applyFilter();
  }
  function updateConfirm(){
    if(!review)return;const invalid=!!q('[aria-invalid="true"]:not(:disabled)'),identity=q('#identity-label').hidden||q('#identity').checked;
    const undoConflict=review.mode==='undo'&&!equal(review.baseline,review.undo.after);
    q('#confirm').disabled=busy||!review.aid||invalid||!identity||undoConflict;
    q('#commit-note').textContent=invalid?'Fix the invalid count before confirming.':review.aid?`Target: ${review.accountName}`:'Select a Hub account to continue.';
  }
  function applyFilter(){
    const next=effective();let total=0;
    for(const s of SETS){let visible=0;for(const c of CARDS.filter(x=>x.setId===s.id)){
      const matches=review.filter==='all'||review.filter==='changed'&&next[c.i]!==review.baseline[c.i]||review.filter==='missing'&&next[c.i]===0||review.filter==='duplicates'&&next[c.i]>1;
      const found=!review.query||norm(`${c.name} ${c.hubName} ${s.name} set ${s.id}`).includes(review.query);
      const el=q('#card-'+c.i);el.hidden=!(matches&&found);if(!el.hidden)visible++;
    }q('#set-'+s.id).hidden=!visible;total+=visible;}
    q('#empty').hidden=total>0;
  }
  async function reject(){
    if(!review)return;
    if(review.mode==='import'){const pending=await GM_getValue(KEY,null);if(pending?.id===review.snapshot.id)await GM_deleteValue(KEY);}
    review=null;panel('Update rejected',`<div class="help"><div class="notice good">No sticker counts were changed.</div></div>`,`<button id="done">Close</button>`);button('done',close);
  }
  async function commit(){
    if(!review||busy||q('#confirm').disabled)return;
    busy=true;updateConfirm();
    const r=review;
    try{
      const mm=hubApi();
      if(String(mm.Cloud?.user?.id||'local')!==r.hubUser)throw Error('Your Hub sign-in changed. Reopen the review before saving.');
      if(!!mm.S.st.settings.goldDouble!==r.goldDouble)throw Error('The Hub star setting changed. Reopen the review for updated totals.');
      const a=ownAccounts(mm).find(x=>x.id===r.aid);
      if(!a||a.name!==r.accountName)throw Error('The selected account changed. Reopen the review.');
      const next=effective();
      if(!equal(Array.from(mm.S.st.counts[r.aid]||[]),r.baseline))throw Error('The account changed while this preview was open. Close and reopen it to review the latest counts.');
      if(!equal(JSON.parse(localStorage.getItem('mmx-state-v1')||'null')?.counts?.[r.aid],r.baseline))throw Error('The saved account changed in another tab or is still saving. Reopen the review after the Hub finishes saving.');
      if(r.mode==='import'){
        const pending=await GM_getValue(KEY,null);
        if(pending?.id!==r.snapshot.id)throw Error('This capture was replaced or rejected in another tab. Reopen Album Bridge to load the latest capture.');
      }else if(!equal(r.baseline,r.undo.after))throw Error('Undo blocked: counts changed after the import.');
      const changes=next.filter((n,i)=>n!==r.baseline[i]).length;
      const usePhoto=r.mode==='import'&&!!r.snapshot.photo&&!!q('#use-photo')?.checked;
      if(changes){
        await GM_setValue(BACKUP,{version:1,aid:r.aid,name:r.accountName,hubUser:r.hubUser,before:r.baseline.slice(),after:next.slice(),at:Date.now()});
        // Repeat the conflict check after asynchronous backup storage, immediately before mutating the Hub.
        hubApi();
        if(String(mm.Cloud?.user?.id||'local')!==r.hubUser || mm.S.acct(r.aid)?.name!==r.accountName)throw Error('Your Hub account changed before saving. Reopen the review.');
        applyToHub(mm,r.aid,next,r.baseline);
      }
      let photoNote='';
      if(usePhoto){try{if(typeof mm.Bridge?.applyPhoto!=='function')throw Error('old Hub');mm.Bridge.applyPhoto(String(r.aid),String(r.snapshot.photo));photoNote=' Account picture updated.';}catch{photoNote=' The account picture could not be updated — reload the Hub and use the profile capture instead.';}}
      let cleanupWarning='';
      try{
        if(r.mode==='import'){
          const links=await GM_getValue(LINKS,{});links[norm(r.snapshot.name)]=r.aid;await GM_setValue(LINKS,links);
          const pending=await GM_getValue(KEY,null);if(pending?.id===r.snapshot.id)await GM_deleteValue(KEY);
        }else await GM_deleteValue(BACKUP);
      }catch{cleanupWarning=' Saved successfully, but the pending-capture record could not be cleared.';}
      const result=stats(next,r.goldDouble);review=null;
      panel(r.mode==='undo'?'Previous counts restored':'Album update saved',`<div class="help"><div class="notice good">${esc(r.accountName)}: ${changes} sticker counts ${r.mode==='undo'?'restored':'updated'}.${esc(photoNote)}${esc(cleanupWarning)}</div><div class="metrics">${metric('Owned stickers',result.have+'/198')}${metric('Missing',result.missing)}${metric('Duplicate copies',result.duplicates)}${metric('Vault stars',result.vaultStars)}</div><p>Saved through the Hub’s normal update flow. If you use Hub cloud sync, its normal save and sharing settings apply. Check the Hub’s cloud status for remote sync completion.</p></div>`,`<button id="done" class="primary">Done</button>${r.mode==='import'&&changes?'<button id="undo">Review undo</button>':''}`);
      button('done',close);button('undo',showUndo);
    }catch(e){notice(e.message,'error');}finally{busy=false;if(review)updateConfirm();}
  }
  async function showUndo(){
    const backup=await GM_getValue(BACKUP,null),mm=hubApi();
    if(!backup || backup.version!==1 || !Array.isArray(backup.before) || !Array.isArray(backup.after) || backup.before.length!==198 || backup.after.length!==198 || !backup.before.every(validCount) || !backup.after.every(validCount))throw Error('No valid bridge import is available to undo.');
    if(String(mm.Cloud?.user?.id||'local')!==backup.hubUser)throw Error('The undo backup belongs to another Hub sign-in.');
    if(!ownAccounts(mm).some(a=>a.id===backup.aid))throw Error('The account from the last import is not present in this Hub.');
    const snapshot={version:1,id:'undo-'+backup.at,albumId:'SpookyAlbum',name:backup.name,counts:backup.before,capturedAt:backup.at};
    await showReview(snapshot,'undo',backup);
  }
  async function checkPending(auto=false){
    if(!isHub)return;
    const pending=await GM_getValue(KEY,null);
    await refreshLauncher();
    if(pending&&view&&review&&review.snapshot.id!==pending.id&&review.mode==='import')notice('A newer official capture arrived. Close and reopen Album Bridge to review it.');
    if(auto&&pending&&!view&&lastAuto!==pending.id){try{hubApi();await open();}catch{}}
    if(auto&&!pending)await offerExtras();
  }
  hookWiki(); // before the calculator page loads, so its own cost requests can be seen
  function start(){
    mount();
    if(typeof GM_registerMenuCommand==='function'){
      GM_registerMenuCommand('Open Album Bridge',open);
      if(isHub)GM_registerMenuCommand('Review undo of last bridge import',()=>showUndo().catch(e=>{open().then(()=>notice(e.message,'error'));}));
    }
    if(typeof GM_addValueChangeListener==='function'){
      GM_addValueChangeListener(KEY,()=>{checkPending(true).catch(()=>{});});
      GM_addValueChangeListener(EXTRAS,()=>{checkPending(true).catch(()=>{});});
    }
    if(isHub){
      // lets the Hub's Album Bridge guide show "installed"
      document.documentElement.setAttribute('data-mm-bridge',VERSION);
      window.dispatchEvent(new CustomEvent('mm-bridge-installed',{detail:VERSION}));
      window.addEventListener('mm-bridge-ready',()=>{offerExtras().catch(()=>{});});
      checkPending(true).catch(()=>{});let attempts=0;const wait=setInterval(()=>{checkPending(true).catch(()=>{});if(++attempts>=30)clearInterval(wait);},1000);
    }
    else {
      const route=()=>{const kind=sourceKind();if(view&&viewKind&&viewKind!==kind)close();refreshLauncher();};
      route();setInterval(route,1000);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
