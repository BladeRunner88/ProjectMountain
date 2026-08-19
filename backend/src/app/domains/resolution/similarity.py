"""Jaro similarity, matching the frontend implementation exactly.

Deliberately not rapidfuzz. The resolution surface displays the backend's score
alongside the frontend's own `jaroSimilarity`, and a 1e-9 difference between two
implementations makes the two halves of one screen disagree about the same pair. This is
a direct port of `features/ase/services/entityResolution.ts`, kept structurally identical
so the two stay comparable line by line.

Standard Jaro, not Jaro-Winkler: no common-prefix bonus. Case-insensitive.
"""


def jaro_similarity(left: str, right: str) -> float:
    """1.0 for identical strings, 0.0 for nothing in common."""
    first = left.lower()
    second = right.lower()
    if first == second:
        return 1.0
    len_first = len(first)
    len_second = len(second)
    if len_first == 0 or len_second == 0:
        return 0.0

    match_distance = max(0, max(len_first, len_second) // 2 - 1)
    first_matches = [False] * len_first
    second_matches = [False] * len_second
    matches = 0

    for index in range(len_first):
        start = max(0, index - match_distance)
        end = min(index + match_distance + 1, len_second)
        for other in range(start, end):
            if second_matches[other] or first[index] != second[other]:
                continue
            first_matches[index] = True
            second_matches[other] = True
            matches += 1
            break

    if matches == 0:
        return 0.0

    transpositions = 0
    cursor = 0
    for index in range(len_first):
        if not first_matches[index]:
            continue
        while not second_matches[cursor]:
            cursor += 1
        if first[index] != second[cursor]:
            transpositions += 1
        cursor += 1

    half_transpositions = transpositions / 2
    return (
        matches / len_first + matches / len_second + (matches - half_transpositions) / matches
    ) / 3
