from app.scs import MIN_VISIBLE_INDICATORS, STRESS_THRESHOLD, SCS_INDICATORS, apply_scs_rule, normalize_indicator_answer, parse_vlm_json

KEYS = [i["key"] for i in SCS_INDICATORS]


def answers(ya=0, tidak=0):
    vals = ["YA"] * ya + ["TIDAK"] * tidak
    vals += ["TIDAK_TERLIHAT"] * (7 - len(vals))
    return dict(zip(KEYS, vals))


def test_constants_unchanged():
    assert STRESS_THRESHOLD == 3 and MIN_VISIBLE_INDICATORS == 5 and len(KEYS) == 7


def test_rule_stress_not_stress_undefined():
    assert apply_scs_rule(answers(ya=3, tidak=4))[3] == "stress"
    assert apply_scs_rule(answers(ya=2, tidak=5))[3] == "not_stress"
    assert apply_scs_rule(answers(ya=4, tidak=0))[3] == "undefined"  # only 4 visible


def test_normalize_and_parse():
    assert normalize_indicator_answer("ya, jelas") == "YA"
    assert normalize_indicator_answer("tidak terlihat") == "TIDAK_TERLIHAT"
    assert normalize_indicator_answer("???") == "TIDAK_TERLIHAT"
    assert parse_vlm_json('x {"indicators": {}} y') == {"indicators": {}}
