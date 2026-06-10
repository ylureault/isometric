// Themes: palettes d'ambiance du design « Insuffle Espace » (Jour, Nuit,
// Corporate, Nature, Festif). Chaque thème pilote les variables CSS du chrome
// ET les couleurs canvas de la scène (sol, murs). Synchronisé entre
// participants via update-theme { preset } (admin) et localStorage (visiteur).

var Themes = {
  THEMES: {
    jour: {
      label: 'Jour', dot: '#7c8bff',
      vars: {
        '--bg-1': '#eef1fc', '--bg-2': '#dfe4f5', '--bg-glowc': 'rgba(123,139,255,.30)',
        '--floor-a': '#d3e2cf', '--floor-b': '#c3d6bf', '--floor-edge': '#a9c0a6', '--floor-side': '#9fb89c',
        '--wall-l': '#e9edf5', '--wall-r': '#dde3ee', '--wall-top': '#f5f7fc', '--wall-line': '#cdd5e3',
        '--accent': '#5b6cff', '--accent-2': '#ff9d7a',
        '--ink': '#1d2138', '--text': '#222842', '--muted': '#737b96',
        '--panel': 'rgba(255,255,255,.72)', '--panel-solid': '#ffffff', '--panel-border': 'rgba(20,28,60,.08)',
        '--shadow': '0 18px 50px -22px rgba(28,36,80,.42)', '--ring': 'rgba(91,108,255,.32)',
      },
      ambient: null,
    },
    nuit: {
      label: 'Nuit', dot: '#8a97ff',
      vars: {
        '--bg-1': '#0f1538', '--bg-2': '#070a1e', '--bg-glowc': 'rgba(108,124,255,.28)',
        '--floor-a': '#222c54', '--floor-b': '#1b2447', '--floor-edge': '#3a4684', '--floor-side': '#141c3a',
        '--wall-l': '#161e42', '--wall-r': '#111935', '--wall-top': '#1d2750', '--wall-line': '#2c3766',
        '--accent': '#8a97ff', '--accent-2': '#ffb27a',
        '--ink': '#eef1ff', '--text': '#e4e8ff', '--muted': '#9aa3cf',
        '--panel': 'rgba(20,27,58,.72)', '--panel-solid': '#161d3e', '--panel-border': 'rgba(150,165,255,.16)',
        '--shadow': '0 22px 60px -20px rgba(0,0,0,.6)', '--ring': 'rgba(138,151,255,.4)',
      },
      ambient: { bg: 'radial-gradient(120% 90% at 50% 30%, rgba(20,30,80,0) 30%, rgba(6,9,26,.55) 100%)', blend: 'multiply', op: 1 },
      dark: true,
    },
    corporate: {
      label: 'Corporate', dot: '#2f6df0',
      vars: {
        '--bg-1': '#eef2f8', '--bg-2': '#e0e7f1', '--bg-glowc': 'rgba(47,109,240,.22)',
        '--floor-a': '#d7dee8', '--floor-b': '#c8d2de', '--floor-edge': '#aebccd', '--floor-side': '#a6b3c4',
        '--wall-l': '#eef2f7', '--wall-r': '#e2e8f0', '--wall-top': '#f7fafc', '--wall-line': '#cfd8e3',
        '--accent': '#2f6df0', '--accent-2': '#00b3a6',
        '--ink': '#16223a', '--text': '#1b2740', '--muted': '#6a7790',
        '--panel': 'rgba(255,255,255,.78)', '--panel-solid': '#ffffff', '--panel-border': 'rgba(20,34,60,.08)',
        '--shadow': '0 18px 48px -22px rgba(20,40,90,.4)', '--ring': 'rgba(47,109,240,.3)',
      },
      ambient: null,
    },
    nature: {
      label: 'Nature', dot: '#3f9a5a',
      vars: {
        '--bg-1': '#f2efe2', '--bg-2': '#e6e3cf', '--bg-glowc': 'rgba(63,154,90,.22)',
        '--floor-a': '#d2c39c', '--floor-b': '#c5b58c', '--floor-edge': '#ab986c', '--floor-side': '#a08c63',
        '--wall-l': '#efe9d8', '--wall-r': '#e4ddc7', '--wall-top': '#f6f1e4', '--wall-line': '#d6cdb5',
        '--accent': '#3f9a5a', '--accent-2': '#d98a4a',
        '--ink': '#26301f', '--text': '#2c3624', '--muted': '#76795f',
        '--panel': 'rgba(255,253,246,.78)', '--panel-solid': '#fffdf6', '--panel-border': 'rgba(50,60,30,.1)',
        '--shadow': '0 18px 48px -22px rgba(60,70,30,.38)', '--ring': 'rgba(63,154,90,.32)',
      },
      ambient: { bg: 'radial-gradient(120% 100% at 60% 20%, rgba(255,235,170,.18), rgba(255,235,170,0) 60%)', blend: 'soft-light', op: 1 },
    },
    festif: {
      label: 'Festif', dot: '#e85c9a',
      vars: {
        '--bg-1': '#f7ecfb', '--bg-2': '#ece1fb', '--bg-glowc': 'rgba(232,92,154,.26)',
        '--floor-a': '#ecd9ff', '--floor-b': '#e0c8ff', '--floor-edge': '#c8a6f0', '--floor-side': '#bd9ae8',
        '--wall-l': '#f3ecfb', '--wall-r': '#e9defa', '--wall-top': '#faf5ff', '--wall-line': '#ddccf0',
        '--accent': '#e85c9a', '--accent-2': '#ffb14e',
        '--ink': '#36214a', '--text': '#3d2752', '--muted': '#8a7299',
        '--panel': 'rgba(255,251,255,.78)', '--panel-solid': '#fffbff', '--panel-border': 'rgba(60,30,70,.1)',
        '--shadow': '0 18px 50px -22px rgba(90,40,110,.4)', '--ring': 'rgba(232,92,154,.32)',
      },
      ambient: { bg: 'radial-gradient(120% 100% at 50% 10%, rgba(255,210,120,.2), rgba(255,210,120,0) 55%)', blend: 'soft-light', op: 1 },
      confetti: true,
    },
  },

  current: 'jour',

  apply(key, opts) {
    opts = opts || {};
    var t = this.THEMES[key];
    if (!t) return;
    this.current = key;
    var root = document.documentElement;
    Object.keys(t.vars).forEach(function(k) { root.style.setProperty(k, t.vars[k]); });
    root.setAttribute('data-theme', key);
    document.body.classList.toggle('ui-dark-mode', !!t.dark);
    var amb = document.getElementById('ambient');
    if (amb) {
      if (t.ambient) { amb.style.background = t.ambient.bg; amb.style.mixBlendMode = t.ambient.blend; amb.style.opacity = t.ambient.op; }
      else { amb.style.background = 'none'; amb.style.opacity = 0; }
    }
    // Scène canvas : sol + murs suivent le thème
    if (typeof Board !== 'undefined') {
      Board.floorColor1 = t.vars['--floor-a'];
      Board.floorColor2 = t.vars['--floor-b'];
      Board.wallColor = t.vars['--wall-l'];
    }
    try { localStorage.setItem('insuffle_theme', key); } catch (e) {}
    if (t.confetti && !opts.silent && typeof UXEnhancements !== 'undefined' && UXEnhancements.confettiBurst) {
      UXEnhancements.confettiBurst();
    }
    if (this.onChange) this.onChange(key);
  },

  // Bascule admin : applique localement + synchronise la salle via preset
  applyAndSync(key) {
    this.apply(key);
    var t = this.THEMES[key];
    if (t && typeof Network !== 'undefined' && Network.socket) {
      Network.socket.emit('update-theme', {
        preset: key,
        floorColor1: t.vars['--floor-a'],
        floorColor2: t.vars['--floor-b'],
      }, function() {});
    }
  },

  swatchBg(t) {
    return 'linear-gradient(135deg,' + t.vars['--accent'] + ' 0 45%,' + t.vars['--floor-b'] + ' 45% 72%,' + t.vars['--wall-l'] + ' 72%)';
  },

  // Construit les pastilles de thème dans l'onglet Thème du panneau admin
  buildPicker(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    var self = this;
    Object.keys(this.THEMES).forEach(function(k) {
      var t = self.THEMES[k];
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'theme-sw' + (self.current === k ? ' sel' : '');
      b.innerHTML = '<span class="sw" style="background:' + self.swatchBg(t) + '"></span>' + t.label;
      b.onclick = function() {
        self.applyAndSync(k);
        el.querySelectorAll('.theme-sw').forEach(function(x) { x.classList.remove('sel'); });
        b.classList.add('sel');
      };
      el.appendChild(b);
    });
  },

  restore() {
    var key = 'jour';
    try { key = localStorage.getItem('insuffle_theme') || 'jour'; } catch (e) {}
    this.apply(this.THEMES[key] ? key : 'jour', { silent: true });
  },
};

if (typeof module !== 'undefined' && module.exports) module.exports = Themes;
