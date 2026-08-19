"""How an entity is labelled for a human."""

from app.domains.graph.display import display_name


def test_name_wins_over_every_other_property() -> None:
    assert display_name({"name": "Ada", "title": "Dr", "account_ref": "****1234"}, "id-1") == "Ada"


def test_title_is_used_when_there_is_no_name() -> None:
    assert display_name({"title": "Book of Ur"}, "id-1") == "Book of Ur"


def test_a_masked_reference_is_the_last_resort_before_the_raw_id() -> None:
    assert display_name({"account_ref": "****1234"}, "id-1") == "****1234"


def test_the_id_is_shown_when_nothing_identifies_the_object() -> None:
    assert display_name({"market": "UK"}, "id-1") == "id-1"


def test_an_empty_name_falls_through_rather_than_rendering_blank() -> None:
    assert display_name({"name": "", "title": "Fallback"}, "id-1") == "Fallback"


def test_a_non_string_name_is_stringified() -> None:
    assert display_name({"name": 42}, "id-1") == "42"
