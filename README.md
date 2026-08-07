# Dieta Tracker

Aplicativo web independente para controle nutricional diário: calorias, macros, fibras, gordura saturada, sódio, carboidratos líquidos e açúcares adicionados.

Funciona em iOS, Windows e Mac pelo navegador, com tema azul escuro, PWA e **sincronização entre PC e celular** via Supabase (login por e-mail).

## Sincronização (PC ↔ celular)

Os registros do dia, metas, grupos, favoritos e alimentos próprios ficam na nuvem. Cada alteração é salva localmente e enviada ao Supabase; o outro aparelho recebe a versão atualizada.

### 1. Criar o projeto Supabase (gratuito)

1. Acesse [supabase.com](https://supabase.com) e crie um projeto.
2. Abra **SQL Editor** → New query → cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → Run.
3. Em **Authentication → URL Configuration**, adicione nas Redirect URLs:
   - `https://matheushbps.github.io/dieta-tracker/`
   - `http://localhost:5173/` (para testes locais)
4. Em **Project Settings → API**, copie:
   - **Project URL**
   - **anon public** key
5. Cole esses valores em [`js/config.js`](js/config.js):

```js
export const SUPABASE_URL = "https://xxxx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOi...";
```

6. Faça commit e push para o GitHub Pages atualizar.

### 2. Usar no dia a dia

1. Abra o site no PC e no celular.
2. Entre com o **mesmo e-mail** (recebe um link mágico, sem senha).
3. Na primeira vez, o app une os dados locais com a nuvem e sobe o resultado.
4. Depois disso, o que você editar em um aparelho aparece no outro (status: Salvo / Sincronizando / Offline).

A chave `anon` pode ficar no frontend: o Row Level Security garante que cada usuário só lê/escreve a própria linha.

## Resumo do dia, separado em blocos

1. **Energia** — calorias vs meta
2. **Macronutrientes** — carboidratos, proteínas, gorduras
3. **Qualidade da dieta** — gordura saturada, fibras, sódio, carboidratos líquidos, açúcares adicionados
4. **Por quilo de peso** — carb/kg, prot/kg, gord/kg

## Agrupamento de alimentos

- **Categorias**, **Favoritos**, **Recentes**, **Grupos/combos** e **Refeições** com subtotais

## Rodar localmente

```bash
cd ~/Downloads/dieta-tracker
python3 -m http.server 5173
```

Acesse `http://localhost:5173`.

## Publicar (GitHub Pages)

O repositório já está em `https://matheushbps.github.io/dieta-tracker/`. Após alterar `js/config.js`, faça push em `main`.

## Instalar no iOS

Safari → Compartilhar → **Adicionar à Tela de Início**.

## Banco de alimentos

Catálogo grande em `data/foods.cloud.json` (somente leitura). Alimentos próprios, favoritos e edições ficam no estado sincronizado do usuário.

## Backup manual

Na aba **Metas**: **Exportar tudo** / **Restaurar / unir backup** (JSON). Continua útil mesmo com a nuvem.
