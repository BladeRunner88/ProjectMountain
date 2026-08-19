"""The thresholds the findings engine fires at.

Gathered in one module because they are the knobs a reader is most likely to want to
inspect, and because a detector that fires too readily teaches people to ignore it.
"""

# A release-rate drop has to clear this to be reported. Deliberately strict.
RATE_SHIFT_Z = -4.0
RATE_SHIFT_WINDOW_DAYS = 5
RATE_SHIFT_MIN_SAMPLE = 25
# A plant needs this much history before a rolling window means anything.
RATE_SHIFT_MIN_DAYS = RATE_SHIFT_WINDOW_DAYS + 10

VOLUME_ANOMALY_Z = 2.5

DIVERGENCE_MIN_RUNS = 3

# A gap counts as silence only if it is both far longer than normal for that supplier and
# long in absolute terms — either alone is noise.
SILENCE_GAP_MULTIPLE = 15
SILENCE_MIN_MINUTES = 240
SILENCE_MIN_OBSERVATIONS = 20

CO_OCCURRENCE_WINDOW_MINUTES = 180
PEAK_BUCKET_MINUTES = 15
