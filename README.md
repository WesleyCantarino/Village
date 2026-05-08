# Village Wars

Jogo de gerenciamento de aldeias medievais no estilo browser, inspirado em Tribal Wars. Construa e evolua sua aldeia coletando recursos, erguendo edificações e expandindo seu poder no mapa mundial.

## Visão Geral

- Interface isométrica 3D renderizada em Canvas HTML5
- Produção de recursos em tempo real (madeira, argila, ferro)
- Fila de construção com múltiplos slots desbloqueáveis
- Mapa mundial 20x20 com aldeias persistentes
- Tema medieval em português (BR)

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Node.js 20 + Express.js |
| Banco de dados | sql.js (SQLite em JavaScript) |
| Frontend | Vanilla JS + Canvas API |
| Infraestrutura | Docker + Docker Compose |

## Pré-requisitos

- [Docker](https://www.docker.com/) e Docker Compose, **ou**
- Node.js 20+

## Como Executar

### Docker (recomendado)

```bash
docker-compose up --build
```

Acesse em: [http://localhost:3000](http://localhost:3000)

O banco de dados é persistido no volume `./data/village.db`.

### Desenvolvimento local

```bash
npm install
npm start
```

## Estrutura do Projeto

```
Village/
├── src/
│   ├── server.js          # Ponto de entrada — Express na porta 3000
│   ├── database.js        # Camada de dados com sql.js
│   ├── routes/
│   │   └── api.js         # Endpoints REST
│   ├── game/
│   │   ├── engine.js      # Cálculos de produção, custo e tempo
│   │   └── config.js      # Definições de edificações e parâmetros globais
│   └── public/
│       ├── index.html     # Tela de login/cadastro
│       ├── game.html      # Interface principal do jogo
│       ├── js/game.js     # Renderização isométrica e lógica cliente
│       └── css/style.css  # Tema medieval
├── data/
│   └── village.db         # Banco SQLite (gerado automaticamente)
├── Dockerfile
└── docker-compose.yml
```

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/config` | Configurações do jogo (edificações, parâmetros) |
| `POST` | `/api/player/create` | Criar conta de jogador |
| `POST` | `/api/player/login` | Login |
| `GET` | `/api/village/:id` | Estado da aldeia (recursos, edificações, fila) |
| `POST` | `/api/village/:id/build` | Iniciar construção/upgrade |
| `POST` | `/api/village/:id/cancel-build` | Cancelar construção (reembolso de 75%) |
| `GET` | `/api/map` | Dados do mapa mundial |

## Mecânicas de Jogo

### Edificações

São 10 edificações, cada uma com nível máximo entre 20 e 30:

| Edificação | Função |
|------------|--------|
| Sede (HQ) | Reduz o tempo de construção em 2% por nível |
| Acampamento Madeireiro | Produz madeira |
| Mina de Argila | Produz argila |
| Mina de Ferro | Produz ferro |
| Fazenda | Aumenta o limite de população |
| Armazém | Aumenta a capacidade de armazenamento |
| Mercado | Comércio (placeholder) |
| Quartel | Unidades militares (placeholder) |
| Ferraria | Melhora equipamentos (placeholder) |
| Muralha | Bônus de defesa |

### Produção de Recursos

A produção segue crescimento exponencial:

```
produção = base × fator^nível
```

- `BASE_PRODUCTION`: 30 recursos/hora no nível 1
- `PRODUCTION_FACTOR`: 1,163 (crescimento de ~16,3% por nível)
- Armazenamento base: 1.000 unidades, crescendo com fator 1,232

### Fila de Construção

- 1 slot padrão; 2 slots ao atingir HQ nível 5
- Cancelamento reembolsa 75% dos recursos investidos
- O tempo de construção diminui conforme o nível da Sede

## Variáveis de Ambiente

Configuráveis no `docker-compose.yml` ou diretamente:

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta do servidor |
| `DB_PATH` | `/app/data/village.db` | Caminho do banco de dados |
| `NODE_ENV` | `production` | Ambiente de execução |

Para acelerar o jogo em desenvolvimento, edite `GAME_SPEED` em [src/game/config.js](src/game/config.js) (ex.: `10` = velocidade 10x).
