# InfinityWork

Sistema modular de arquivos, documentos e (futuramente) planilhas, self-hosted, com uma única porta de entrada web — pensado pra rodar barato numa VPS única, sem depender de serviços gerenciados.

## Módulos

- **Gestor de arquivos** (`services/file-manager`) — interface estilo Google Drive: visão em lista/grade, pastas, upload com barra de progresso, miniaturas, seleção múltipla (arrasto do mouse, Shift/Ctrl+clique, Ctrl+A, inverter), copiar/recortar/colar, arrastar-e-soltar, lixeira, compartilhamento por arquivo, streaming de vídeo/áudio com seek.
- **Editor de documentos** (`services/docs`) — editor de texto rico (TipTap) com autosave, exportação para `.docx`.
- **Visualizador universal** — abre qualquer tipo de arquivo com o preview certo: imagem, PDF, vídeo, áudio, texto/código, `.docx` (renderizado via `mammoth`), com fallback de download pros tipos sem preview.
- **Autenticação e permissões** (`services/auth`) — RBAC com permissões no formato `dominio.recurso.acao`, sessão persistente (renovação automática de token).

Veja `CLAUDE.md` para o desenho de arquitetura completo (limites entre módulos, modelo de permissões, decisões e armadilhas já resolvidas).

## Como rodar

### Desenvolvimento (recomendado)

```bash
cp .env.example .env   # ajuste os segredos antes de ir pra produção
make dev               # sobe postgres/auth/file-manager/docs no Docker + portal nativo com hot reload
```

Acesse **http://localhost:3000**. Login inicial: `admin@infinitywork.local` / `changeme123` (troque a senha).

```bash
make dev-down           # para tudo
```

### Produção (tudo em container)

```bash
docker compose up -d --build
```

Só o `portal` fica exposto ao host — os demais serviços só são alcançáveis pela rede interna do Docker.

### Testes end-to-end

```bash
make test-e2e            # com `make dev` já rodando
```

Suíte em `tests/e2e/` (Playwright) — cada teste cria e limpa sua própria pasta isolada via API, seguro rodar contra uma conta com dados reais.

## Stack

Monorepo com npm workspaces — Next.js (portal) + Fastify/Prisma/Postgres (auth, file-manager) + Fastify sem banco próprio (docs, orquestra sobre o file-manager). Ver `CLAUDE.md` pra detalhes de cada serviço e as decisões de baixo custo computacional por trás delas.
