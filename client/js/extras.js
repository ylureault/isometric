// Extras — micro-fonctionnalités de confort et de vie (vague « 100 »).
// Tout est client, additif et gardé : chaque bloc se désactive sans bruit
// si un élément manque. Aucun nouvel événement serveur.

var Extras = (function() {
  'use strict';

  /* ---------- #45 Commandes slash dans le chat ---------- */
  // /timer 5 · /roti · /meteo · /confetti · /theme nuit · /jeu · /aide
  function wireSlashCommands() {
    var input = document.getElementById('chat-input');
    if (!input) return;
    input.addEventListener('keydown', function(e) {
      if (e.key !== 'Enter') return;
      var v = input.value.trim();
      if (!v.startsWith('/')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      var parts = v.slice(1).split(/\s+/);
      var cmd = (parts[0] || '').toLowerCase();
      var arg = parts.slice(1).join(' ');
      input.value = '';
      switch (cmd) {
        case 'timer': {
          var mins = Math.max(1, Math.min(120, parseInt(arg) || 5));
          Network.socket.emit('create-timer', { duration: mins * 60 }, function(r) {
            if (r && r.error) UI.showNotification('Minuteur : action réservée à l\'admin', 'warning');
          });
          break;
        }
        case 'roti':
          Network.socket.emit('create-vote', { question: 'ROTI — Cette session valait-elle votre temps ? (1-5)', options: ['1', '2', '3', '4', '5'], duration: 60 }, function() {});
          break;
        case 'meteo': case 'météo':
          Network.socket.emit('create-vote', { question: 'Météo intérieure — comment arrivez-vous ?', options: ['☀️ Grand soleil', '🌤 Plutôt clair', '☁️ Couvert', '🌧 Pluvieux'], duration: 90 }, function() {});
          break;
        case 'confetti': case 'confettis':
          Network.socket.emit('trigger-effect', { type: 'confetti' });
          break;
        case 'theme': case 'thème':
          if (typeof Themes !== 'undefined' && Themes.THEMES[arg]) Themes.applyAndSync(arg);
          else UI.showNotification('Thèmes : jour, nuit, corporate, nature, festif');
          break;
        case 'jeu':
          Network.socket.emit('game-event', { action: 'start', seed: Math.floor(Math.random() * 1e9), duration: 120 });
          break;
        case 'aide': case 'help':
          UI.showNotification('/timer 5 · /roti · /meteo · /confetti · /theme nuit · /jeu');
          break;
        default:
          UI.showNotification('Commande inconnue — /aide pour la liste');
      }
    }, true); // capture : on intercepte avant l'envoi normal
  }

  /* ---------- #1 Avatar prérempli avec le dernier utilisé ---------- */
  function rememberAvatar() {
    // Sauvegardé au moment de rejoindre (btn-enter), relu au chargement
    var btn = document.getElementById('btn-enter');
    if (!btn) return;
    btn.addEventListener('click', function() {
      try {
        localStorage.setItem('insuffle_avatar', JSON.stringify({
          colors: UI.currentColors,
          accessory: (document.getElementById('accessory-select') || {}).value || 'none',
        }));
      } catch (e) {}
    });
    try {
      var saved = JSON.parse(localStorage.getItem('insuffle_avatar') || 'null');
      if (!saved || !saved.colors) return;
      Object.keys(saved.colors).forEach(function(k) {
        var ids = { skin: 'color-skin', hair: 'color-hair', shirt: 'color-shirt', pants: 'color-pants', shoes: 'color-shoes' };
        var input = document.getElementById(ids[k]);
        if (input && saved.colors[k]) {
          input.value = saved.colors[k];
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      });
      var sel = document.getElementById('accessory-select');
      if (sel && saved.accessory) { sel.value = saved.accessory; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      // Resélectionne visuellement les pastilles correspondantes
      document.querySelectorAll('.swatches[data-input]').forEach(function(row) {
        var input = document.getElementById(row.dataset.input);
        if (!input) return;
        row.querySelectorAll('.swatch').forEach(function(sw) {
          sw.classList.toggle('sel', sw.style.background &&
            sw.style.background.toLowerCase().indexOf(input.value.toLowerCase()) >= 0);
        });
      });
      document.querySelectorAll('#ob-acc .acc-chip').forEach(function(c, i) {
        var opts = document.querySelectorAll('#accessory-select option');
        c.classList.toggle('sel', opts[i] && opts[i].value === saved.accessory);
      });
    } catch (e) {}
  }

  /* ---------- #9 Détection de double onglet ---------- */
  function watchDuplicateTab() {
    var roomId = new URLSearchParams(location.search).get('room');
    if (!roomId) return;
    var key = 'insuffle_tab_' + roomId;
    var myTab = Math.random().toString(36).slice(2);
    setInterval(function() {
      try {
        var cur = JSON.parse(localStorage.getItem(key) || 'null');
        if (cur && cur.tab !== myTab && Date.now() - cur.ts < 4000 && !Extras._dupWarned) {
          Extras._dupWarned = true;
          UI.showNotification('⚠️ Cette salle est déjà ouverte dans un autre onglet', 'warning');
        }
        localStorage.setItem(key, JSON.stringify({ tab: myTab, ts: Date.now() }));
      } catch (e) {}
    }, 2000);
  }

  /* ---------- #7 Nuage de poussière à l'arrivée ---------- */
  function wireArrivalPuff() {
    Network.socket.on('participant-joined', function(d) {
      if (typeof d.x === 'number' && Engine.addReaction) Engine.addReaction('💨', d.x, d.y);
    });
  }

  /* ---------- #21/#22 Double-clic sur un avatar : le rejoindre / le suivre ---------- */
  var followingId = null;
  function nearestRemoteAt(gx, gy) {
    var best = null, bestD = 1.4;
    Network.remotePlayers.forEach(function(p, sid) {
      var d = Math.hypot(gx - p.renderX, gy - p.renderY);
      if (d < bestD) { bestD = d; best = { sid: sid, p: p }; }
    });
    return best;
  }
  function wireGoToPerson() {
    var canvas = document.getElementById('game-canvas');
    canvas.addEventListener('dblclick', function(e) {
      if (!Engine.started || Engine.editMode) return;
      var gp = Engine.screenToGridView(e.clientX, e.clientY);
      var hit = nearestRemoteAt(gp.x, gp.y);
      if (!hit) return;
      if (e.shiftKey) {
        followingId = followingId === hit.sid ? null : hit.sid;
        UI.showNotification(followingId
          ? '👣 Vous suivez ' + (hit.p.pseudo || 'ce participant') + ' — Maj+double-clic pour arrêter'
          : 'Vous ne suivez plus personne');
      } else {
        Engine.moveTarget = { x: hit.p.renderX, y: hit.p.renderY, setAt: performance.now() };
        UI.showNotification('🚶 En route vers ' + (hit.p.pseudo || '…'));
      }
    });
    // Suivre : on rafraîchit la cible tant que la personne bouge
    setInterval(function() {
      if (!followingId) return;
      var p = Network.remotePlayers.get(followingId);
      if (!p) { followingId = null; return; }
      var d = Math.hypot(Engine.player.x - p.renderX, Engine.player.y - p.renderY);
      if (d > 1.6) Engine.moveTarget = { x: p.renderX, y: p.renderY, setAt: performance.now() };
    }, 500);
    // Toute saisie clavier de déplacement arrête le suivi
    window.addEventListener('keydown', function(e) {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyZ', 'KeyQ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) followingId = null;
    });
  }

  /* ---------- #24 Clic sur la minimap = on y va ---------- */
  function wireMinimapTravel() {
    var mm = document.getElementById('minimap-canvas');
    if (!mm) return;
    mm.style.cursor = 'pointer';
    mm.title = 'Cliquer : se rendre à cet endroit';
    mm.addEventListener('click', function(e) {
      var r = mm.getBoundingClientRect();
      var sc = Math.min(mm.width, mm.height) / Board.gridSize;
      var gx = (e.clientX - r.left) * (mm.width / r.width) / sc;
      var gy = (e.clientY - r.top) * (mm.height / r.height) / sc;
      if (gx < 0.5 || gy < 0.5 || gx > Board.gridSize - 0.5 || gy > Board.gridSize - 0.5) return;
      if (Board.isSolid(gx, gy)) {
        var near = Engine.findWalkableNear(gx, gy, Engine.player.x, Engine.player.y);
        if (near) { gx = near.x; gy = near.y; } else return;
      }
      Engine.moveTarget = { x: gx, y: gy, setAt: performance.now() };
    });
  }

  /* ---------- #34 Qui m'entend ? (survol du micro) ---------- */
  function wireWhoHearsMe() {
    var mic = document.getElementById('btn-mute');
    if (!mic) return;
    setInterval(function() {
      if (!Engine.started) return;
      var names = [];
      Network.remotePlayers.forEach(function(p) {
        var d = Math.hypot(Engine.player.x - p.renderX, Engine.player.y - p.renderY);
        if (d < Engine.player.audioRadius) names.push(p.pseudo || '?');
      });
      mic.title = names.length
        ? 'Dans votre cercle de parole : ' + names.join(', ')
        : 'Personne dans votre cercle de parole — rapprochez-vous ou montez sur l\'estrade';
    }, 2000);
  }

  /* ---------- #39 Petit son quand quelqu'un entre dans le cercle ---------- */
  var inCircle = {};
  function watchCircleEnter() {
    setInterval(function() {
      if (!Engine.started) return;
      Network.remotePlayers.forEach(function(p, sid) {
        var inside = Math.hypot(Engine.player.x - p.renderX, Engine.player.y - p.renderY) < Engine.player.audioRadius;
        if (inside && !inCircle[sid]) {
          inCircle[sid] = true;
          if (Date.now() - (Extras._lastDing || 0) > 4000) {
            Extras._lastDing = Date.now();
            Engine.initSfx && Engine.initSfx();
            Engine.playSfx && Engine.playSfx('notification');
          }
        } else if (!inside) {
          delete inCircle[sid];
        }
      });
    }, 800);
  }

  /* ---------- #30 Boussole vers l'admin quand il est hors écran ---------- */
  function drawAdminCompass(ctx) {
    if (!Engine.started || Engine.player.isAdmin) return;
    var admin = null;
    Network.remotePlayers.forEach(function(p) { if (p.isAdmin && p.opacity > 0) admin = p; });
    if (!admin) return;
    var pos = Board.iso(admin.renderX, admin.renderY);
    var sx = pos.x * Engine.zoom + Engine.camera.x;
    var sy = pos.y * Engine.zoom + Engine.camera.y;
    var w = Engine.viewW, h = Engine.viewH;
    if (sx > 60 && sx < w - 60 && sy > 60 && sy < h - 60) return; // visible
    var cx = w / 2, cy = h / 2;
    var ang = Math.atan2(sy - cy, sx - cx);
    var bx = cx + Math.cos(ang) * (Math.min(w, h) / 2 - 70);
    var by = cy + Math.sin(ang) * (Math.min(w, h) / 2 - 70);
    ctx.save();
    ctx.setTransform(Engine.dpr || 1, 0, 0, Engine.dpr || 1, 0, 0);
    ctx.translate(bx, by);
    ctx.rotate(ang);
    ctx.fillStyle = Engine._withAlpha(Engine.themeColor('--accent-2', '#ff9d7a'), 0.9);
    ctx.beginPath();
    ctx.moveTo(14, 0); ctx.lineTo(-7, -8); ctx.lineTo(-7, 8);
    ctx.closePath(); ctx.fill();
    ctx.rotate(-ang);
    ctx.font = '700 11px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = Engine.themeColor('--muted', '#737b96');
    ctx.fillText('★ admin', 0, 24);
    ctx.restore();
  }

  /* ---------- #23 Traces de pas qui s'estompent ---------- */
  var steps = [];
  var lastStepAt = 0;
  function recordSteps() {
    if (!Engine.started || !Engine.player.isWalking) return;
    var now = performance.now();
    if (now - lastStepAt < 260) return;
    lastStepAt = now;
    steps.push({ x: Engine.player.x, y: Engine.player.y, t: now });
    if (steps.length > 14) steps.shift();
  }
  function drawSteps(ctx) {
    var now = performance.now();
    steps = steps.filter(function(s) { return now - s.t < 5000; });
    var accent = Engine.themeColor('--accent', '#5b6cff');
    steps.forEach(function(s, i) {
      var age = (now - s.t) / 5000;
      var pos = Board.iso(s.x, s.y);
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.scale(1, 0.5);
      ctx.fillStyle = Engine._withAlpha(accent, 0.22 * (1 - age));
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  /* ---------- #79 Aperçu de son propre partage d'écran ---------- */
  function wireSelfSharePreview() {
    var pip = document.createElement('video');
    pip.id = 'self-share-pip';
    pip.muted = true; pip.autoplay = true; pip.playsInline = true;
    pip.style.display = 'none';
    document.body.appendChild(pip);
    setInterval(function() {
      var sharing = typeof ScreenShare !== 'undefined' && ScreenShare.isSharing && ScreenShare.localStream;
      if (sharing && pip.srcObject !== ScreenShare.localStream) {
        pip.srcObject = ScreenShare.localStream;
        pip.style.display = 'block';
      } else if (!sharing && pip.style.display !== 'none') {
        pip.srcObject = null;
        pip.style.display = 'none';
      }
    }, 1000);
  }

  /* ---------- #93/#94 Plein écran (F) et recadrage ---------- */
  function wireViewComfort() {
    window.addEventListener('keydown', function(e) {
      if (e.target.matches('input,textarea,select,[contenteditable]')) return;
      if (Engine._uiOverlayOpen && Engine._uiOverlayOpen()) return;
      if (e.code === 'KeyF') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(function() {});
      }
    });
    // Double-clic sur l'en-tête de la minimap : recadrer toute la salle
    var mmH = document.querySelector('.minimap-container .mm-h');
    if (mmH) {
      mmH.style.cursor = 'zoom-out';
      mmH.title = 'Double-clic : voir toute la salle';
      mmH.addEventListener('dblclick', function() {
        var fit = Math.min(
          Engine.viewW / (Board.gridSize * Board.tileWidth * 1.15),
          Engine.viewH / (Board.gridSize * Board.tileHeight * 1.35)
        );
        Engine.zoom = Math.max(CONSTANTS.ZOOM_MIN, Math.min(CONSTANTS.ZOOM_MAX, fit));
        UI.showNotification('Vue recadrée sur toute la salle');
      });
    }
  }

  /* ---------- #89 Récap de session (admin) ---------- */
  function wireRecap() {
    var kit = document.getElementById('facilitation-kit');
    if (!kit || document.getElementById('btn-recap')) return;
    var b = document.createElement('button');
    b.className = 'btn btn-secondary btn-sm';
    b.id = 'btn-recap';
    b.textContent = '📝 Récap de session (.txt)';
    b.style.margin = '0 6px 6px 0';
    b.onclick = function() {
      var lines = [];
      lines.push('Récap — ' + (Engine.roomConfig.name || 'Salle') + ' — ' + new Date().toLocaleString('fr-FR'));
      lines.push('Lien : ' + location.origin + '/client/room.html?room=' + Engine.roomConfig.roomId);
      lines.push('');
      lines.push('Participants :');
      lines.push('- ' + Engine.player.pseudo + ' (vous)');
      Network.remotePlayers.forEach(function(p) { lines.push('- ' + p.pseudo); });
      lines.push('');
      var msgs = document.querySelectorAll('#chat-messages .chat-msg');
      if (msgs.length) {
        lines.push('Chat (' + msgs.length + ' messages) :');
        msgs.forEach(function(m) { lines.push('  ' + m.textContent); });
      }
      var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'recap-' + (Engine.roomConfig.roomId || 'salle') + '.txt';
      a.click();
      setTimeout(function() { URL.revokeObjectURL(a.href); }, 5000);
    };
    kit.appendChild(b);
  }

  /* ---------- #100 Easter egg : taper « insuffle » ---------- */
  var typed = '';
  function wireEasterEgg() {
    window.addEventListener('keydown', function(e) {
      if (e.target.matches('input,textarea,select,[contenteditable]')) return;
      typed = (typed + (e.key || '')).slice(-8).toLowerCase();
      if (typed === 'insuffle') {
        typed = '';
        var plane = document.createElement('div');
        plane.textContent = '✈️';
        plane.style.cssText = 'position:fixed;top:' + (20 + Math.random() * 40) + '%;left:-60px;font-size:42px;z-index:300;pointer-events:none;transition:transform 4s linear;';
        document.body.appendChild(plane);
        requestAnimationFrame(function() {
          plane.style.transform = 'translateX(' + (window.innerWidth + 140) + 'px) rotate(8deg)';
        });
        setTimeout(function() { plane.remove(); }, 4200);
      }
    });
  }

  /* ---------- dessin (appelé par le moteur via Facilitation.draw ? non,
     crochet propre : Extras.draw est appelé juste après) ---------- */
  function draw(ctx) {
    recordSteps();
    drawSteps(ctx);
    drawAdminCompass(ctx);
  }

  function init() {
    if (!document.getElementById('game-canvas')) return;
    rememberAvatar();
    wireEasterEgg();
    var wait = setInterval(function() {
      if (typeof Network === 'undefined' || !Network.socket) return;
      clearInterval(wait);
      wireSlashCommands();
      watchDuplicateTab();
      wireArrivalPuff();
      wireGoToPerson();
      wireMinimapTravel();
      wireWhoHearsMe();
      watchCircleEnter();
      wireSelfSharePreview();
      wireViewComfort();
      setInterval(wireRecap, 3000); // le kit apparaît après le join admin
    }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { draw: draw };
})();
