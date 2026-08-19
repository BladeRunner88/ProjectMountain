"""Ontology assembly: the declared schema, joined to what actually exists."""

from app.core.traced import Traced, observed
from app.domains.ontology.catalog import OBJECT_TYPES, RELATIONSHIP_TYPES
from app.domains.ontology.questions import QUESTIONS
from app.domains.ontology.repository import OntologyRepository
from app.domains.ontology.schemas import (
    ObjectTypeSummary,
    OntologySummary,
    QuestionAnswer,
    RelationshipTypeSummary,
)

_COMPUTED_BY = "competency question"


class OntologyService:
    def __init__(self, repository: OntologyRepository) -> None:
        self._repository = repository

    def summary(self) -> OntologySummary:
        object_counts = self._repository.object_counts()
        link_counts = self._repository.link_counts()

        return OntologySummary(
            object_types=[
                ObjectTypeSummary(
                    name=object_type.name,
                    properties=list(object_type.properties),
                    # Zero is a real answer: a declared type nothing instantiates is
                    # exactly the kind of drift worth seeing.
                    instance_count=object_counts.get(object_type.name, 0),
                )
                for object_type in OBJECT_TYPES.values()
            ],
            relationship_types=[
                RelationshipTypeSummary(
                    name=relationship.name,
                    source=relationship.source,
                    target=relationship.target,
                    instance_count=link_counts.get(relationship.name, 0),
                )
                for relationship in RELATIONSHIP_TYPES.values()
            ],
            object_type_count=len(OBJECT_TYPES),
            relationship_type_count=len(RELATIONSHIP_TYPES),
        )

    def answers(self) -> list[QuestionAnswer]:
        """Every competency question, answered by running its own query."""
        return [
            QuestionAnswer(
                id=question.id,
                question=question.question,
                answer=self._answer(question.sql, question.unit, list(question.source_files)),
                can_answer=self._repository.answer(question.sql) is not None,
                sql=question.sql,
            )
            for question in QUESTIONS
        ]

    def _answer(self, sql: str, unit: str | None, source_files: list[str]) -> Traced[float | None]:
        return observed(
            self._repository.answer(sql),
            unit=unit,
            source_files=source_files,
            computed_by=_COMPUTED_BY,
        )
