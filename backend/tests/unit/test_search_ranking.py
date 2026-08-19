"""Search ranking, tested without a database."""

from app.domains.search.ranking import (
    ALIAS_PREFIX,
    ALIAS_SUBSTRING,
    NAME_PREFIX,
    NAME_SUBSTRING,
    PROPERTY_SUBSTRING,
    rank_object,
)


def test_a_canonical_name_prefix_outranks_everything() -> None:
    match = rank_object("acme", "Acme Holdings", ["zzz"], {"market": "acme"})

    assert match is not None
    assert match.rank == NAME_PREFIX
    assert match.matched_alias is None


def test_a_name_substring_ranks_below_a_prefix() -> None:
    match = rank_object("holdings", "Acme Holdings", [], {})

    assert match is not None
    assert match.rank == NAME_SUBSTRING


def test_an_alias_match_reports_which_spelling_hit() -> None:
    match = rank_object("acm", "Canonical Name", ["ACM_Corp", "other"], {})

    assert match is not None
    assert match.rank == ALIAS_PREFIX
    assert match.matched_alias == "ACM_Corp"


def test_an_alias_substring_ranks_below_an_alias_prefix() -> None:
    match = rank_object("corp", "Canonical Name", ["ACM_Corp"], {})

    assert match is not None
    assert match.rank == ALIAS_SUBSTRING
    assert match.matched_alias == "ACM_Corp"


def test_a_property_match_is_the_weakest_signal() -> None:
    match = rank_object("sweden", "Canonical Name", [], {"market": "Sweden"})

    assert match is not None
    assert match.rank == PROPERTY_SUBSTRING
    assert match.matched_alias is None


def test_name_properties_are_not_re_examined_as_property_matches() -> None:
    """`name` and `title` are already covered by the name ladder.

    Re-checking them would let an object that failed the name test come back as a
    weaker property match, which would be the same hit reported twice at two ranks.
    """
    assert rank_object("zzz", "Acme", [], {"name": "Acme", "title": "Acme"}) is None


def test_a_null_property_never_matches() -> None:
    assert rank_object("none", "Acme", [], {"market": None}) is None


def test_no_match_returns_none() -> None:
    assert rank_object("absent", "Acme", ["alias"], {"market": "UK"}) is None
