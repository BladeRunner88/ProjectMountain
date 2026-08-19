"""Ontology dependencies."""

from typing import Annotated

from fastapi import Depends

from app.api.deps import WarehouseSessionDep
from app.domains.ontology.repository import OntologyRepository
from app.domains.ontology.service import OntologyService


def get_ontology_service(session: WarehouseSessionDep) -> OntologyService:
    return OntologyService(OntologyRepository(session))


OntologyServiceDep = Annotated[OntologyService, Depends(get_ontology_service)]
