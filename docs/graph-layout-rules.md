# Commit Graph Layout Rules

Requirements for the commit graph renderer in `CommitList.vue`.
All rules follow the **principle of least surprise** — the graph should
look the way an experienced git user would draw it on a whiteboard.

---

## 1. Lane Assignment

### 1.1 Lane 0 = HEAD chain

Uncommitted changes and the HEAD first-parent chain always occupy
column 0 (the leftmost lane). This is the visual "trunk" of the graph.

### 1.2 First parent straight down

A commit's first-parent edge is always a vertical line in the same
column. The first-parent path never jumps horizontally.

### 1.3 Branches fork to the right

When a new branch appears, it occupies a lane to the right of its
parent. The further right a lane, the more "secondary" the branch.

### 1.4 Merges come from the right

Merge edges always go from a higher-numbered lane (right) into a
lower-numbered lane (left). You never see a merge curving leftward
into a lane further to the right.

### 1.5 A branch stays in its lane

All commits on the same first-parent chain share the same column.
No horizontal movement mid-branch.

### 1.6 Lanes are freed and reused

When a branch merges (its lane is no longer needed), the lane is
released. New branches prefer the leftmost free lane to keep the
graph compact.

### 1.7 Minimize width

Trailing empty lanes are trimmed. The graph is only as wide as the
number of active lanes requires.

---

## 2. Stashes

### 2.1 Stash internals are invisible

Git stashes are merge commits with 2–3 internal parents:

- parent[0]: the HEAD commit at stash time (visible, already in graph)
- parent[1]: the index (staged) snapshot commit (internal, hidden)
- parent[2]: the untracked-files commit, if any (internal, hidden)

Only the top-level stash commit is shown. The index and untracked-files
commits are filtered out on the data side (in `panel.ts`) before the
webview ever sees them.

### 2.2 Stashes are subordinate

Stashes never push real branches to the right. When assigning a lane
to a stash commit, prefer the rightmost available slot rather than the
leftmost. Stashes sit at the edge of the graph, not in the middle.

### 2.3 Stashes show only one parent edge

Even though a stash has multiple parents, only the first-parent edge
(to the HEAD commit at stash time) is drawn. The internal parent
edges are suppressed.

### 2.4 Stash visual treatment

Stash commits use an outlined (hollow) square node with a distinct
style, making them visually different from both regular commits and
merge commits.

---

## 3. Uncommitted Changes

### 3.1 Always at the top

The synthetic "uncommitted changes" entry is always the first row in
the graph, above all real commits.

### 3.2 Always in lane 0

Uncommitted changes occupy lane 0, connecting straight down to the
HEAD commit.

### 3.3 Dashed visual treatment

Lines and the node for uncommitted changes use dashed strokes to
indicate they are not yet persisted.

---

## 4. Ordering

### 4.1 Topological order

Parents always appear below their children. No commit appears before
all its children have been shown. This is provided by git's
`--topo-order` flag.

### 4.2 Data source

The commit list comes from `git log --all --topo-order`. Hidden refs
are excluded via `--exclude` flags. Stash hashes are passed as
additional starting points.

---

## 5. Edges and Lines

### 5.1 Passthrough lines are vertical

Lanes that are active but not the current commit's lane get straight
vertical lines (passthroughs). These are never curved.

### 5.2 Merge edges are curves

When a merge parent is in a different lane, the connection uses a
Bezier curve from the commit's lane to the parent's lane.

### 5.3 Same-lane edges are vertical

When a commit connects to a parent in the same lane (the common case
for first-parent edges), the line is a straight vertical segment.

---

## 6. Colors

### 6.1 Color is stable per lane

Each lane index maps to a fixed color from a palette. The color does
not change based on which branch occupies the lane.

### 6.2 Primary lane is prominent

Lane 0 uses the first color in the palette, which should be a strong,
recognizable color that stands out.

---

## 7. Visual Distinctiveness

### 7.1 Regular commits

Filled square node.

### 7.2 Merge commits

Outlined (hollow) square node — same shape, different fill treatment.

### 7.3 Stash commits

Outlined square node (same as merge), distinguished by context and
position rather than a unique shape.

### 7.4 Uncommitted changes

Outlined square with dashed stroke.

### 7.5 HEAD indicator

The HEAD ref badge is visually prominent (bold text, tinted background)
among the ref badges on the commit row.

---

## 8. Interactive Behavior

### 8.1 Hover highlights first-parent chain

When the user hovers over a commit row, the entire first-parent chain
passing through that commit is highlighted in both directions (toward
children and toward ancestors). Non-highlighted rows are dimmed.

This makes it easy to trace "which branch is this commit on?" without
clicking.
