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

const contentDir = join(process.cwd(), 'content/recipes');
const distDir = join(process.cwd(), 'dist');
const distRecipesDir = join(distDir, 'recipes');

const pageTemplate = (title: string, body: string, stylesheetHref: string) => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="stylesheet" href="${stylesheetHref}" />
  </head>
  <body>
    <header class="site-header">
      <div class="container">
        <a class="brand" href="./index.html">Recipe Journal</a>
      </div>
    </header>
    <main class="container">${body}</main>
  </body>
</html>`;

const slugFromFilename = (filename: string) =>
  basename(filename, '.md')
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
    tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
    html
  };
};

const renderRecipeList = (recipes: Recipe[]) => {
  const items = recipes.length
    ? recipes
        .map(
          (recipe) => `
      <article class="recipe-card">
        <h2><a href="./recipes/${recipe.slug}.html">${recipe.title}</a></h2>
        <p class="meta">${formatDate(recipe.date)}</p>
        <ul class="tags">
          ${recipe.tags.map((tag) => `<li>${tag}</li>`).join('')}
        </ul>
      </article>`
        )
        .join('')
    : '<p class="meta">No recipes yet.</p>';

  return pageTemplate(
    'Recipe Journal',
    `<section class="page-intro">
      <h1>Recipe Journal</h1>
      <p>Elegant, practical recipes collected in one quiet place.</p>
    </section>
    <section class="recipe-grid">${items}</section>`,
    './assets/styles.css'
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
          ${recipe.tags.map((tag) => `<li>${tag}</li>`).join('')}
        </ul>
      </header>
      <section class="recipe-content">${recipe.html}</section>
    </article>`,
    '../assets/styles.css'
  );

const build = async () => {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distRecipesDir, { recursive: true });

  const files = (await readdir(contentDir)).filter((name) => name.endsWith('.md'));
  const recipes = await Promise.all(files.map(parseRecipe));
  recipes.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  await writeFile(join(distDir, 'index.html'), renderRecipeList(recipes), 'utf8');

  await Promise.all(
    recipes.map((recipe) =>
      writeFile(join(distRecipesDir, `${recipe.slug}.html`), renderRecipePage(recipe), 'utf8')
    )
  );
};

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
