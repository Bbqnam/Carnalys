@AGENTS.md

# UI Design Philosophy

This is the design authority for the whole project. Apply it to every UI change, not just new features.

**Feel**: polished modern consumer product — not an admin dashboard, developer template, generic SaaS starter, or AI-generated interface. Apple-level restraint and spacing, Linear-level cleanliness, Airbnb-level usability, modern Scandinavian automotive marketplace. Premium, calm, intelligent, fast, trustworthy. The cars and the data are the focus — the UI supports them, it doesn't compete with them.

**Before changing UI**: do not redesign existing screens just because you're implementing a new feature. Inspect existing components and design language first, reuse existing spacing/typography/components/colors/radii/interaction patterns, understand the surrounding page before modifying it, make the smallest coherent change necessary, and preserve good existing design unless there's a clear reason to change it. Never perform a broad visual redesign unless explicitly asked.

**Avoid generic AI-generated UI**: don't put everything in cards, don't nest cards inside cards, don't create excessive rounded containers or huge border radii everywhere, no random gradients, no decorative blobs/illustrations, no excessive shadows, no borders around every section, no interface stuffed with badges and pills, no giant headings that waste vertical space, no unnecessary explanatory text, no dashboard widgets just because data exists, no icons where text is clearer, no new colors without a functional reason, and don't make every metric compete for attention.

**Layout**: prefer strong page composition over collections of floating boxes. Use whitespace to separate sections before reaching for borders/containers. Keep density reasonably high while staying easy to scan. Related information belongs together visually; secondary information stays secondary; important actions are obvious without being oversized. Avoid excessive vertical scroll from padding/oversized headers/unnecessary containers. Desktop should use available width well; mobile should feel intentionally designed, not a stacked desktop layout.

**Car listings**: the car is the visual hero. A user scanning a listing should quickly get: car, model year, mileage, price, dealer/seller, important equipment, deal quality, any important warning. Don't overwhelm cards with every data point — use progressive disclosure for secondary info. Deal Score and other analysis should feel integrated into the listing, not attached as another dashboard card.

**Typography**: clear hierarchy; large type reserved for genuinely important information; body text compact and highly readable; lean on weight/spacing/alignment/contrast before adding colors; avoid five different text sizes in one small component; numbers/prices/scores/specs should be extremely easy to scan.

**Color**: restrained neutral foundation; accent colors communicate meaning; positive/warning/negative/selected/interactive states stay consistent app-wide; never add color for decoration — a premium interface uses less color, not more.

**Components**: clear hierarchy between primary/secondary/subtle buttons; inputs clean and compact; filters powerful without dominating the page; chips/pills only when their shape communicates something useful; cards only when content genuinely benefits from being contained; avoid a separate visual component for every individual data point.

**Data visualization**: don't turn every number into a chart; visualize only when it makes comparison/interpretation faster; market price, expected value, Deal Score, ownership cost, etc. should be immediately understandable; prefer simple visual comparisons over complicated dashboards.

**Interaction**: should feel fast; common actions need as few clicks as possible; don't hide important functionality behind unnecessary menus; hover states subtle; animations restrained and functional, never ones that slow down interaction.

**Before implementing any UI change, ask**: Does this look like a deliberately designed consumer product? Does this make the car easier to evaluate? Is anything here visually unnecessary? Can the same information be communicated with less UI? Am I adding another box simply because it's easy to code? Does this match the existing application? If the answer reveals unnecessary complexity, simplify before implementing. When uncertain, choose the simpler solution and preserve what already works.
