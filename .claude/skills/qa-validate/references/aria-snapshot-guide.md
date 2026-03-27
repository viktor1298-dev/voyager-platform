# Understanding Accessibility Snapshots

Guide for interpreting the structured accessibility tree returned by `browser_snapshot`.

## The Format

The snapshot is a text representation of the page's accessibility tree. Each line
represents an element with its role, accessible name, and content.

```
- role "accessible name" [attributes] [ref=eN]: text content
```

### Common Roles

| Role | HTML Source | What It Means |
|------|-----------|---------------|
| `heading` | `<h1>` - `<h6>` | Page/section title. `[level=1]` = h1, `[level=2]` = h2, etc. |
| `navigation` | `<nav>` | Navigation landmark — sidebar, header nav, breadcrumbs |
| `link` | `<a>` | Clickable link. Name = link text |
| `button` | `<button>` | Clickable button. Name = button text |
| `textbox` | `<input>`, `<textarea>` | Text input field. Name = label text |
| `table` | `<table>` | Data table container |
| `row` | `<tr>` | Table row |
| `cell` | `<td>` | Table cell |
| `columnheader` | `<th>` | Table column header |
| `list` | `<ul>`, `<ol>` | List container |
| `listitem` | `<li>` | List item |
| `alert` | `[role="alert"]` | Error/warning message — critical indicator |
| `tab` | `[role="tab"]` | Tab in a tab bar |
| `tablist` | `[role="tablist"]` | Tab bar container |
| `img` | `<img>` | Image. Name = alt text |
| `checkbox` | `<input type="checkbox">` | Checkbox. `[checked]` = checked |
| `radio` | `<input type="radio">` | Radio button |
| `combobox` | `<select>` | Dropdown selector |

### Reading the Tree

Indentation shows parent-child relationships:

```
- navigation "Main sidebar" [ref=e1]:
  - link "Dashboard" [ref=e2]
  - link "Clusters" [ref=e3]
  - link "Alerts" [ref=e4]
  - link "Events" [ref=e5]
  - link "Logs" [ref=e6]
  - link "Settings" [ref=e7]
- heading "Dashboard" [level=1] [ref=e8]
- region "Cluster Overview" [ref=e9]:
  - heading "Active Clusters" [level=2] [ref=e10]
  - text: 5
```

This tells you:
- Navigation sidebar has 6 links (the expected 6 sidebar items)
- Page heading is "Dashboard" (correct page identity)
- There's a "Cluster Overview" section with count "5"

### The `ref` Attribute

Each element has a `[ref=eN]` reference ID. Use these for:
- `browser_click` — click a specific element by ref
- `browser_fill_form` — target a specific input
- Element-level screenshots via `browser_take_screenshot`

## What to Look For (QA Validation)

### Page Has Data (PASS)

```
- table [ref=e5]:
  - row:
    - columnheader "Name"
    - columnheader "Status"
    - columnheader "Pods"
  - row:
    - cell "prod-us-east-1"
    - cell "Healthy"
    - cell "47"
  - row:
    - cell "staging-eu-west-1"
    - cell "Warning"
    - cell "23"
```

Table has column headers AND data rows. Data is visible.

### Page Has NO Data (FAIL)

```
- table [ref=e5]:
  - row:
    - columnheader "Name"
    - columnheader "Status"
    - columnheader "Pods"
- text "No clusters found"
```

Table has headers but zero data rows. "No clusters found" text confirms empty state.

### Error State (FAIL)

```
- alert [ref=e12]: Failed to load clusters
- heading "Something went wrong" [level=1]
```

`alert` role with error text = page is in error state.

### Loading Stuck (FAIL)

```
- heading "Clusters" [level=1]
- status "Loading..." [ref=e5]
```

`status` element with "Loading..." after page should have settled = loading is stuck.

### Wrong Page / Redirect (FAIL)

Expected to be on `/clusters` but snapshot shows:

```
- heading "Sign In" [level=1]
- textbox "Email" [ref=e2]
- textbox "Password" [ref=e3]
```

This is the login page, not clusters. The user was redirected — likely auth expired.

### Navigation Check

For voyager-platform, the sidebar should have 6 items:

```
- navigation:
  - link "Dashboard"
  - link "Clusters"
  - link "Alerts"
  - link "Events"
  - link "Logs"
  - link "Settings"
```

Count the links. Fewer than 6 = incomplete render.

## Comparing Snapshots to Expected State

For each page type, you know what the snapshot SHOULD look like:

| Page | Must Have | Must NOT Have |
|------|----------|---------------|
| Dashboard | heading, navigation (6 items), data widgets | alert roles, "Error" text |
| Data Table | heading, table with >0 rows, navigation | "No data" text, loading status |
| Login | heading "Sign In", textbox "Email", textbox "Password", button | alert roles (before submission) |
| Detail | heading = entity name, tablist with tabs, content | "Not Found", "404" |

## Dynamic Content and Regex

Some content changes every time (timestamps, live counts). When checking these:
- Don't assert exact text — assert text is present and non-empty
- Ignore timestamps and relative dates ("2 minutes ago")
- Focus on structural elements (headings, tables, navigation) that should be stable
