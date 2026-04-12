import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

interface RecipeFrontmatter {
  title: string;
  date: string;
  tags?: string[];
}

interface Recipe {
  slug: string;
  title: string;
  date: string;
  tags: string[];
  html: string;
}

interface SearchRecord {
  title: string;
  slug: string;
  tags: string[];
}

interface TemplateOptions {
  stylesheetHref: string;
  homeHref: string;
  scriptSrc?: string;
}

const contentDir = join(process.cwd(), 'content/recipes');
const distDir = join(process.cwd(), 'dist');
const distRecipesDir = join(distDir, 'recipes');
const distTagsDir = join(distDir, 'tags');

const pageTemplate = (title: string, body: string, options: TemplateOptions) => {
  const scriptTag = options.scriptSrc
    ? `\n    <script type="module" src="${options.scriptSrc}"></script>`
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="${options.stylesheetHref}" />${scriptTag}
  </head>
  <body>
    <header class="site-header">
      <div class="container">
        <a class="brand" href="${options.homeHref}">MasterZack's Master Recipes</a>
      </div>
    </header>
    <main class="container">${body}</main>
  </body>
</html>`;
};

const slugFromFilename = (filename: string) =>
  basename(filename, '.md')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const slugFromTag = (tag: string) =>
  tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const formatDate = (isoDate: string): string => {
  const date = new Date(isoDate);

  if (Number.isNaN(date.getTime())) {
    return 'Invalid date';
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC'
  }).format(date);
};

const parseRecipe = async (filename: string): Promise<Recipe> => {
  const raw = await readFile(join(contentDir, filename), 'utf8');
  const { data, content } = matter(raw);
  const frontmatter = data as RecipeFrontmatter;

  if (!frontmatter.title || !frontmatter.date) {
    throw new Error(`Missing required frontmatter in ${filename}.`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(frontmatter.date)) {
    throw new Error(`Invalid date format in ${filename}. Use ISO format YYYY-MM-DD.`);
  }

  // Markdown is expected to come from trusted local content files.
  const html = await marked.parse(content);

  return {
    slug: slugFromFilename(filename),
    title: frontmatter.title,
    date: frontmatter.date,
    tags: Array.isArray(frontmatter.tags)
      ? frontmatter.tags
          .map((tag) => String(tag).trim())
          .filter((tag) => tag.length > 0)
      : [],
    html
  };
};

const renderTagList = (tags: string[], tagsBasePath: string) =>
  tags
    .map((tag) => `<li><a href="${tagsBasePath}/${slugFromTag(tag)}.html">${tag}</a></li>`)
    .join('');

const renderRecipeCards = (recipes: Recipe[], recipesBasePath: string, tagsBasePath: string) =>
  recipes.length
    ? recipes
        .map(
          (recipe) => `
         <article class="recipe-card" data-slug="${recipe.slug}">
        <a class="recipe-card-hit" href="${recipesBasePath}/${recipe.slug}.html" aria-label="View recipe: ${recipe.title}"></a>
        <h2><a class="recipe-title-link" href="${recipesBasePath}/${recipe.slug}.html">${recipe.title}</a></h2>
        <p class="meta">${formatDate(recipe.date)}</p>
        <ul class="tags">
        ${renderTagList(recipe.tags, tagsBasePath)}
        </ul>
      </article>`
        )
        .join('')
    : '<p class="meta">No recipes yet.</p>';

const renderRecipeList = (recipes: Recipe[]) => {
  const cards = renderRecipeCards(recipes, './recipes', './tags');

  return pageTemplate(
    "MasterZack's Master Recipes",
    `<section class="page-intro">
      <h1>MasterZack's Master Recipes</h1>
      <p>Elegant, practical recipes collected in one quiet place.</p>
      <div class="search-controls">
        <label for="recipe-search">Search recipes</label>
        <input
          id="recipe-search"
          class="search-input"
          type="search"
          placeholder="Search by title or tag"
          autocomplete="off"
        />
      </div>
    </section>
    <section class="recipe-grid" id="recipe-grid">${cards}</section>
    <p class="meta search-empty" id="search-empty" hidden>No recipes match your search.</p>`,
    {
      stylesheetHref: './assets/styles.css',
      homeHref: './index.html',
      scriptSrc: './assets/search.js'
    }
  );
};

const renderRecipePage = (recipe: Recipe) =>
  pageTemplate(
    recipe.title,
    `<article class="recipe-detail">
      <header>
        <h1>${recipe.title}</h1>
        <p class="meta">${formatDate(recipe.date)}</p>
        <ul class="tags">
          ${renderTagList(recipe.tags, '../tags')}
        </ul>
      </header>
      <section class="recipe-content">${recipe.html}</section>
    </article>`,
    {
      stylesheetHref: '../assets/styles.css',
      homeHref: '../index.html'
    }
  );

const renderTagPage = (tag: string, recipes: Recipe[]) =>
  pageTemplate(
    `Tag: ${tag}`,
    `<section class="page-intro">
      <h1>Tag: ${tag}</h1>
      <p>Recipes filed under this tag.</p>
    </section>
    <section class="recipe-grid">${renderRecipeCards(recipes, '../recipes', './')}</section>`,
    {
      stylesheetHref: '../assets/styles.css',
      homeHref: '../index.html'
    }
  );
const build = async () => {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distRecipesDir, { recursive: true });
  await mkdir(distTagsDir, { recursive: true });

  const files = (await readdir(contentDir)).filter((name) => name.endsWith('.md'));
  const recipes = await Promise.all(files.map(parseRecipe));
  recipes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const tagMap = new Map<string, { label: string; recipes: Recipe[] }>();

  for (const recipe of recipes) {
    for (const tag of recipe.tags) {
      const slug = slugFromTag(tag);
      if (!slug) {
        continue;
      }

      const existing = tagMap.get(slug);
      if (existing) {
        existing.recipes.push(recipe);
      } else {
        tagMap.set(slug, { label: tag, recipes: [recipe] });
      }
    }
  }

  const searchIndex: SearchRecord[] = recipes.map((recipe) => ({
    title: recipe.title,
    slug: recipe.slug,
    tags: recipe.tags
  }));

  await writeFile(join(distDir, 'index.html'), renderRecipeList(recipes), 'utf8');
  await writeFile(join(distDir, 'search.json'), JSON.stringify(searchIndex, null, 2), 'utf8');

  await Promise.all([
    ...recipes.map((recipe) =>
      writeFile(join(distRecipesDir, `${recipe.slug}.html`), renderRecipePage(recipe), 'utf8')
    ),
    ...Array.from(tagMap.entries()).map(([slug, entry]) =>
      writeFile(
        join(distTagsDir, `${slug}.html`),
        renderTagPage(
          entry.label,
          [...entry.recipes].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        ),
        'utf8'
      )
    )
  ]);
};

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
