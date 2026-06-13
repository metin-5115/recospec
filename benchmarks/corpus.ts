/**
 * Mutation-benchmark corpus — ≥10 distinct real-world DOM structures, each
 * with the elements a recorder would have clicked (`targets`, as CSS selectors
 * resolved against the pristine HTML).
 *
 * ASSUMPTION: scenarios are authored inline rather than as serialized
 * `fixtures/*.html` snapshots. The survival harness needs (html, target-list)
 * pairs; inline scenarios keep that pairing in one reviewable place and avoid
 * ten parallel HTML+JSON files. The existing `fixtures/` dir still feeds the
 * strategy-correctness benchmark (`runner.ts`).
 */
export interface CorpusScenario {
  name: string
  description: string
  html: string
  /** CSS selectors (against pristine HTML) of the recorded click targets. */
  targets: string[]
}

export const CORPUS: readonly CorpusScenario[] = [
  {
    name: 'datepicker-calendar',
    description: 'Localized calendar grid — data-value cells',
    html: `<div data-testid="calendar" role="grid" lang="tr">
      ${Array.from({ length: 14 }, (_, i) => {
        const d = i + 1
        return `<button type="button" class="cell css-1a2b3c">${d} Ağustos 2026</button>`
      }).join('')}
    </div>`,
    targets: ['.cell:nth-of-type(12)'],
  },
  {
    name: 'ecommerce-product-list',
    description: 'Product grid with testid cards and add-to-cart buttons',
    html: `<ul class="grid" role="list">
      ${Array.from({ length: 8 }, (_, i) => {
        return `<li class="card sc-AbCdEf" data-testid="product-${i}">
          <h3 class="title">Item ${i}</h3>
          <span class="price">$${10 + i}.99</span>
          <button class="btn jss${100 + i}" data-test="add-${i}">Add to cart</button>
        </li>`
      }).join('')}
    </ul>`,
    targets: ['[data-test="add-3"]', '[data-testid="product-5"] .title'],
  },
  {
    name: 'login-form',
    description: 'Classic email/password form with submit',
    html: `<form class="auth-form">
      <label for="email-1">Email</label>
      <input id="email-1" name="email" type="email" autocomplete="username" />
      <label for="pwd-1">Password</label>
      <input id="pwd-1" name="password" type="password" autocomplete="current-password" />
      <button type="submit" class="primary">Sign In</button>
    </form>`,
    targets: ['#email-1', '#pwd-1', 'button[type="submit"]'],
  },
  {
    name: 'data-table',
    description: 'Sortable table with row action buttons',
    html: `<table class="report">
      <thead><tr><th>Name</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${Array.from({ length: 6 }, (_, i) => {
          return `<tr class="row" data-row-id="${i}">
            <td class="name">User ${i}</td>
            <td class="status">Active</td>
            <td><button class="del" aria-label="Delete User ${i}">×</button></td>
          </tr>`
        }).join('')}
      </tbody>
    </table>`,
    targets: ['[aria-label="Delete User 2"]'],
  },
  {
    name: 'spa-dashboard',
    description: 'Sidebar nav + widgets, role landmarks',
    html: `<div class="app">
      <nav aria-label="Main" class="sidebar css-9z8y7x">
        <a href="/overview" class="nav-link">Overview</a>
        <a href="/reports" class="nav-link">Reports</a>
        <a href="/settings/profile" class="nav-link">Settings</a>
      </nav>
      <main class="content">
        <section class="widget" data-testid="revenue">
          <h2>Revenue</h2><span class="value">€1 234</span>
        </section>
      </main>
    </div>`,
    targets: ['a[href="/reports"]', '[data-testid="revenue"] .value'],
  },
  {
    name: 'modal-dialog',
    description: 'Confirm dialog with accept/cancel',
    html: `<div role="dialog" aria-label="Confirm deletion" class="modal jss42">
      <p>Are you sure?</p>
      <div class="actions">
        <button class="btn-cancel">Cancel</button>
        <button class="btn-confirm primary">Delete</button>
      </div>
    </div>`,
    targets: ['.btn-confirm', '.btn-cancel'],
  },
  {
    name: 'nav-menu-dropdown',
    description: 'Top nav with a dropdown menu',
    html: `<header class="topbar">
      <button class="menu-toggle" aria-label="Account menu" aria-haspopup="true">Account</button>
      <ul role="menu" class="dropdown css-menu1">
        <li role="none"><a role="menuitem" href="/profile">Profile</a></li>
        <li role="none"><a role="menuitem" href="/logout">Log out</a></li>
      </ul>
    </header>`,
    targets: ['[aria-label="Account menu"]', 'a[href="/logout"]'],
  },
  {
    name: 'card-grid-no-testid',
    description: 'Hashed-class card grid with NO test attributes (hard case)',
    html: `<section class="cards">
      ${Array.from({ length: 6 }, (_, i) => {
        return `<article class="card-${i} css-${i}q${i}w${i}e">
          <h4 class="hd-x9">Article ${i}</h4>
          <a class="more css-zz${i}" href="/articles/${i}">Read more</a>
        </article>`
      }).join('')}
    </section>`,
    targets: ['a[href="/articles/4"]'],
  },
  {
    name: 'hotel-card-list',
    description: 'Repeated cards keyed by name; dynamic price leaf (container anchor)',
    html: `<div class="results">
      ${[
        ['Acapulco Resort Convention Spa', '76.800 TL'],
        ['Nuhun Gemisi Deluxe Hotel', '54.200 TL'],
        ['Concorde Luxury Resort', '91.500 TL'],
        ['Limak Cyprus Deluxe Hotel', '63.900 TL'],
      ]
        .map(
          ([name, price]) =>
            `<div class="card mui-1x9f"><h3 class="title">${name}</h3><p class="price">${price}</p></div>`,
        )
        .join('')}
    </div>`,
    // The dynamic price leaf — no testid, non-unique class. Must anchor on the
    // card's stable name, not become a positional XPath.
    targets: ['.card:nth-of-type(1) .price'],
  },
  {
    name: 'pagination',
    description: 'Pagination control with numbered pages',
    html: `<nav aria-label="Pagination" class="pager">
      <button class="page" aria-label="Previous">‹</button>
      ${Array.from({ length: 5 }, (_, i) => `<button class="page p-${i + 1}">${i + 1}</button>`).join('')}
      <button class="page" aria-label="Next">›</button>
    </nav>`,
    targets: ['[aria-label="Next"]'],
  },
  {
    name: 'tab-panel',
    description: 'ARIA tablist with selectable tabs',
    html: `<div class="tabs">
      <div role="tablist" aria-label="Settings sections">
        <button role="tab" aria-selected="true" class="tab css-t1">General</button>
        <button role="tab" aria-selected="false" class="tab css-t2">Security</button>
        <button role="tab" aria-selected="false" class="tab css-t3">Billing</button>
      </div>
    </div>`,
    targets: ['button[role="tab"]:nth-of-type(2)'],
  },
  {
    name: 'search-bar',
    description: 'Search input with placeholder + submit icon button',
    html: `<form class="search" role="search">
      <input type="search" name="q" placeholder="Search products…" class="search-input css-si" />
      <button type="submit" class="search-go" aria-label="Search">🔍</button>
    </form>`,
    targets: ['input[type="search"]', '[aria-label="Search"]'],
  },
]
