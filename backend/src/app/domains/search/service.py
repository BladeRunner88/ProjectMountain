"""Search rules."""

from app.domains.graph.display import display_name
from app.domains.search.ranking import rank_object
from app.domains.search.repository import SearchRepository
from app.domains.search.schemas import SearchHit

# Capped server-side. Search is a navigation aid, not an export.
MAX_RESULTS = 20


class SearchService:
    def __init__(self, repository: SearchRepository) -> None:
        self._repository = repository

    def search(self, query: str) -> list[SearchHit]:
        normalised = query.strip().lower()
        if not normalised:
            return []

        connections = self._repository.connection_counts()
        aliases_by_object = self._repository.aliases_by_object()

        ranked: list[tuple[int, SearchHit]] = []
        for row in self._repository.all_objects():
            name = display_name(row.properties_json, row.id)
            # An alias identical to the canonical name is not an alternative spelling.
            aliases = [a for a in aliases_by_object.get(row.id, set()) if a != name]

            match = rank_object(normalised, name, aliases, row.properties_json)
            if match is None:
                continue

            ranked.append(
                (
                    match.rank,
                    SearchHit(
                        id=row.id,
                        type=row.type,
                        name=name,
                        connections=connections.get(row.id, 0),
                        matched_alias=match.matched_alias,
                    ),
                )
            )

        # Best rank first; within a rank the best-connected entity is the more useful one.
        ranked.sort(key=lambda entry: (entry[0], -entry[1].connections))
        return [hit for _, hit in ranked[:MAX_RESULTS]]
