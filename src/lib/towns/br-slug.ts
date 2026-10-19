// A city's name as words and as a link, without the cities' list (br-cities),
// so the page can read ?cidade= without loading every city in Brazil.

/** Lowercase, no accents, words split by single spaces: "São José-dos Campos" → "sao jose dos campos". */
export function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** The city's address in links: "campinas-sp". */
export const slugOf = (name: string, uf: string) => `${normalize(name).replace(/ /g, "-")}-${uf.toLowerCase()}`;
