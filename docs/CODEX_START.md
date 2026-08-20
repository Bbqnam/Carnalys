Carnalysis

Project Vision

Carnalysis is a premium SaaS platform that helps people make smarter used car buying decisions in Sweden.

This is not a classifieds website and not another Blocket clone.

The product exists to answer one question:

“Is this car actually worth buying?”

Every feature, design decision, and engineering decision should support that goal.

The long term vision is to aggregate listings from multiple marketplaces and dealers, normalize them into a common data model, analyze every vehicle, estimate fair market value, calculate ownership costs, evaluate reliability, and help users confidently choose the best car.

⸻

Product Principles

Always prioritize, in this order:

1. Simplicity
2. Speed
3. Premium user experience
4. Accurate data
5. Maintainable architecture
6. Scalability
7. Explainable intelligence

Avoid feature creep.

Avoid unnecessary complexity.

The product should feel closer to Apple, Linear, Stripe, and Tesla than to a traditional classifieds website.

⸻

Core Product

Carnalysis should eventually become the smartest place in Sweden to evaluate used cars.

The core experience is:

Search → Compare → Understand → Decide

Not:

Search → Endless listings

The application should help users understand:

1. Is this car priced fairly?
2. Is it actually a good purchase?
3. What will it cost to own?
4. Are there known reliability concerns?
5. Are there better alternatives available?

⸻

Signature Features

These are the features that make Carnalysis different.

Deal Score

Measures how attractive the asking price is compared with the current market.

Example factors:

* Asking price
* Estimated market value
* Mileage
* Age
* Equipment
* Number of owners
* Service history
* Warranty
* Market demand

⸻

Buy Confidence Score

Measures whether the vehicle is a good purchase overall.

Example factors:

* Deal Score
* Reliability
* Ownership costs
* Engine reputation
* Transmission reputation
* Known problems
* Maintenance risk
* Warranty
* Vehicle history

A cheap car is not automatically a good purchase.

Keep Deal Score and Buy Confidence Score separate throughout the architecture.

⸻

Design Philosophy

The interface should be calm, modern, and easy to understand.

Do not design around dashboards.

Do not overwhelm users with information.

Prioritize:

* Excellent typography
* White space
* Large vehicle photos
* Clear hierarchy
* Smooth interactions
* Fast navigation

The product should feel premium without unnecessary decoration.

⸻

Engineering Philosophy

Always choose solutions that would still make sense if the platform eventually serves hundreds of thousands of users.

Avoid both extremes:

Do not over engineer.

Do not build quick hacks.

Choose architecture that can grow naturally.

Whenever multiple solutions exist:

Explain the tradeoffs.

Recommend the solution you would choose if this were your own startup.

⸻

Technology Stack

Preferred stack:

* Next.js
* React
* TypeScript
* Tailwind CSS
* Framer Motion
* PostgreSQL
* Prisma
* Docker
* GitHub
* Vercel

If another technology is objectively better for a specific problem, explain why before recommending it.

⸻

Data Architecture

The frontend must never depend on any specific marketplace.

Never build the UI around Blocket, Bytbil, Bilweb, Wayke, or any dealer.

Instead, every source should eventually map into one internal vehicle model.

Future architecture:

Marketplace

↓

Source Adapter

↓

Normalized Vehicle

↓

Market Analysis

↓

Deal Score

↓

Buy Confidence

↓

Frontend

This separation is a core architectural principle.

⸻

Current Development Phase

We are currently building the frontend foundation.

Use realistic mock data.

Design every component as if real backend services already exist.

Do not implement marketplace integrations, APIs, scraping, database ingestion, authentication, subscriptions, or payment systems until they are explicitly requested.

However, the architecture should make those features easy to add later without major rewrites.

⸻

Planned Product Features

These are planned product capabilities.

They are not all part of the current milestone.

Eventually the platform may include:

* Unified vehicle search
* Smart filtering
* Deal Score
* Buy Confidence Score
* Estimated market value
* Ownership cost calculator
* Reliability database
* Favorites
* Vehicle comparison
* AI buying assistant
* Dealer ratings
* Price alerts
* Market trend analysis

Only implement features that belong to the current milestone.

⸻

Development Workflow

Work incrementally.

Do not skip ahead.

For every task:

1. Explain the architecture.
2. Explain why it is the best approach.
3. Describe which files will change.
4. Implement only the requested feature.
5. Refactor only if necessary.

Avoid unrelated changes.

⸻

Coding Standards

Use strict TypeScript.

Keep components small.

Prefer composition over large components.

Separate:

* UI
* Business logic
* Domain models
* Utility functions

Avoid duplicated code.

Avoid giant files.

Avoid unnecessary libraries.

Use descriptive names.

Write code that another experienced engineer can easily understand.

⸻

File Modification Rules

Before making changes:

1. Inspect the existing project.
2. Never assume files already exist.
3. Explain which files will be created.
4. Explain which files will be modified.
5. Explain why.

Only then implement the change.

⸻

Decision Making

Do not automatically agree with project ideas.

If there is a better architectural, technical, UX, or product solution:

Explain it.

Challenge weak decisions.

Identify:

* Scalability concerns
* Performance bottlenecks
* Product risks
* Legal considerations
* Better alternatives

Act as a technical cofounder rather than a code generator.

⸻

Product Discipline

Every feature should pass this test:

Does this help users make a better used car buying decision?

If not, question whether it belongs in the product.

Avoid adding generic SaaS features simply because they are common.

⸻

Data Integrity

Always distinguish between:

* Source data
* Calculated data
* Estimated data
* User supplied data

Never present estimates as verified facts.

Future scoring systems should always be explainable.

Avoid creating unexplained “magic” scores.

⸻

Initial Development Roadmap

Build the application in this order unless instructed otherwise.

Step 1

Project foundation.

Define the normalized vehicle domain model.

Design the project structure.

⸻

Step 2

Create realistic mock vehicle data.

⸻

Step 3

Build the Search Results page.

This will become the heart of the application.

⸻

Step 4

Implement filtering and sorting.

⸻

Step 5

Build the Vehicle Details page.

⸻

Step 6

Build Favorites and Compare.

⸻

Step 7

Refine scoring visualization.

⸻

Step 8

Build the Home page around the completed search experience.

⸻

Current Task

We are currently on Step 1.

Before writing any code:

Inspect the repository.

Explain the proposed project structure.

Design the normalized vehicle model.

Separate listing data from calculated analysis.

Explain the reasoning.

Only then begin implementation.

Do not continue beyond Step 1 until explicitly instructed.

⸻

Success Criteria

Carnalysis should become the most trusted platform in Sweden for evaluating used cars.

Every decision should optimize for:

* User trust
* Long term maintainability
* High quality engineering
* Excellent user experience
* Scalable architecture
* Clear, explainable analysis

Always remember:

We are building a product that helps people confidently decide whether a car is worth buying, not another website that simply lists cars.
