# Dieta Tracker

Aplicativo web independente para controle nutricional diário: calorias, macros, fibras, gordura saturada, sódio, carboidratos líquidos e açúcares adicionados.

Funciona em iOS, Windows e Mac pelo navegador, com tema azul escuro e suporte a instalação na tela de início (PWA + offline).

## Resumo do dia, separado em blocos

1. **Energia** — calorias vs meta
2. **Macronutrientes** — carboidratos, proteínas, gorduras
3. **Qualidade da dieta** — gordura saturada, fibras, sódio, carboidratos líquidos, açúcares adicionados
4. **Por quilo de peso** — carb/kg, prot/kg, gord/kg

## Agrupamento de alimentos

- **Categorias**: Proteínas, Carboidratos, Gorduras, Frutas, Vegetais, Laticínios, Bebidas, Doces, Suplementos, Preparos, Outros — com filtro por chips na aba **Banco**
- **Favoritos**: marque com ★ e acesse pelos atalhos na aba **Hoje**
- **Recentes**: últimos alimentos usados aparecem como atalho
- **Grupos/combos**: monte conjuntos (café da manhã padrão, marmita, pré-treino) e lance tudo de uma vez
- **Refeições**: cada registro entra numa refeição, com subtotais por refeição na tabela do dia

## Rodar localmente

```bash
cd ~/Downloads/dieta-tracker
python3 -m http.server 5173
```

Acesse `http://localhost:5173`.

## Publicar de graça (GitHub Pages)

```bash
gh repo create dieta-tracker --public --source . --push
gh api -X POST repos/:owner/dieta-tracker/pages -f "source[branch]=main" -f "source[path]=/"
```

O site fica em `https://SEU_USUARIO.github.io/dieta-tracker/`.

## Instalar no iOS

Abra o site no Safari → botão Compartilhar → **Adicionar à Tela de Início**. O app abre em tela cheia e funciona offline.

## Banco de alimentos

Seed pequeno em `data/foods.seed.json`. Amplie na aba **Banco**:

1. Formulário **Adicionar alimento**
2. **Importar texto** (colar TSV/CSV)
3. **Importar arquivo** `.csv` / `.tsv` / `.json`

Colunas aceitas: `Alimento, Porção, Carboidratos, Proteínas, Gorduras, Gorduras Sat, Fibras, Sódio, Açúcares, Carboidratos líquidos, Categoria`.

### Converter Excel/CSV grande para JSON

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install openpyxl
python tools/import_foods.py "/caminho/Dieta_banco_corrigido.csv" -o data/foods.imported.json
```

Depois use **Importar arquivo** na aba Banco e selecione o JSON gerado.

## Dados

Tudo fica no `localStorage` do dispositivo. Use **Exportar tudo** na aba Metas para backup e **Restaurar backup** em outro aparelho.
