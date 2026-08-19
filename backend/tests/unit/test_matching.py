"""The four ways records with no shared key are matched."""

from app.pipeline.resolve.matching import (
    match_by_suffix,
    normalised_name,
    numeric_core,
    suffix,
    unmask,
)


def test_casing_and_padding_do_not_make_two_machines() -> None:
    variants = ["BOD-0002", "bod-0002", " BOD-0002 ", "  BOD-0002"]

    assert len({normalised_name(v) for v in variants}) == 1


def test_internal_spacing_is_collapsed_not_stripped() -> None:
    """`BOD 0002` and `BOD-0002` are different machines and must stay different."""
    assert normalised_name("BOD  0002") == "bod 0002"
    assert normalised_name("BOD-0002") == "bod-0002"


def test_the_contractor_reference_and_the_asset_tag_share_only_their_digits() -> None:
    assert numeric_core("EQ-000123-M") == numeric_core("AST-000123") == "000123"


def test_a_masked_reference_keeps_only_its_tail() -> None:
    assert unmask("****0123") == "0123"
    assert suffix("AST-000123") == "0123"


def test_one_candidate_resolves() -> None:
    tag, ambiguous = match_by_suffix("****0123", {"0123": ["AST-000123"]})

    assert tag == "AST-000123"
    assert ambiguous is False


def test_two_candidates_are_reported_as_ambiguous_not_guessed() -> None:
    tag, ambiguous = match_by_suffix("****0123", {"0123": ["AST-000123", "AST-010123"]})

    assert tag is None, "a wrong attribution is worse than an unresolved row"
    assert ambiguous is True


def test_no_candidate_is_unresolved_but_not_ambiguous() -> None:
    tag, ambiguous = match_by_suffix("****9999", {"0123": ["AST-000123"]})

    assert tag is None
    assert ambiguous is False
