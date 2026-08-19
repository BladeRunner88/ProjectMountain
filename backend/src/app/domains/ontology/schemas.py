"""Wire contract for the ontology."""

from pydantic import BaseModel, Field

from app.core.traced import Traced


class PropertyDef(BaseModel):
    """One property an object type declares."""

    name: str


class ObjectTypeSummary(BaseModel):
    """A kind of thing, and how many of them the warehouse currently holds."""

    name: str
    properties: list[str]
    instance_count: int


class RelationshipTypeSummary(BaseModel):
    """A permitted edge, and how many currently exist."""

    name: str
    source: str
    target: str
    instance_count: int


class OntologySummary(BaseModel):
    """The whole schema, with live instance counts.

    Counts are queried, never stored: an ontology that reports how many machines it has
    without asking the database is an ontology that can be wrong without anyone noticing.
    """

    object_types: list[ObjectTypeSummary]
    relationship_types: list[RelationshipTypeSummary]
    object_type_count: int
    relationship_type_count: int


class QuestionAnswer(BaseModel):
    """A competency question, its answer, and the query that produced it."""

    id: str
    question: str
    answer: Traced[float | None] = Field(
        description="None when the query returned nothing — which is itself an answer"
    )
    can_answer: bool = Field(description="Whether the warehouse could answer at all")
    sql: str = Field(description="Run it yourself")
