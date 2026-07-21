# Data structures

- Because events may be a series—intentionally or as an emergent property—maybe it would be helpful to capture this in a the data? The thought came to me looking at `November 2025 Music in the Garden` and `July 2025 Music in the Garden`, where the date is added into the title to help make the distinction between these two events.
  - I think we can harmlessly move duplicate info (like the date) out of the title and link together events that–if not of a similar theme—are at least were under the same banner. Maybe take like the Martha's Table events.
  - From the data side, if no series exists, no problem. If a series does exist, now that relationship can be made clearer at scale.

# important nouns

## Artefacts

- have their own description
- may have 1 OR 0 event
- dated - precise OR range, encompassing one or several seasons

## Events

- have their own description
- may have N OR 0 artefacts
- dated (precise)

# TODO

- when adding an Artefact
  - use the inputted date to percolate likely events to the top of the Events drop-down
