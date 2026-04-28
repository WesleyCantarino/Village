// =============================================================================
// CONFIGURAÇÃO DO JOGO - Village Wars
// Ajuste os valores abaixo para parametrizar a experiência de jogo
// =============================================================================

const CONFIG = {

  // ---------------------------------------------------------------------------
  // VELOCIDADE GLOBAL
  // 1 = velocidade normal (como Tribal Wars)
  // 2 = 2x mais rápido (bom para testes)
  // 10 = 10x (modo turbo - veja construções completarem em segundos)
  // ---------------------------------------------------------------------------
  GAME_SPEED: 1,

  // ---------------------------------------------------------------------------
  // REDUÇÃO DE TEMPO DE CONSTRUÇÃO PELA SEDE
  // Cada nível da Sede reduz o tempo de construção por este percentual
  // Ex: 0.02 = 2% por nível → Sede nível 10 = 20% mais rápido
  // ---------------------------------------------------------------------------
  HQ_BUILD_REDUCTION_PER_LEVEL: 0.02,

  // ---------------------------------------------------------------------------
  // PRODUÇÃO DE RECURSOS
  // ---------------------------------------------------------------------------

  // Produção base por hora no nível 1 de cada edificação de recurso
  BASE_PRODUCTION: {
    wood: 30,
    clay: 30,
    iron: 30,
  },

  // Multiplicador de produção por nível (produção = base × fator^(nível-1))
  PRODUCTION_FACTOR: 1.163,

  // ---------------------------------------------------------------------------
  // ARMAZENAMENTO
  // ---------------------------------------------------------------------------

  // Capacidade base do armazém nível 0 (sem armazém)
  BASE_STORAGE: 800,

  // Capacidade do armazém no nível 1
  WAREHOUSE_BASE: 1000,

  // Multiplicador de capacidade por nível do armazém
  STORAGE_FACTOR: 1.232,

  // ---------------------------------------------------------------------------
  // FAZENDA / POPULAÇÃO
  // ---------------------------------------------------------------------------

  // Capacidade base da fazenda nível 1
  BASE_FARM_CAPACITY: 240,

  // Multiplicador de capacidade por nível
  FARM_CAPACITY_FACTOR: 1.172,

  // ---------------------------------------------------------------------------
  // RECURSOS INICIAIS AO CRIAR ALDEIA
  // ---------------------------------------------------------------------------
  STARTING_RESOURCES: {
    wood: 500,
    clay: 500,
    iron: 500,
  },

  // ---------------------------------------------------------------------------
  // EDIFICAÇÕES
  // Cada edificação tem:
  //   name        - Nome exibido
  //   description - Descrição do efeito
  //   icon        - Emoji do ícone
  //   color       - Cor temática (hex)
  //   maxLevel    - Nível máximo
  //   baseCost    - Custo base (nível 0→1)
  //   costFactor  - Multiplicador de custo por nível
  //   baseTime    - Tempo base em segundos (nível 0→1)
  //   timeFactor  - Multiplicador de tempo por nível
  //   requirements- Pré-requisitos { edificacao: nivelMinimo }
  //   category    - 'main', 'resource', 'support', 'military'
  //   position    - Posição visual no mapa { left: '%', top: '%' }
  // ---------------------------------------------------------------------------
  BUILDINGS: {

    headquarters: {
      name: 'Sede',
      description: 'O coração da sua aldeia. Cada nível reduz o tempo de construção de todas as obras em 2%.',
      icon: '🏛️',
      color: '#8B4513',
      maxLevel: 30,
      baseCost: { wood: 90, clay: 80, iron: 70 },
      costFactor: 1.26,
      baseTime: 900,
      timeFactor: 1.20,
      category: 'main',
      position: { left: '50%', top: '50%' },
    },

    timberCamp: {
      name: 'Florestal',
      description: 'Derruba árvores e produz madeira continuamente. Cada nível aumenta a produção.',
      icon: '🌲',
      color: '#228B22',
      maxLevel: 30,
      baseCost: { wood: 100, clay: 80, iron: 30 },
      costFactor: 1.25,
      baseTime: 720,
      timeFactor: 1.17,
      category: 'resource',
      resource: 'wood',
      position: { left: '20%', top: '20%' },
    },

    clayPit: {
      name: 'Pedreira de Argila',
      description: 'Extrai argila do solo. Cada nível aumenta a produção de argila.',
      icon: '🏺',
      color: '#CD853F',
      maxLevel: 30,
      baseCost: { wood: 65, clay: 100, iron: 40 },
      costFactor: 1.265,
      baseTime: 720,
      timeFactor: 1.17,
      category: 'resource',
      resource: 'clay',
      position: { left: '80%', top: '20%' },
    },

    ironMine: {
      name: 'Mina de Ferro',
      description: 'Extrai minério de ferro das profundezas. Cada nível aumenta a produção.',
      icon: '⚒️',
      color: '#708090',
      maxLevel: 30,
      baseCost: { wood: 75, clay: 65, iron: 70 },
      costFactor: 1.252,
      baseTime: 900,
      timeFactor: 1.17,
      category: 'resource',
      resource: 'iron',
      position: { left: '50%', top: '82%' },
    },

    farm: {
      name: 'Fazenda',
      description: 'Alimenta os habitantes da aldeia. Cada nível aumenta a capacidade populacional.',
      icon: '🌾',
      color: '#DAA520',
      maxLevel: 30,
      baseCost: { wood: 45, clay: 40, iron: 0 },
      costFactor: 1.30,
      baseTime: 1800,
      timeFactor: 1.22,
      category: 'support',
      position: { left: '18%', top: '80%' },
    },

    warehouse: {
      name: 'Armazém',
      description: 'Armazena seus preciosos recursos. Cada nível aumenta significativamente a capacidade.',
      icon: '🏗️',
      color: '#8B6914',
      maxLevel: 30,
      baseCost: { wood: 60, clay: 50, iron: 40 },
      costFactor: 1.265,
      baseTime: 1080,
      timeFactor: 1.165,
      category: 'support',
      position: { left: '82%', top: '80%' },
    },

    barracks: {
      name: 'Quartel',
      description: 'Treina soldados e unidades militares. Necessário para defender e atacar outras aldeias.',
      icon: '⚔️',
      color: '#B22222',
      maxLevel: 25,
      requirements: { headquarters: 3 },
      baseCost: { wood: 200, clay: 170, iron: 90 },
      costFactor: 1.26,
      baseTime: 2700,
      timeFactor: 1.20,
      category: 'military',
      position: { left: '18%', top: '50%' },
    },

    smithy: {
      name: 'Ferraria',
      description: 'Forja armamentos e pesquisa melhorias para suas tropas. Cada nível habilita upgrades mais poderosos.',
      icon: '🔨',
      color: '#696969',
      maxLevel: 20,
      requirements: { headquarters: 5, barracks: 1 },
      baseCost: { wood: 220, clay: 180, iron: 200 },
      costFactor: 1.26,
      baseTime: 3600,
      timeFactor: 1.20,
      category: 'military',
      position: { left: '82%', top: '50%' },
    },

    market: {
      name: 'Mercado',
      description: 'Permite trocar recursos com aldeias aliadas. Cada nível aumenta a capacidade de comércio.',
      icon: '🏪',
      color: '#4169E1',
      maxLevel: 25,
      requirements: { headquarters: 3, warehouse: 2 },
      baseCost: { wood: 100, clay: 100, iron: 100 },
      costFactor: 1.26,
      baseTime: 2400,
      timeFactor: 1.20,
      category: 'support',
      position: { left: '50%', top: '20%' },
    },

    wall: {
      name: 'Muralha',
      description: 'Protege a aldeia de invasores. Cada nível aumenta drasticamente a capacidade defensiva.',
      icon: '🏰',
      color: '#A9A9A9',
      maxLevel: 20,
      requirements: { barracks: 1 },
      baseCost: { wood: 50, clay: 100, iron: 20 },
      costFactor: 1.265,
      baseTime: 3600,
      timeFactor: 1.265,
      category: 'military',
      isWall: true,
      position: { left: '50%', top: '50%' },
    },

  },
};

module.exports = CONFIG;
