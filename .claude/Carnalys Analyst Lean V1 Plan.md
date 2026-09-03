Carnalys Analyst Lean V1 Plan

Revised for simple everyday analysis, low operating cost, and private use.

1. Revised objective

Build a useful Carnalys assistant for ordinary questions such as:

1. Is this car fairly priced?
2. Why did it receive this Deal Score?
3. Is there a better alternative within 10,000 SEK?
4. Which of these two or three cars is better for my needs?
5. Has this listing reduced its asking price?
6. Find good automatic estates below 180,000 SEK.

The first version does not need to solve complex national market research, long term forecasting, reliability research, or autonomous monitoring.

The product principle remains the same: PostgreSQL and Carnalys perform filtering and calculations. The model interprets the prepared evidence and explains it clearly.

2. What changes from the original plan

1. Reduce six tools to four.
2. Reduce the agent loop from five turns and eight tool calls to three turns and four tool calls.
3. Use a low cost model for simple predefined actions.
4. Use the stronger standard model only for broader searches or ambiguous comparisons.
5. Remove Deep Analysis from V1.
6. Remove the dedicated Analyst workspace from the first implementation. Start with contextual entry points inside the existing Carnalys pages.
7. Keep conversation state only for the current browser session.
8. Do not build saved preference profiles, web research, market forecasting, or persistent conversations.
9. Do not build the documented daily historical snapshot system as part of this feature. Exact listing price history is enough for the first release.

3. Recommended V1 capability

Listing page

Add an “Ask Carnalys” action with these suggested questions:

1. Analyse this car.
2. Explain its Deal Score.
3. Is the asking price fair?
4. Find better alternatives.
5. Show its price history.

The listing id is supplied automatically. The model retrieves the necessary evidence rather than receiving the entire page.

Search page

Allow questions such as:

1. Which of these are the best value?
2. Find the best automatic estate under 180,000 SEK.
3. Show lower mileage alternatives.

The existing normalized search filters are supplied as trusted context. The full visible result set is not sent to the model.

Comparison page

Support two or three cars initially, rather than five. The user can state a priority such as lowest total cost, most space, newest technology, or safest market choice.

Exact listing history

Answer only what Carnalys actually observed:

1. First seen date.
2. Last seen date.
3. Recorded asking price changes.
4. Recorded mileage changes.
5. Advert disappearance or relisting.

Never say that disappearance proves a sale.

4. Four V1 tools

get_listing_analysis

Combines normalized listing facts, stored Deal Score, Market Value, Buy Confidence, Data Confidence, live ownership cost, source provenance, missing fields, and summarized exact price history.

This replaces separate listing, analysis, provenance, ownership cost, and listing history tools.

Maximum result:

1. One listing.
2. Twenty equipment labels.
3. Six hundred description characters only when requested.
4. Thirty historical events, normally summarized into a few changes.

Existing code to reuse:

1. vehicle-listing-repository.ts for listing projections and ordered retrieval.
2. ownership-cost-estimate.ts for the live ownership estimate.
3. ListingObservation for exact history.

analyse_listing_market

Combines market cohort statistics and nearby comparables for one target listing.

Returns:

1. Exact cohort definition.
2. Sample size.
3. Median and quartiles.
4. Target price position.
5. Adjusted market value where defensible.
6. Up to ten closest comparable listings.
7. Fallback and confidence warnings.

Existing code to reuse:

1. comparable-valuation.ts.
2. price-plausibility.ts.
3. Representative physical vehicle policy.
4. The cohort concepts from listing-analysis-repository.ts.

This tool gives the AI enough evidence to challenge Deal Score without requiring several calls.

search_inventory

Filters the complete active inventory in PostgreSQL and returns a small candidate set.

Maximum result:

1. The database may filter the entire catalog.
2. The application may rank up to 300 matching rows.
3. The model receives at most twenty compact candidates.
4. The model may request details for at most five finalists.

Existing code to reuse:

1. Search filter types and validation concepts.
2. searchText and its trigram index.
3. isVehicleRepresentative.
4. Catalog facets and freshness watermark.

Candidate selection should use several deterministic views rather than only Deal Score: independent price position, mileage, model year, ownership estimate, data confidence, and listing freshness.

compare_listings

Loads two or three cars and produces one compact comparison matrix.

Returns:

1. Purchase price.
2. Model year and mileage.
3. Powertrain and body style.
4. Stored Carnalys scores.
5. Independent market position.
6. Live ownership estimate.
7. Important missing information.
8. Price history summary.

The tool does not declare a winner. The model chooses based on the user priorities.

5. Simplified request flow