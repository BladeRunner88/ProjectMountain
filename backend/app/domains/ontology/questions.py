"""Competency questions — what the ontology claims to be able to answer.

Each one carries the SQL that answers it. That is the whole point: a competency question
whose answer is a hardcoded string proves nothing, and a reader is entitled to run the
query themselves. `/ontology/questions` executes these against the live warehouse.
"""

from dataclasses import dataclass

from app.pipeline.manifest import (
    CONTRACTOR_FILE,
    MAINTENANCE_FILE,
    MES_FILE,
    QC_INLINE_FILE,
    QC_LAB_FILE,
    SCADA_FILE,
)


@dataclass(frozen=True)
class CompetencyQuestion:
    id: str
    question: str
    sql: str
    unit: str | None
    source_files: tuple[str, ...]


QUESTIONS: tuple[CompetencyQuestion, ...] = (
    CompetencyQuestion(
        id="machines-per-plant",
        question="How many machines does each plant run?",
        sql=("SELECT count(*) FROM graph.objects WHERE type = 'Machine'"),
        unit="machines",
        source_files=(MES_FILE,),
    ),
    CompetencyQuestion(
        id="registered-more-than-once",
        question="How many machines were registered under more than one asset tag?",
        sql=(
            "SELECT value FROM main.resolution_stats "
            "WHERE key = 'machines_registered_more_than_once'"
        ),
        unit="machines",
        source_files=(MES_FILE,),
    ),
    CompetencyQuestion(
        id="which-supplier-for-a-part",
        question="Which supplier provides a given part?",
        sql=("SELECT count(*) FROM graph.links WHERE rel_type = 'SUPPLIED_BY'"),
        unit="components",
        source_files=(SCADA_FILE,),
    ),
    CompetencyQuestion(
        id="batches-traceable-to-a-machine",
        question="Can every inspected batch be traced back to the machine that produced it?",
        sql=("SELECT count(*) FROM graph.links WHERE rel_type = 'PRODUCED_ON'"),
        unit="batches",
        source_files=(QC_INLINE_FILE, QC_LAB_FILE),
    ),
    CompetencyQuestion(
        id="work-orders-without-a-machine",
        question="Are there work orders that cannot be matched to a machine?",
        sql=(
            "SELECT coalesce("
            "  (SELECT value FROM main.resolution_stats WHERE key = 'work_orders_unresolved'),"
            "  0)"
        ),
        unit="work orders",
        source_files=(MAINTENANCE_FILE,),
    ),
    CompetencyQuestion(
        id="assets-never-serviced",
        question="Which assets has no contractor ever visited?",
        sql=(
            "SELECT coalesce("
            "  (SELECT value FROM main.resolution_stats WHERE key = 'callouts_unresolved'),"
            "  0)"
        ),
        unit="callouts",
        source_files=(CONTRACTOR_FILE,),
    ),
    CompetencyQuestion(
        id="sensors-per-machine",
        question="Which sensors are mounted on which machines?",
        sql="SELECT count(*) FROM graph.links WHERE rel_type = 'MOUNTED_ON'",
        unit="sensors",
        source_files=(SCADA_FILE,),
    ),
    CompetencyQuestion(
        id="timestamps-assumed",
        question="How many timestamps required a timezone to be assumed?",
        sql="SELECT value FROM main.pipeline_stats WHERE key = 'timestamps_assumed_tz'",
        unit="timestamps",
        source_files=(SCADA_FILE, QC_LAB_FILE, MAINTENANCE_FILE),
    ),
    CompetencyQuestion(
        id="unit-conversions",
        question="How many recorded quantities had to be converted to a common unit?",
        sql="SELECT value FROM main.pipeline_stats WHERE key = 'unit_conversions'",
        unit="quantities",
        source_files=(QC_INLINE_FILE, QC_LAB_FILE),
    ),
    CompetencyQuestion(
        id="rows-that-would-not-parse",
        question="How many rows did the feeds offer that could not be parsed?",
        sql="SELECT value FROM main.pipeline_stats WHERE key = 'records_failed_to_parse'",
        unit="rows",
        source_files=(QC_LAB_FILE,),
    ),
)
