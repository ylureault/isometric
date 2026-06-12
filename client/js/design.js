// Design « Insuffle Espace » : comportements DOM du nouveau chrome.
// - Pastilles de personnalisation d'avatar (pilotent les inputs couleur cachés)
// - Chips d'accessoires (pilotent le <select> caché)
// - Sélecteur de thèmes dans le panneau admin
// - Lien d'invitation dans la room card
// Aucune dépendance dure : chaque bloc se désactive si l'élément est absent.

(function() {
  'use strict';

  // Palettes du design (furniture.js du prototype)
  var PALETTES = {
    skin: ['#f4c9a3', '#e8b288', '#c98e63', '#a06a43', '#7c4f30'],
    hair: ['#2b2320', '#6b4423', '#caa14e', '#b34a2f', '#8a8f99', '#5b3a8c'],
    top:  ['#6b6cff', '#ff8a5c', '#39b58a', '#e85c8a', '#3a3f55', '#f2c14e'],
    pant: ['#2f3852', '#5b4636', '#3a3f55', '#6b6cff', '#444b60'],
  };

  function buildSwatches() {
    document.querySelectorAll('.swatches[data-input]').forEach(function(row) {
      var input = document.getElementById(row.dataset.input);
      var palette = PALETTES[row.dataset.palette];
      if (!input || !palette) return;
      palette.forEach(function(color, i) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch' + (input.value.toLowerCase() === color.toLowerCase() ? ' sel' : '');
        b.style.background = color;
        b.setAttribute('aria-label', row.dataset.palette + ' ' + (i + 1));
        b.addEventListener('click', function() {
          input.value = color;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          row.querySelectorAll('.swatch').forEach(function(x) { x.classList.remove('sel'); });
          b.classList.add('sel');
        });
        row.appendChild(b);
      });
    });
  }

  function buildAccessoryChips() {
    var box = document.getElementById('ob-acc');
    var select = document.getElementById('accessory-select');
    if (!box || !select) return;
    Array.prototype.forEach.call(select.options, function(opt) {
      var c = document.createElement('button');
      c.type = 'button';
      c.className = 'acc-chip' + (select.value === opt.value ? ' sel' : '');
      c.textContent = opt.textContent;
      c.addEventListener('click', function() {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        box.querySelectorAll('.acc-chip').forEach(function(x) { x.classList.remove('sel'); });
        c.classList.add('sel');
      });
      box.appendChild(c);
    });
  }

  // « 🎲 Surprends-moi » : avatar aléatoire en un clic
  function wireRandomAvatar() {
    var btn = document.getElementById('ob-random');
    if (!btn) return;
    btn.addEventListener('click', function() {
      document.querySelectorAll('.swatches[data-input]').forEach(function(row) {
        var sw = row.querySelectorAll('.swatch');
        if (sw.length) sw[Math.floor(Math.random() * sw.length)].click();
      });
      var chips = document.querySelectorAll('#ob-acc .acc-chip');
      if (chips.length) chips[Math.floor(Math.random() * chips.length)].click();
    });
  }

  // Mémorise la salle pour la liste « Récentes » de l'accueil
  function rememberRoom(roomId) {
    try {
      var name = (typeof Engine !== 'undefined' && Engine.roomConfig) ? Engine.roomConfig.name : '';
      var recent = JSON.parse(localStorage.getItem('insuffle_recent') || '[]');
      recent = recent.filter(function(r) { return r.id !== roomId; });
      recent.unshift({ id: roomId, name: name, ts: Date.now() });
      localStorage.setItem('insuffle_recent', JSON.stringify(recent.slice(0, 6)));
    } catch (e) {}
  }

  // Room card : remplit le champ lien quand l'invitation devient disponible
  function wireShareLink() {
    if (typeof UI === 'undefined' || !UI.showCopyLink) return;
    var orig = UI.showCopyLink.bind(UI);
    UI.showCopyLink = function(roomId) {
      orig(roomId);
      rememberRoom(roomId);
      var input = document.getElementById('room-url-display');
      if (input && UI.shareUrl) {
        input.value = UI.shareUrl.replace(/^https?:\/\//, '');
        input.hidden = false;
        if (!input._copyWired) {
          input._copyWired = true;
          input.addEventListener('click', function() {
            input.select();
            if (navigator.clipboard) {
              navigator.clipboard.writeText(UI.shareUrl).then(function() {
                if (UI.showNotification) UI.showNotification('Lien copié ✓', 'success');
              }).catch(function() {});
            }
          });
        }
      }
    };
  }

  // Sélecteur de thèmes (onglet Thème, admin) + thème reçu du réseau
  function wireThemes() {
    if (typeof Themes === 'undefined') return;
    Themes.restore();
    Themes.buildPicker('theme-picker');
    // Resélectionne la pastille active quand le thème change (réseau ou local)
    Themes.onChange = function() {
      var picker = document.getElementById('theme-picker');
      if (!picker) return;
      var labels = Object.keys(Themes.THEMES);
      picker.querySelectorAll('.theme-sw').forEach(function(el, i) {
        el.classList.toggle('sel', labels[i] === Themes.current);
      });
    };
  }

  // Rayon de parole (admin) : presets en mètres, synchronisés à toute la salle
  function wireRadiusPresets() {
    var box = document.getElementById('radius-presets');
    if (!box) return;
    box.querySelectorAll('.radius-preset').forEach(function(b) {
      b.addEventListener('click', function() {
        var r = parseFloat(b.dataset.radius);
        if (typeof Network !== 'undefined' && Network.socket) {
          Network.socket.emit('set-audio-radius', { radius: r }, function(resp) {
            if (resp && resp.error && typeof UI !== 'undefined') {
              UI.showNotification('Seul un administrateur peut changer le rayon de parole', 'warning');
            }
          });
        }
        box.querySelectorAll('.radius-preset').forEach(function(x) { x.classList.remove('active'); });
        b.classList.add('active');
      });
    });
  }

  // Espace d'écran par table : quand on s'assoit à une table de travail,
  // une pastille propose d'ouvrir l'espace de partage d'écran de cette table.
  // Le serveur crée l'espace à la volée (spaceId « table:<id> »).
  function wireTableSpace() {
    if (typeof Engine === 'undefined' || !document.getElementById('game-canvas')) return;
    var pill = document.createElement('button');
    pill.id = 'table-space-pill';
    pill.className = 'table-space-pill glass';
    pill.style.display = 'none';
    pill.setAttribute('aria-label', "Ouvrir l'espace d'écran de la table");
    document.body.appendChild(pill);

    var currentTableId = null;
    pill.addEventListener('click', function() {
      if (!currentTableId) return;
      var t = Engine.tables.get(currentTableId);
      var name = t && t.name ? t.name : 'Table';
      UI.openCollabSpace('table:' + currentTableId, 'Table « ' + name + ' » — Partage d\'écran');
    });

    setInterval(function() {
      var tid = Engine.player ? Engine.player.tableId : null;
      if (tid === currentTableId) return;
      currentTableId = tid;
      if (tid && Engine.tables.get(tid)) {
        var t = Engine.tables.get(tid);
        pill.innerHTML = '<span class="tsp-dot"></span>🖥️ Espace de la table « ' +
          (t.name || 'Table') + ' » <span class="tsp-hint">Partager un écran</span>';
        pill.style.display = 'flex';
      } else {
        pill.style.display = 'none';
      }
    }, 600);
  }

  // #5 Test micro avant d'entrer : vu-mètre live, libération propre du flux
  function wireMicTest() {
    var btn = document.getElementById('mic-test');
    var bar = document.getElementById('mic-test-bar');
    var label = document.getElementById('mic-test-label');
    if (!btn || !navigator.mediaDevices) return;
    var stream = null, raf = null, ac = null, stopT = null;
    function stop(msg) {
      if (raf) cancelAnimationFrame(raf);
      if (stopT) clearTimeout(stopT);
      if (stream) stream.getTracks().forEach(function(t) { t.stop(); });
      if (ac) try { ac.close(); } catch (e) {}
      stream = null; raf = null; ac = null;
      btn.classList.remove('active');
      bar.style.width = '0%';
      label.textContent = msg || '🎙 Tester mon micro';
    }
    btn.addEventListener('click', function() {
      if (stream) { stop(); return; }
      label.textContent = '… autorisation ?';
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function(st) {
        stream = st;
        btn.classList.add('active');
        label.textContent = 'Parlez ! (clic pour arrêter)';
        ac = new (window.AudioContext || window.webkitAudioContext)();
        var src = ac.createMediaStreamSource(st);
        var an = ac.createAnalyser();
        an.fftSize = 512;
        src.connect(an);
        var data = new Uint8Array(an.frequencyBinCount);
        var heard = false;
        (function tick() {
          an.getByteFrequencyData(data);
          var sum = 0;
          for (var i = 0; i < data.length; i++) sum += data[i];
          var lvl = Math.min(100, (sum / data.length) * 1.8);
          bar.style.width = lvl + '%';
          if (lvl > 18 && !heard) { heard = true; label.textContent = '✅ On vous entend parfaitement'; }
          raf = requestAnimationFrame(tick);
        })();
        stopT = setTimeout(function() { stop(heard ? '✅ Micro OK — re-tester' : '🎙 Tester mon micro'); }, 8000);
      }).catch(function() {
        stop('❌ Micro refusé — vérifiez les permissions du navigateur');
      });
    });
  }

  function init() {
    buildSwatches();
    buildAccessoryChips();
    wireRandomAvatar();
    wireMicTest();
    wireShareLink();
    wireThemes();
    wireRadiusPresets();
    wireTableSpace();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
