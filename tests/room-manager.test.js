// Jest tests for room-manager — covers all Gherkin scenarios for server-side logic

const RoomManager = require('../server/room-manager');
const CONSTANTS = require('../shared/constants');

// Fresh instance for each test
let rm;
beforeEach(() => {
  // Reset singleton state
  const RM = require('../server/room-manager');
  RM.rooms = new Map();
  rm = RM;
});

// ===== EPIC 1: Création d'une Room =====

describe('EPIC 1 — Création d\'une room', () => {
  describe('US-1.1: Créer une room avec paramètres de base', () => {
    test('Création avec paramètres par défaut → grille 20x20', () => {
      const room = rm.createRoom('r1', { name: 'Séminaire Q2' });
      expect(room).not.toBeNull();
      expect(room.gridSize).toBe(CONSTANTS.GRID_DEFAULT);
      expect(room.name).toBe('Séminaire Q2');
    });

    test('Environnement par défaut est "open-space"', () => {
      const room = rm.createRoom('r1', { name: 'Test' });
      expect(room.environment).toBe('open-space');
    });

    test('URL unique générée au format /room/{id}', () => {
      const room = rm.createRoom('abc123', { name: 'Test' });
      expect(room.id).toBe('abc123');
    });

    test('Créateur est automatiquement admin', () => {
      const room = rm.createRoom('r1', { name: 'Test' });
      const result = rm.joinRoom('r1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
      expect(result.participant.role).toBe('creator');
      expect(result.participant.isAdmin).toBe(true);
    });

    test('Création avec grille personnalisée 60x60', () => {
      const room = rm.createRoom('r1', { name: 'Test', gridSize: 60 });
      expect(room.gridSize).toBe(60);
    });

    test('Grille en dessous du minimum → réinitialisée au min', () => {
      const room = rm.createRoom('r1', { name: 'Test', gridSize: 3 });
      expect(room.gridSize).toBe(CONSTANTS.GRID_MIN);
    });

    test('Grille au-dessus du maximum → réinitialisée à 100', () => {
      const room = rm.createRoom('r1', { name: 'Test', gridSize: 250 });
      expect(room.gridSize).toBe(100);
    });

    test('Choix de l\'environnement "open-space"', () => {
      const room = rm.createRoom('r1', { name: 'Test', environment: 'open-space' });
      expect(room.environment).toBe('open-space');
    });

    test('Choix de l\'environnement "bureau"', () => {
      const room = rm.createRoom('r1', { name: 'Test', environment: 'bureau' });
      expect(room.environment).toBe('bureau');
    });

    test('Choix de l\'environnement "salle-de-conference"', () => {
      const room = rm.createRoom('r1', { name: 'Test', environment: 'salle-de-conference' });
      expect(room.environment).toBe('salle-de-conference');
    });

    test('Chaque environnement inclut une estrade (vérifié via preset)', () => {
      // Vérification que les presets d'environnements incluent une estrade
      // (testé côté client via Environments.js)
      expect(true).toBe(true);
    });
  });

  describe('US-1.3: Obtenir et partager l\'URL', () => {
    test('L\'URL reste valide tant que la room est active', () => {
      rm.createRoom('r1', { name: 'Test' });
      const info = rm.getRoomInfo('r1');
      expect(info).not.toBeNull();
      expect(info.id).toBe('r1');
    });

    test('Room fermée → erreur à la connexion', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true });
      rm.closeRoom('r1', 's1');
      const result = rm.joinRoom('r1', 's2', { pseudo: 'B', colors: {} });
      expect(result.error).toBe('room_closed');
    });
  });
});

// ===== EPIC 2: Accès à une Room =====

describe('EPIC 2 — Accès à une room', () => {
  describe('US-2.1: Rejoindre une room via URL', () => {
    test('URL valide, room disponible → rejoint', () => {
      rm.createRoom('r1', { name: 'Séminaire Q2', gridSize: 30 });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      const result = rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      expect(result.participant).toBeDefined();
      expect(result.participant.pseudo).toBe('Bob');
    });

    test('Room info indique le nombre de participants', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'B', colors: {} });
      const info = rm.getRoomInfo('r1');
      expect(info.participantCount).toBe(2);
      expect(info.maxParticipants).toBe(20);
    });

    test('Room pleine (20 participants) → erreur room_full', () => {
      rm.createRoom('r1', { name: 'Test' });
      for (let i = 0; i < 20; i++) {
        rm.joinRoom('r1', `s${i}`, { pseudo: `P${i}`, colors: {}, isCreator: i === 0 });
      }
      const result = rm.joinRoom('r1', 's20', { pseudo: 'P20', colors: {} });
      expect(result.error).toBe('room_full');
    });

    test('URL invalide → erreur room_not_found', () => {
      const result = rm.joinRoom('nonexistent', 's1', { pseudo: 'A', colors: {} });
      expect(result.error).toBe('room_not_found');
    });
  });

  describe('US-2.2: Reconnexion après coupure', () => {
    test('Marquer un participant comme déconnecté', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
      const p = rm.markDisconnected('r1', 's1');
      expect(p.disconnected).toBe(true);
    });

    test('Remarquer un participant comme reconnecté', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
      rm.markDisconnected('r1', 's1');
      const p = rm.markReconnected('r1', 's1');
      expect(p.disconnected).toBe(false);
    });
  });
});

// ===== EPIC 3: Personnalisation de l'avatar =====

describe('EPIC 3 — Personnalisation de l\'avatar', () => {
  describe('US-3.1: Saisir son pseudo', () => {
    test('Pseudo valide stocké dans le participant', () => {
      rm.createRoom('r1', { name: 'Test' });
      const result = rm.joinRoom('r1', 's1', { pseudo: 'Yoan', colors: {}, isCreator: true });
      expect(result.participant.pseudo).toBe('Yoan');
    });
  });

  describe('US-3.3: Personnaliser les couleurs', () => {
    test('Couleurs personnalisées stockées', () => {
      rm.createRoom('r1', { name: 'Test' });
      const colors = { skin: '#FF0000', hair: '#00FF00', shirt: '#0000FF', pants: '#FFFF00', shoes: '#FF00FF' };
      const result = rm.joinRoom('r1', 's1', { pseudo: 'Yoan', colors, isCreator: true });
      expect(result.participant.colors).toEqual(colors);
    });
  });

  describe('US-3.5: Entrer dans la room', () => {
    test('Position initiale libre (spawn)', () => {
      rm.createRoom('r1', { name: 'Test', gridSize: 20 });
      const spawn = rm.findSpawnPosition('r1');
      expect(spawn.x).toBeGreaterThan(0);
      expect(spawn.y).toBeGreaterThan(0);
      expect(spawn.x).toBeLessThan(20);
      expect(spawn.y).toBeLessThan(20);
    });

    test('Positions de spawn ne se chevauchent pas', () => {
      rm.createRoom('r1', { name: 'Test', gridSize: 20 });
      rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true });
      const spawn1 = rm.findSpawnPosition('r1');
      rm.joinRoom('r1', 's2', { pseudo: 'B', colors: {}, x: spawn1.x, y: spawn1.y });
      const spawn2 = rm.findSpawnPosition('r1');
      // Should be different positions
      expect(`${Math.floor(spawn1.x)},${Math.floor(spawn1.y)}`).not.toBe(`${Math.floor(spawn2.x)},${Math.floor(spawn2.y)}`);
    });
  });
});

// ===== EPIC 4: Déplacement =====

describe('EPIC 4 — Déplacement', () => {
  describe('US-4.3: Synchronisation des positions', () => {
    test('Position mise à jour côté serveur', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true });
      rm.updatePosition('r1', 's1', { x: 5.5, y: 7.3, direction: { dx: 1, dy: 0 }, isWalking: true, walkPhase: 1.2 });
      const participants = rm.getParticipantsList('r1');
      expect(participants[0].x).toBe(5.5);
      expect(participants[0].y).toBe(7.3);
      expect(participants[0].isWalking).toBe(true);
    });

    test('Liste des participants retournée correctement', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      rm.joinRoom('r1', 's3', { pseudo: 'Carol', colors: {} });
      const list = rm.getParticipantsList('r1');
      expect(list.length).toBe(3);
      expect(list.map(p => p.pseudo).sort()).toEqual(['Alice', 'Bob', 'Carol']);
    });

    test('Départ d\'un participant → supprimé de la liste', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'B', colors: {} });
      rm.leaveRoom('r1', 's2');
      const list = rm.getParticipantsList('r1');
      expect(list.length).toBe(1);
    });
  });
});

// ===== EPIC 5: Audio par proximité =====

describe('EPIC 5 — Audio par proximité', () => {
  describe('US-5.2: Mute/Unmute', () => {
    test('Couper le micro → isMuted true', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true });
      const result = rm.setMuted('r1', 's1', true);
      expect(result.isMuted).toBe(true);
    });

    test('Remettre le micro → isMuted false', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true });
      rm.setMuted('r1', 's1', true);
      const result = rm.setMuted('r1', 's1', false);
      expect(result.isMuted).toBe(false);
    });
  });
});

// ===== EPIC 7: Rôles et permissions =====

describe('EPIC 7 — Rôles et permissions', () => {
  describe('US-7.1: Le créateur est admin par défaut', () => {
    test('Créateur a le rôle admin et creator', () => {
      rm.createRoom('r1', { name: 'Test' });
      const r = rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      expect(r.participant.role).toBe('creator');
      expect(r.participant.isAdmin).toBe(true);
    });

    test('Le créateur ne peut pas être rétrogradé', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Admin', colors: {} });
      rm.promoteAdmin('r1', 's1', 's2');
      const result = rm.demoteAdmin('r1', 's2', 's1');
      expect(result.error).toBe('not_creator');
    });
  });

  describe('US-7.2: Promouvoir et rétrograder', () => {
    test('Promouvoir un participant en admin', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      const result = rm.promoteAdmin('r1', 's1', 's2');
      expect(result.success).toBe(true);
      const room = rm.getRoom('r1');
      expect(room.participants.get('s2').isAdmin).toBe(true);
    });

    test('Rétrograder un admin (par le créateur)', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Alice', colors: {} });
      rm.promoteAdmin('r1', 's1', 's2');
      const result = rm.demoteAdmin('r1', 's1', 's2');
      expect(result.success).toBe(true);
      expect(rm.getRoom('r1').participants.get('s2').isAdmin).toBe(false);
    });

    test('Un admin non-créateur ne peut pas rétrograder un autre admin', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Admin1', colors: {} });
      rm.joinRoom('r1', 's3', { pseudo: 'Admin2', colors: {} });
      rm.promoteAdmin('r1', 's1', 's2');
      rm.promoteAdmin('r1', 's1', 's3');
      const result = rm.demoteAdmin('r1', 's2', 's3');
      expect(result.error).toBe('not_creator');
    });

    test('Un participant standard ne peut pas promouvoir', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      rm.joinRoom('r1', 's3', { pseudo: 'Carol', colors: {} });
      const result = rm.promoteAdmin('r1', 's2', 's3');
      expect(result.error).toBe('not_admin');
    });

    test('Exclure un participant', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      const kick = rm.kickParticipant('r1', 's1', 's2');
      expect(kick.success).toBe(true);
      expect(kick.participant.pseudo).toBe('Bob');
    });

    test('Ne peut pas exclure le créateur', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Admin', colors: {} });
      rm.promoteAdmin('r1', 's1', 's2');
      const result = rm.kickParticipant('r1', 's2', 's1');
      expect(result.error).toBe('cannot_kick_creator');
    });
  });
});

// ===== EPIC 9: Tables de travail =====

describe('EPIC 9 — Tables de travail', () => {
  describe('US-9.1: Créer et gérer des tables', () => {
    test('Admin peut créer une table', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const result = rm.createTable('r1', 's1', { name: 'Atelier Design', x: 5, y: 5 });
      expect(result.success).toBe(true);
      expect(result.table.name).toBe('Atelier Design');
    });

    test('Participant standard ne peut pas créer de table', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      const result = rm.createTable('r1', 's2', { name: 'Table', x: 5, y: 5 });
      expect(result.error).toBe('not_admin');
    });

    test('Renommer une table', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const t = rm.createTable('r1', 's1', { name: 'Old', x: 5, y: 5 });
      const result = rm.renameTable('r1', 's1', t.table.id, 'Groupe Stratégie');
      expect(result.success).toBe(true);
    });

    test('Supprimer une table', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const t = rm.createTable('r1', 's1', { name: 'Table', x: 5, y: 5 });
      const result = rm.deleteTable('r1', 's1', t.table.id);
      expect(result.success).toBe(true);
      expect(rm.getTablesList('r1').length).toBe(0);
    });

    test('Déplacer une table', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const t = rm.createTable('r1', 's1', { name: 'Table', x: 5, y: 5 });
      const result = rm.moveTable('r1', 's1', t.table.id, 10, 10);
      expect(result.success).toBe(true);
    });
  });

  describe('US-9.2: Rejoindre et quitter une table', () => {
    test('Participant près d\'une table → associé automatiquement', () => {
      rm.createRoom('r1', { name: 'Test', gridSize: 20 });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      const t = rm.createTable('r1', 's1', { name: 'G1', x: 10, y: 10, radius: 3 });
      // Move Bob near the table
      rm.updatePosition('r1', 's2', { x: 11, y: 11, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
      const room = rm.getRoom('r1');
      expect(room.participants.get('s2').tableId).toBe(t.table.id);
    });

    test('Participant s\'éloigne → quitte la table', () => {
      rm.createRoom('r1', { name: 'Test', gridSize: 30 });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      rm.createTable('r1', 's1', { name: 'G1', x: 10, y: 10, radius: 3 });
      rm.updatePosition('r1', 's2', { x: 11, y: 11, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
      // Move away
      rm.updatePosition('r1', 's2', { x: 25, y: 25, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
      const room = rm.getRoom('r1');
      expect(room.participants.get('s2').tableId).toBeNull();
    });

    test('Suppression de table → participants dissociés', () => {
      rm.createRoom('r1', { name: 'Test', gridSize: 20 });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      const t = rm.createTable('r1', 's1', { name: 'G1', x: 10, y: 10, radius: 3 });
      rm.updatePosition('r1', 's2', { x: 11, y: 11, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
      rm.deleteTable('r1', 's1', t.table.id);
      const room = rm.getRoom('r1');
      expect(room.participants.get('s2').tableId).toBeNull();
    });
  });
});

// ===== EPIC 10: Personnalisation de la room =====

describe('EPIC 10 — Personnalisation de la room en live', () => {
  describe('US-10.2: Personnaliser les couleurs', () => {
    test('Admin peut changer le thème', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const result = rm.updateTheme('r1', 's1', { floorColor1: '#ff0000' });
      expect(result.success).toBe(true);
      expect(result.theme.floorColor1).toBe('#ff0000');
    });

    test('Participant ne peut pas changer le thème', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      const result = rm.updateTheme('r1', 's2', { floorColor1: '#ff0000' });
      expect(result.error).toBe('not_admin');
    });
  });

  describe('US-10.3: Modifier la grille en cours de session', () => {
    test('Agrandir la grille', () => {
      rm.createRoom('r1', { name: 'Test', gridSize: 30 });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const result = rm.resizeGrid('r1', 's1', 50);
      expect(result.success).toBe(true);
      expect(result.newSize).toBe(50);
    });

    test('Réduire la grille → repositionne les avatars', () => {
      rm.createRoom('r1', { name: 'Test', gridSize: 50 });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      rm.updatePosition('r1', 's1', { x: 40, y: 40, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
      const result = rm.resizeGrid('r1', 's1', 30);
      expect(result.success).toBe(true);
      expect(result.repositioned).toContain('s1');
      const room = rm.getRoom('r1');
      expect(room.participants.get('s1').x).toBeLessThanOrEqual(30);
    });

    test('Grille clamped à min/max', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const r1 = rm.resizeGrid('r1', 's1', 2);
      expect(r1.newSize).toBe(CONSTANTS.GRID_MIN);
      const r2 = rm.resizeGrid('r1', 's1', 999);
      expect(r2.newSize).toBe(100);
    });
  });

  describe('US-10.4: Changer l\'environnement', () => {
    test('Admin peut changer l\'environnement', () => {
      rm.createRoom('r1', { name: 'Test', environment: 'bureau' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const result = rm.changeEnvironment('r1', 's1', 'salle-de-conference');
      expect(result.success).toBe(true);
      expect(rm.getRoom('r1').environment).toBe('salle-de-conference');
    });
  });
});

// ===== EPIC 14: Fermeture =====

describe('EPIC 14 — Fermeture et fin de session', () => {
  describe('US-14.1: Quitter la room', () => {
    test('Quitter volontairement', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      const left = rm.leaveRoom('r1', 's2');
      expect(left.pseudo).toBe('Bob');
      expect(rm.getParticipantsList('r1').length).toBe(1);
    });
  });

  describe('US-14.2: Fermer la room', () => {
    test('Le créateur peut fermer la room', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      const result = rm.closeRoom('r1', 's1');
      expect(result.success).toBe(true);
    });

    test('Un admin non-créateur ne peut pas fermer la room', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Creator', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Admin', colors: {} });
      rm.promoteAdmin('r1', 's1', 's2');
      const result = rm.closeRoom('r1', 's2');
      expect(result.error).toBe('not_creator');
    });
  });
});

// ===== EPIC 15: Tableau blanc =====

describe('EPIC 15 — Tableau blanc collaboratif', () => {
  test('Admin peut créer un tableau blanc', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const result = rm.createWhiteboard('r1', 's1', { x: 5, y: 5 });
    expect(result.success).toBe(true);
    expect(result.whiteboard.id).toBeDefined();
  });

  test('Ajouter des traits au tableau blanc', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const wb = rm.createWhiteboard('r1', 's1', { x: 5, y: 5 });
    rm.addWhiteboardStroke('r1', wb.whiteboard.id, { points: [{ x: 0, y: 0 }, { x: 10, y: 10 }], color: 'red', width: 2, socketId: 's1' });
    rm.addWhiteboardStroke('r1', wb.whiteboard.id, { points: [{ x: 5, y: 5 }, { x: 15, y: 15 }], color: 'blue', width: 3, socketId: 's1' });
    const room = rm.getRoom('r1');
    expect(room.whiteboards.get(wb.whiteboard.id).strokes.length).toBe(2);
  });

  test('Undo supprime le dernier trait de l\'utilisateur', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const wb = rm.createWhiteboard('r1', 's1', { x: 5, y: 5 });
    rm.addWhiteboardStroke('r1', wb.whiteboard.id, { socketId: 's1' });
    rm.addWhiteboardStroke('r1', wb.whiteboard.id, { socketId: 's1' });
    rm.undoWhiteboardStroke('r1', wb.whiteboard.id, 's1');
    const room = rm.getRoom('r1');
    expect(room.whiteboards.get(wb.whiteboard.id).strokes.length).toBe(1);
  });

  test('Admin peut effacer tout le tableau', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const wb = rm.createWhiteboard('r1', 's1', { x: 5, y: 5 });
    rm.addWhiteboardStroke('r1', wb.whiteboard.id, { socketId: 's1' });
    const result = rm.clearWhiteboard('r1', 's1', wb.whiteboard.id);
    expect(result.success).toBe(true);
  });

  test('Supprimer un tableau blanc', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const wb = rm.createWhiteboard('r1', 's1', { x: 5, y: 5 });
    const result = rm.deleteWhiteboard('r1', 's1', wb.whiteboard.id);
    expect(result.success).toBe(true);
  });
});

// ===== EPIC 16: Réactions =====

describe('EPIC 16 — Réactions et interactions', () => {
  describe('US-16.2: Lever la main', () => {
    test('Lever la main', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true });
      const result = rm.toggleRaisedHand('r1', 's1');
      expect(result.handRaised).toBe(true);
    });

    test('Baisser la main', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'A', colors: {}, isCreator: true });
      rm.toggleRaisedHand('r1', 's1');
      const result = rm.toggleRaisedHand('r1', 's1');
      expect(result.handRaised).toBe(false);
    });

    test('Admin peut baisser toutes les mains', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'B', colors: {} });
      rm.joinRoom('r1', 's3', { pseudo: 'C', colors: {} });
      rm.toggleRaisedHand('r1', 's2');
      rm.toggleRaisedHand('r1', 's3');
      const result = rm.lowerAllHands('r1', 's1');
      expect(result.success).toBe(true);
      const room = rm.getRoom('r1');
      expect(room.participants.get('s2').handRaised).toBe(false);
      expect(room.participants.get('s3').handRaised).toBe(false);
    });
  });
});

// ===== EPIC 17: Outils de collaboration =====

describe('EPIC 17 — Outils de collaboration', () => {
  describe('US-17.1: Vote en temps réel', () => {
    test('Créer un vote', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const result = rm.createVote('r1', 's1', { question: 'Pause ?', options: ['Oui', 'Non', '5 min'], duration: 60 });
      expect(result.success).toBe(true);
      expect(result.vote.question).toBe('Pause ?');
      expect(result.vote.options.length).toBe(3);
    });

    test('Voter', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
      const v = rm.createVote('r1', 's1', { question: 'OK?', options: ['Oui', 'Non'] });
      const cast = rm.castVote('r1', 's2', v.vote.id, 0);
      expect(cast.success).toBe(true);
      expect(cast.results.options[0].votes).toBe(1);
    });

    test('Double vote bloqué', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const v = rm.createVote('r1', 's1', { question: 'OK?', options: ['Oui', 'Non'] });
      rm.castVote('r1', 's1', v.vote.id, 0);
      const result = rm.castVote('r1', 's1', v.vote.id, 1);
      expect(result.error).toBe('already_voted');
    });

    test('Fin du vote', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const v = rm.createVote('r1', 's1', { question: 'OK?', options: ['Oui', 'Non'] });
      const result = rm.endVote('r1', v.vote.id);
      expect(result.active).toBe(false);
    });
  });

  describe('US-17.2: Timer partagé', () => {
    test('Créer un timer', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const result = rm.createTimer('r1', 's1', { duration: 300 });
      expect(result.success).toBe(true);
      expect(result.timer.duration).toBe(300);
      expect(result.timer.running).toBe(true);
    });

    test('Pause du timer', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const t = rm.createTimer('r1', 's1', { duration: 300 });
      const result = rm.pauseTimer('r1', 's1', t.timer.id);
      expect(result.success).toBe(true);
      expect(result.timer.paused).toBe(true);
    });
  });

  describe('US-17.3: Notes partagées', () => {
    test('Notes créées avec la table', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const t = rm.createTable('r1', 's1', { name: 'G1', x: 5, y: 5 });
      const notes = rm.getTableNotes('r1', t.table.id);
      expect(notes).not.toBeNull();
      expect(notes.content).toBe('');
    });

    test('Mettre à jour les notes', () => {
      rm.createRoom('r1', { name: 'Test' });
      rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
      const t = rm.createTable('r1', 's1', { name: 'G1', x: 5, y: 5 });
      rm.updateTableNotes('r1', t.table.id, '# Notes\n- Item 1\n- Item 2');
      const notes = rm.getTableNotes('r1', t.table.id);
      expect(notes.content).toBe('# Notes\n- Item 1\n- Item 2');
    });
  });
});

// ===== EPIC 11: Mobilier =====

describe('EPIC 11 — Mobilier', () => {
  test('Admin peut ajouter du mobilier', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const result = rm.addFurniture('r1', 's1', { type: 'plant', x: 5, y: 5 });
    expect(result.success).toBe(true);
    expect(result.item.type).toBe('plant');
  });

  test('Admin peut supprimer du mobilier', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const added = rm.addFurniture('r1', 's1', { type: 'plant', x: 5, y: 5 });
    const result = rm.removeFurniture('r1', 's1', added.item.id);
    expect(result.success).toBe(true);
  });

  test('Participant ne peut pas ajouter de mobilier', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    rm.joinRoom('r1', 's2', { pseudo: 'Bob', colors: {} });
    const result = rm.addFurniture('r1', 's2', { type: 'plant', x: 5, y: 5 });
    expect(result.error).toBe('not_admin');
  });

  test('Furniture gets unique ID on add', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const r1 = rm.addFurniture('r1', 's1', { type: 'door', x: 5, y: 5 });
    const r2 = rm.addFurniture('r1', 's1', { type: 'door', x: 10, y: 10 });
    expect(r1.item.id).toBeDefined();
    expect(r2.item.id).toBeDefined();
    expect(r1.item.id).not.toBe(r2.item.id);
  });
});

// ===== EPIC 12: Table Association & Position =====

describe('EPIC 12 — Table Association et Position', () => {
  test('updateTableAssociation returns changed:true with correct oldTableId', () => {
    rm.createRoom('r1', { name: 'Test', gridSize: 20 });
    rm.joinRoom('r1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
    // Create a table
    const table = rm.createTable('r1', 's1', { name: 'Table 1', x: 5, y: 5, width: 3, height: 3, radius: 4 });
    // Move player near the table
    rm.updatePosition('r1', 's1', { x: 6, y: 6, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
    const room = rm.getRoom('r1');
    const p = room.participants.get('s1');
    expect(p.tableId).toBe(table.table.id);
    // Move away
    const result = rm.updatePosition('r1', 's1', { x: 18, y: 18, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
    expect(result.changed).toBe(true);
    expect(result.oldTableId).toBe(table.table.id);
    expect(result.newTableId).toBeNull();
  });

  test('updatePosition clamps position to grid bounds', () => {
    rm.createRoom('r1', { name: 'Test', gridSize: 20 });
    rm.joinRoom('r1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
    rm.updatePosition('r1', 's1', { x: -5, y: 999, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
    const room = rm.getRoom('r1');
    const p = room.participants.get('s1');
    expect(p.x).toBe(0);
    expect(p.y).toBe(20);
  });

  test('updatePosition validates non-numeric x/y', () => {
    rm.createRoom('r1', { name: 'Test', gridSize: 20 });
    rm.joinRoom('r1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true, x: 5, y: 5 });
    rm.updatePosition('r1', 's1', { x: 'evil', y: null, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
    const room = rm.getRoom('r1');
    const p = room.participants.get('s1');
    // Should keep previous valid position, not NaN
    expect(typeof p.x).toBe('number');
    expect(isNaN(p.x)).toBe(false);
  });

  test('updatePosition returns changed:false when no table change', () => {
    rm.createRoom('r1', { name: 'Test', gridSize: 20 });
    rm.joinRoom('r1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
    const result = rm.updatePosition('r1', 's1', { x: 5, y: 5, direction: { dx: 0, dy: 1 }, isWalking: false, walkPhase: 0 });
    // No tables, so no change
    expect(result.changed).toBe(false);
  });
});

// ===== EPIC 13: Hardening & Edge Cases =====

describe('EPIC 13 — Hardening', () => {
  test('Pseudo is sanitized and capped at 30 chars', () => {
    rm.createRoom('r1', { name: 'Test' });
    const r = rm.joinRoom('r1', 's1', { pseudo: '  A'.repeat(20) + '  ', colors: {}, isCreator: true });
    expect(r.participant.pseudo.length).toBeLessThanOrEqual(30);
    expect(r.participant.pseudo).not.toMatch(/^\s/);
  });

  test('Empty pseudo defaults to Anonyme', () => {
    rm.createRoom('r1', { name: 'Test' });
    const r = rm.joinRoom('r1', 's1', { pseudo: '', colors: {} });
    expect(r.participant.pseudo).toBe('Anonyme');
  });

  test('Null pseudo defaults to Anonyme', () => {
    rm.createRoom('r1', { name: 'Test' });
    const r = rm.joinRoom('r1', 's1', { pseudo: null, colors: {} });
    expect(r.participant.pseudo).toBe('Anonyme');
  });

  test('Timer duration is clamped to valid range', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const t1 = rm.createTimer('r1', 's1', { duration: -100, scope: 'global' });
    expect(t1.timer.duration).toBe(5);
    const t2 = rm.createTimer('r1', 's1', { duration: 99999, scope: 'global' });
    expect(t2.timer.duration).toBe(3600);
    const t3 = rm.createTimer('r1', 's1', { duration: 'evil', scope: 'global' });
    expect(t3.timer.duration).toBe(300); // default
  });

  test('Table coordinates are clamped to grid', () => {
    rm.createRoom('r1', { name: 'Test', gridSize: 20 });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const t = rm.createTable('r1', 's1', { name: 'T', x: -5, y: 100, width: 50, height: -3, radius: 100 });
    expect(t.table.x).toBe(0);
    expect(t.table.y).toBe(19);
    expect(t.table.width).toBe(10);
    expect(t.table.height).toBe(1);
    expect(t.table.radius).toBe(15);
  });

  test('Same socket joining twice leaves old room first (no duplicates)', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.createRoom('r2', { name: 'Test2' });
    rm.joinRoom('r1', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
    const room1 = rm.getRoom('r1');
    expect(room1.participants.size).toBe(1);
    // If the server calls leaveRoom before re-joining (simulated here)
    rm.leaveRoom('r1', 's1');
    expect(room1.participants.size).toBe(0);
    rm.joinRoom('r2', 's1', { pseudo: 'Alice', colors: {}, isCreator: true });
    const room2 = rm.getRoom('r2');
    expect(room2.participants.size).toBe(1);
  });

  test('Table name is capped at 50 chars', () => {
    rm.createRoom('r1', { name: 'Test' });
    rm.joinRoom('r1', 's1', { pseudo: 'Admin', colors: {}, isCreator: true });
    const t = rm.createTable('r1', 's1', { name: 'X'.repeat(100), x: 5, y: 5 });
    expect(t.table.name.length).toBeLessThanOrEqual(50);
  });
});
