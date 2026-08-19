"""The ontology, and the questions it claims to answer."""

from fastapi import APIRouter, status

from app.domains.ontology.deps import OntologyServiceDep
from app.domains.ontology.schemas import OntologySummary, QuestionAnswer

router = APIRouter(prefix="/ontology", tags=["ontology"])


@router.get("", status_code=status.HTTP_200_OK)
def get_ontology(service: OntologyServiceDep) -> OntologySummary:
    """Every declared object and relationship type, with live instance counts."""
    return service.summary()


@router.get("/questions", status_code=status.HTTP_200_OK)
def get_questions(service: OntologyServiceDep) -> list[QuestionAnswer]:
    """Each competency question, answered by running the query it carries."""
    return service.answers()
