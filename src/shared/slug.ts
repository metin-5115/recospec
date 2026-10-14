/** File-name slug: whitespace → `_`, everything outside `[\w-]` dropped. */
export function slugifyFilename(name: string): string {
  return name.replace(/\s+/g, '_').replace(/[^\w-]/g, '')
}

/** Kebab-case slug of ASCII alphanumerics; `fallback` when nothing survives. */
export function slugifyKebab(title: string, fallback: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}
