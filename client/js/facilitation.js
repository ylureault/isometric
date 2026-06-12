// Facilitation — le cœur « atelier » d'Insuffle Espace.
// Statuts & humeurs, kit du facilitateur (groupes, cloche, roue, ROTI,
// météo, verrouillage, minuteur géant, gong), push-to-talk, et le jeu
// Gendarmes & Voleurs. Tout est additif et se désactive si un élément manque.

var Facilitation = (function() {
  'use strict';

  var statuses = {};        // socketId -> emoji
  var myStatus = null;
  var myStatusAuto = false; // posé automatiquement (AFK) → effacé à l'activité

  /* ================== STATUTS & HUMEURS ================== */

  var STATUS_CHOICES = ['😊', '🔥', '☕', '🎧', '📞', '😴'];

  function onStatus(socketId, status) {
    if (status) statuses[socketId] = status;
    else delete statuses[socketId];
  }

  function setMyStatus(emoji, auto) {
    myStatus = emoji;
    myStatusAuto = !!auto;
    if (emoji) statuses[Network.mySocketId] = emoji;
    else delete statuses[Network.mySocketId];
    Network.socket.emit('set-status', { status: emoji || '' }, function() {});
    // Le statut choisi survit aux rechargements (pas le 😴 automatique)
    if (!auto) {
      try {
        if (emoji) localStorage.setItem('insuffle_status', emoji);
        else localStorage.removeItem('insuffle_status');
      } catch (e) {}
    }
  }

  // À chaque (re)connexion : on réémet son statut sauvegardé
  function restoreMyStatus() {
    var saved = null;
    try { saved = localStorage.getItem('insuffle_status'); } catch (e) {}
    if (!saved) return;
    var tries = 0;
    var t = setInterval(function() {
      if (++tries > 30) { clearInterval(t); return; }
      if (typeof Engine === 'undefined' || !Engine.started || !Network.mySocketId) return;
      clearInterval(t);
      setMyStatus(saved, false);
      var btn = document.getElementById('btn-status');
      if (btn) btn.textContent = saved;
    }, 1000);
  }

  function buildStatusButton() {
    var dockLeft = document.querySelector('.toolbar-left');
    if (!dockLeft || document.getElementById('btn-status')) return;
    var btn = document.createElement('button');
    btn.className = 'toolbar-btn';
    btn.id = 'btn-status';
    btn.title = 'Mon statut (humeur, pause, focus…)';
    btn.setAttribute('aria-label', 'Choisir mon statut');
    btn.textContent = '😊';
    dockLeft.insertBefore(btn, dockLeft.firstChild);

    var pop = document.createElement('div');
    pop.className = 'status-pop glass';
    pop.id = 'status-pop';
    pop.style.display = 'none';
    STATUS_CHOICES.forEach(function(em) {
      var b = document.createElement('button');
      b.className = 'status-choice';
      b.textContent = em;
      b.onclick = function() {
        setMyStatus(em, false);
        btn.textContent = em;
        pop.style.display = 'none';
      };
      pop.appendChild(b);
    });
    var clear = document.createElement('button');
    clear.className = 'status-choice status-clear';
    clear.textContent = '✕';
    clear.title = 'Effacer mon statut';
    clear.onclick = function() { setMyStatus(null, false); btn.textContent = '😊'; pop.style.display = 'none'; };
    pop.appendChild(clear);
    document.body.appendChild(pop);

    btn.onclick = function(e) {
      e.stopPropagation();
      var r = btn.getBoundingClientRect();
      pop.style.left = r.left + 'px';
      pop.style.bottom = (window.innerHeight - r.top + 10) + 'px';
      pop.style.display = pop.style.display === 'none' ? 'flex' : 'none';
    };
    document.addEventListener('click', function() { pop.style.display = 'none'; });
  }

  // AFK : 3 minutes sans activité → 😴 automatique, effacé au retour
  var lastActivity = Date.now();
  function watchAfk() {
    ['keydown', 'mousemove', 'mousedown'].forEach(function(ev) {
      window.addEventListener(ev, function() {
        lastActivity = Date.now();
        if (myStatusAuto && myStatus === '😴') {
          setMyStatus(null, false);
          var btn = document.getElementById('btn-status');
          if (btn) btn.textContent = '😊';
        }
      }, { passive: true });
    });
    setInterval(function() {
      if (!myStatus && Date.now() - lastActivity > 180000) setMyStatus('😴', true);
    }, 15000);
  }

  /* ================== KIT DU FACILITATEUR ================== */

  function adminButton(label, title, onclick) {
    var b = document.createElement('button');
    b.className = 'btn btn-secondary btn-sm';
    b.textContent = label;
    b.title = title || '';
    b.style.margin = '0 6px 6px 0';
    b.onclick = onclick;
    return b;
  }

  function buildFacilitationKit() {
    var tab = document.getElementById('tab-participants');
    if (!tab || document.getElementById('facilitation-kit')) return;
    var box = document.createElement('div');
    box.id = 'facilitation-kit';
    box.style.marginTop = '12px';
    box.innerHTML = '<h4>Kit du facilitateur</h4>';

    // Répartition aléatoire vers les tables (ou en cercles si pas de table)
    box.appendChild(adminButton('🎲 Répartir en groupes', 'Téléporte les participants vers les tables de travail', function() {
      var tables = Array.from(Engine.tables.values());
      var people = [Network.mySocketId].concat(Array.from(Network.remotePlayers.keys()));
      if (!people.length) return;
      var moves = [];
      if (tables.length >= 2) {
        people.sort(function() { return Math.random() - 0.5; });
        people.forEach(function(sid, i) {
          var t = tables[i % tables.length];
          moves.push({
            socketId: sid,
            x: t.x + t.width / 2 + (Math.random() - 0.5) * Math.max(1, t.width - 1),
            y: t.y + t.height / 2 + (Math.random() - 0.5) * Math.max(1, t.height - 1),
          });
        });
      } else {
        UI.showNotification('Créez au moins 2 tables de travail (onglet Mobilier) pour répartir');
        return;
      }
      Network.socket.emit('admin-teleport', { moves: moves, reason: '🎲 Répartition en groupes — bonne discussion !' }, function(r) {
        if (r && r.success) UI.showNotification('Groupes formés : ' + r.moved + ' participant·e·s réparti·e·s');
      });
    }));

    // Cloche de rappel : tout le monde au centre
    box.appendChild(adminButton('📣 Rassembler tout le monde', 'Ramène tous les participants au centre de la salle', function() {
      var gs = Board.gridSize;
      var people = [Network.mySocketId].concat(Array.from(Network.remotePlayers.keys()));
      var moves = people.map(function(sid, i) {
        var a = (i / Math.max(1, people.length)) * Math.PI * 2;
        var rr = 1.6 + (people.length > 8 ? 1.2 : 0);
        return { socketId: sid, x: gs / 2 + Math.cos(a) * rr, y: gs / 2 + Math.sin(a) * rr };
      });
      Network.socket.emit('admin-teleport', { moves: moves, reason: '📣 On se rassemble au centre !' }, function() {});
      Network.socket.emit('trigger-effect', { type: 'applause' });
    }));

    // Roue de la fortune : tirage au sort + projecteur
    box.appendChild(adminButton('🎡 Tirer au sort', 'Désigne un·e participant·e au hasard (projecteur)', function() {
      var people = [{ id: Network.mySocketId, pseudo: Engine.player.pseudo }];
      Network.remotePlayers.forEach(function(p, sid) { people.push({ id: sid, pseudo: p.pseudo }); });
      var pick = people[Math.floor(Math.random() * people.length)];
      Network.socket.emit('trigger-effect', { type: 'spotlight', targetSocketId: pick.id });
      Network.socket.emit('chat-message', { text: '🎡 Le sort désigne : ' + pick.pseudo + ' !' });
    }));

    // ROTI et météo : votes préconfigurés
    box.appendChild(adminButton('📊 ROTI', 'Return On Time Invested — vote de 1 à 5', function() {
      Network.socket.emit('create-vote', {
        question: 'ROTI — Cette session valait-elle votre temps ? (1 = non, 5 = pleinement)',
        options: ['1', '2', '3', '4', '5'], duration: 60,
      }, function() {});
    }));
    box.appendChild(adminButton('🌦 Météo d\'équipe', 'Chacun pose sa météo du moment', function() {
      Network.socket.emit('create-vote', {
        question: 'Météo intérieure — comment arrivez-vous ?',
        options: ['☀️ Grand soleil', '🌤 Plutôt clair', '☁️ Couvert', '🌧 Pluvieux'], duration: 90,
      }, function() {});
    }));

    // Mode énergie
    box.appendChild(adminButton('⚡ Boost d\'énergie', 'Confettis + applaudissements pour relancer la salle', function() {
      Network.socket.emit('trigger-effect', { type: 'confetti' });
      setTimeout(function() { Network.socket.emit('trigger-effect', { type: 'applause' }); }, 600);
      setTimeout(function() { Network.socket.emit('trigger-effect', { type: 'confetti' }); }, 1400);
    }));

    // Verrouillage de salle
    var lockBtn = adminButton('🔒 Verrouiller la salle', 'Plus personne ne peut entrer (la session a commencé)', function() {
      var locked = lockBtn.dataset.locked === '1';
      Network.socket.emit('set-room-locked', { locked: !locked }, function(r) {
        if (r && r.error) UI.showNotification('Action réservée à l\'administrateur', 'warning');
      });
    });
    lockBtn.id = 'btn-lock-room';
    box.appendChild(lockBtn);

    // Dissoudre l'espace où je suis : tout le monde retourne à l'open space
    box.appendChild(adminButton('💨 Dissoudre mon espace', 'Évacue tous les occupants de l\'espace où vous êtes vers le centre', function() {
      var zi = Engine.zoneIndexAt(Engine.player.x, Engine.player.y);
      if (zi < 0) { UI.showNotification('Placez-vous dans l\'espace à dissoudre'); return; }
      var z = Engine._discussionZones[zi];
      var gs = Board.gridSize;
      var moves = [];
      var inside = function(px, py) { return px >= z.x0 && px < z.x1 && py >= z.y0 && py < z.y1; };
      var spot = function(i, n) {
        var a = (i / Math.max(1, n)) * Math.PI * 2;
        return { x: gs / 2 + Math.cos(a) * 2, y: gs / 2 + Math.sin(a) * 2 };
      };
      var people = [];
      if (inside(Engine.player.x, Engine.player.y)) people.push(Network.mySocketId);
      Network.remotePlayers.forEach(function(p, sid) { if (inside(p.renderX, p.renderY)) people.push(sid); });
      people.forEach(function(sid, i) { var sp = spot(i, people.length); moves.push({ socketId: sid, x: sp.x, y: sp.y }); });
      Network.socket.emit('admin-teleport', { moves: moves, reason: '💨 « ' + z.name + ' » est dissous — retour au centre' }, function() {});
      // Si l'espace a été dessiné (id serveur), on le retire aussi
      if (z.item.id) {
        Network.socket.emit('remove-furniture', { furnitureId: z.item.id }, function(r) {
          if (r && r.success) {
            Board.furniture = Board.furniture.filter(function(f) { return f.id !== z.item.id; });
            Board.buildCollisionMap();
            Engine._zonesSig = null;
          }
        });
      }
    }));

    // Gendarmes & Voleurs
    box.appendChild(adminButton('👮 Gendarmes & Voleurs (2 min)', 'Petit jeu d\'énergie : un tiers de gendarmes, attrapez les voleurs !', function() {
      Network.socket.emit('game-event', { action: 'start', seed: Math.floor(Math.random() * 1e9), duration: 120 });
    }));

    tab.appendChild(box);
  }

  /* ================== MINUTEUR GÉANT + GONG ================== */

  function wireTimerExtras() {
    var pill = document.getElementById('timer-display-global');
    if (pill && !pill._hugeWired) {
      pill._hugeWired = true;
      pill.style.cursor = 'zoom-in';
      pill.title = 'Cliquer : minuteur en grand pour toute la salle';
      pill.addEventListener('click', function() {
        pill.classList.toggle('timer-huge');
        pill.style.cursor = pill.classList.contains('timer-huge') ? 'zoom-out' : 'zoom-in';
      });
    }
    if (Network.socket && !Facilitation._gongWired) {
      Facilitation._gongWired = true;
      Network.socket.on('timer-ended', function() { gong(); });
    }
  }

  // Gong doux en WebAudio (deux harmoniques qui s'éteignent)
  function gong() {
    try {
      var ac = new (window.AudioContext || window.webkitAudioContext)();
      [196, 392].forEach(function(freq, i) {
        var o = ac.createOscillator(), g = ac.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(i ? 0.12 : 0.22, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 2.4);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + 2.5);
      });
      setTimeout(function() { ac.close(); }, 2800);
    } catch (e) {}
  }

  /* ================== PUSH-TO-TALK (touche P pour activer) ================== */

  var pttEnabled = false, pttHeld = false;
  function wirePushToTalk() {
    try { pttEnabled = localStorage.getItem('insuffle_ptt') === '1'; } catch (e) {}
    window.addEventListener('keydown', function(e) {
      if (e.target.matches('input,textarea,select,[contenteditable]')) return;
      if (e.code === 'KeyP' && !e.repeat) {
        pttEnabled = !pttEnabled;
        try { localStorage.setItem('insuffle_ptt', pttEnabled ? '1' : '0'); } catch (err) {}
        UI.showNotification(pttEnabled
          ? '🎙 Push-to-talk activé — maintenez Espace pour parler'
          : 'Push-to-talk désactivé');
        if (pttEnabled && !Engine.player.isMuted) {
          var m = Audio.toggleMute(); Engine.player.isMuted = m; UI.updateMuteButton(m);
        }
      }
      // Espace = parler tant que c'est maintenu (non-admin : l'admin garde
      // sa touche « parler à tous »)
      if (pttEnabled && e.code === 'Space' && !Engine.player.isAdmin && !pttHeld) {
        pttHeld = true;
        if (Engine.player.isMuted) { var m2 = Audio.toggleMute(); Engine.player.isMuted = m2; UI.updateMuteButton(m2); }
      }
    });
    window.addEventListener('keyup', function(e) {
      if (pttEnabled && e.code === 'Space' && !Engine.player.isAdmin && pttHeld) {
        pttHeld = false;
        if (!Engine.player.isMuted) { var m = Audio.toggleMute(); Engine.player.isMuted = m; UI.updateMuteButton(m); }
      }
    });
  }

  /* ================== GENDARMES & VOLEURS ================== */

  var game = null; // { roles: {sid:'cop'|'robber'}, caught:{}, endsAt, prison:{x,y} }

  function mulberry32(a) {
    return function() {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function startGame(seed, duration) {
    var ids = [Network.mySocketId].concat(Array.from(Network.remotePlayers.keys())).sort();
    var rng = mulberry32(seed);
    var shuffled = ids.slice().sort(function() { return rng() - 0.5; });
    var nbCops = Math.max(1, Math.round(ids.length / 3));
    var roles = {};
    shuffled.forEach(function(sid, i) { roles[sid] = i < nbCops ? 'cop' : 'robber'; });
    game = {
      roles: roles, caught: {}, endsAt: Date.now() + (duration || 120) * 1000,
      prison: { x: 2.5, y: 2.5 },
    };
    var myRole = roles[Network.mySocketId];
    UI.showNotification(myRole === 'cop'
      ? '👮 Vous êtes GENDARME — attrapez les voleurs en les touchant !'
      : '🦹 Vous êtes VOLEUR — fuyez ! Touchez un prisonnier pour le libérer.');
    if (!game._tick) game._tick = setInterval(gameTick, 250);
  }

  function endGame(message) {
    if (!game) return;
    if (game._tick) clearInterval(game._tick);
    var robbers = Object.keys(game.roles).filter(function(s) { return game.roles[s] === 'robber'; });
    var caughtAll = robbers.length > 0 && robbers.every(function(s) { return game.caught[s]; });
    UI.showNotification(message || (caughtAll ? '👮 Les gendarmes gagnent !' : '🦹 Les voleurs s\'en sortent !'));
    Engine.triggerConfetti();
    game = null;
  }

  function gameTick() {
    if (!game) return;
    if (Date.now() > game.endsAt) { endGame(); return; }
    var me = Network.mySocketId;
    var myRole = game.roles[me];
    if (!myRole) return;
    // Gendarme : j'attrape les voleurs libres que je touche
    if (myRole === 'cop') {
      Network.remotePlayers.forEach(function(p, sid) {
        if (game.roles[sid] !== 'robber' || game.caught[sid]) return;
        var d = Math.hypot(Engine.player.x - p.renderX, Engine.player.y - p.renderY);
        if (d < 0.9) Network.socket.emit('game-event', { action: 'catch', target: sid });
      });
    }
    // Voleur libre : je délivre un prisonnier que je touche
    if (myRole === 'robber' && !game.caught[me]) {
      Network.remotePlayers.forEach(function(p, sid) {
        if (game.roles[sid] !== 'robber' || !game.caught[sid]) return;
        var d = Math.hypot(Engine.player.x - p.renderX, Engine.player.y - p.renderY);
        if (d < 0.9) Network.socket.emit('game-event', { action: 'free', target: sid });
      });
    }
    // Tous attrapés → fin
    var robbers = Object.keys(game.roles).filter(function(s) { return game.roles[s] === 'robber'; });
    if (robbers.length && robbers.every(function(s) { return game.caught[s]; })) endGame();
  }

  function onGameEvent(d) {
    if (d.action === 'start' && d.seed != null) { startGame(d.seed, d.duration); return; }
    if (d.action === 'stop') { endGame('Partie arrêtée'); return; }
    if (!game) return;
    if (d.action === 'catch' && d.target && game.roles[d.target] === 'robber') {
      game.caught[d.target] = true;
      if (d.target === Network.mySocketId) {
        Engine.player.x = game.prison.x; Engine.player.y = game.prison.y;
        Engine.moveTarget = null;
        Network.sendPosition(Engine.player.x, Engine.player.y, Engine.player.direction, false, 0);
        UI.showNotification('🚔 Attrapé·e ! Un voleur libre peut venir vous délivrer.');
      }
    }
    if (d.action === 'free' && d.target && game.caught[d.target]) {
      delete game.caught[d.target];
      if (d.target === Network.mySocketId) UI.showNotification('🔓 Délivré·e ! Filez !');
    }
  }

  /* ================== DESSIN (statuts + jeu) ================== */

  function draw(ctx) {
    // Badges de statut au-dessus des têtes
    function badge(sid, x, y) {
      var st = statuses[sid];
      if (!st && sid !== Network.mySocketId) {
        var rp = Network.remotePlayers.get(sid);
        if (rp && rp.status) st = rp.status;
      }
      var role = game && game.roles[sid];
      var txt = '';
      if (role === 'cop') txt = '👮';
      else if (role === 'robber') txt = game.caught[sid] ? '⛓' : '🦹';
      if (st) txt = txt ? st + txt : st;
      if (!txt) return;
      var pos = Board.iso(x, y);
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(txt, pos.x + 22, pos.y - 56);
    }
    badge(Network.mySocketId, Engine.player.x, Engine.player.y);
    Network.remotePlayers.forEach(function(p, sid) {
      if (p.opacity > 0) badge(sid, p.renderX, p.renderY);
    });

    // Prison du jeu : cercle pointillé + barreaux
    if (game) {
      var pp = Board.iso(game.prison.x, game.prison.y);
      ctx.save();
      ctx.translate(pp.x, pp.y);
      ctx.scale(1, 0.5);
      ctx.strokeStyle = 'rgba(60,60,80,0.5)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, Board.tileWidth * 1.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      ctx.font = '700 12px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(60,60,80,0.7)';
      ctx.fillText('🚔 Prison', pp.x, pp.y - Board.tileHeight * 1.6);
      // Compte à rebours du jeu
      var left = Math.max(0, Math.ceil((game.endsAt - Date.now()) / 1000));
      ctx.font = '700 13px "Space Grotesk", sans-serif';
      ctx.fillText('👮 ' + Math.floor(left / 60) + ':' + ('0' + (left % 60)).slice(-2), pp.x, pp.y - Board.tileHeight * 2.4);
    }
  }

  /* ================== INIT ================== */

  function init() {
    if (!document.getElementById('game-canvas')) return; // page salle uniquement
    var wait = setInterval(function() {
      if (typeof Network === 'undefined' || !Network.socket) return;
      clearInterval(wait);
      buildStatusButton();
      restoreMyStatus();
      buildFacilitationKit();
      wireTimerExtras();
      wirePushToTalk();
      watchAfk();
      // Projecteur de la roue de la fortune
      Network.socket.on('effect-triggered', function(d) {
        if (d.type === 'spotlight' && d.targetSocketId) {
          Engine.spotlight = d.targetSocketId;
          setTimeout(function() { if (Engine.spotlight === d.targetSocketId) Engine.spotlight = null; }, 8000);
        }
      });
    }, 400);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { draw: draw, onStatus: onStatus, onGameEvent: onGameEvent };
})();
