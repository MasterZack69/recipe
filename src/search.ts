interface SearchEntry {
  title: string;
  slug: string;
  tags: string[];
}

const normalize = (value: string) => value.trim().toLowerCase();

const initializeSearch = async () => {
  const searchInput = document.querySelector<HTMLInputElement>('#recipe-search');
  const recipeGrid = document.querySelector<HTMLElement>('#recipe-grid');

  if (!searchInput || !recipeGrid) {
    return;
  }

  const emptyState = document.querySelector<HTMLElement>('#search-empty');
  const cards = Array.from(recipeGrid.querySelectorAll<HTMLElement>('.recipe-card'));

  let entries: SearchEntry[] = [];

  try {
    const response = await fetch('./search.json');
    if (!response.ok) {
      throw new Error(`Unable to load search index: ${response.status}`);
    }

    entries = (await response.json()) as SearchEntry[];
  } catch (error) {
    console.error(error);
    return;
  }

  const entryMap = new Map(entries.map((entry) => [entry.slug, entry]));

  const applyFilter = () => {
    const query = normalize(searchInput.value);
    let visibleCount = 0;

    for (const card of cards) {
      const slug = card.dataset.slug;
      const entry = slug ? entryMap.get(slug) : undefined;

      if (!entry || query.length === 0) {
        card.hidden = Boolean(query.length > 0 && !entry);
      } else {
        const matchesTitle = normalize(entry.title).includes(query);
        const matchesTags = entry.tags.some((tag) => normalize(tag).includes(query));
        card.hidden = !(matchesTitle || matchesTags);
      }

      if (!card.hidden) {
        visibleCount += 1;
      }
    }

    if (emptyState) {
      emptyState.hidden = visibleCount > 0;
    }
  };

  searchInput.addEventListener('input', applyFilter);
};

void initializeSearch();
